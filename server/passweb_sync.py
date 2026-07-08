"""
Touché!Passweb — Modulo di sincronizzazione e Single Sign-On
=============================================================
Gestisce:
  1. sync_user_to_platforms()  → chiama l'API REST /passweb/sync su ogni piattaforma
  2. revoke_platform_user()    → chiama l'API REST /passweb/revoke su ogni piattaforma
  3. platform_status()         → chiama l'API REST /passweb/status su ogni piattaforma
  4. generate_passweb_token()  → crea un token JWT-like firmato HMAC-SHA256
  5. verify_passweb_token()    → verifica e decodifica il token
  6. build_autologin_url()     → costruisce l'URL di auto-login per ogni piattaforma

Comunicazione con le piattaforme via HTTP con autenticazione HMAC:
  Header: X-Passweb-Secret: <TOUCHESUITE_SECRET>
  Ogni piattaforma verifica l'header con hmac.compare_digest prima di agire.

TOKEN FORMAT (payload JSON base64url, firma HMAC-SHA256):
  header.payload.signature
  payload: { uid, username, email, platform, exp, iat, nonce }
"""

import hashlib, hmac, json, base64, time, os, logging
import urllib.request, urllib.error

log = logging.getLogger('passweb')

# ─── URL delle piattaforme ────────────────────────────────────────────────────
PLATFORM_URLS = {
    'touche':      os.environ.get('URL_TOUCHE',      'https://fencetouche.pythonanywhere.com'),
    'mydt':        os.environ.get('URL_MYDT',        'https://mydt.pythonanywhere.com'),
    'classtouche': os.environ.get('URL_CLASSTOUCHE', 'https://classtouche.pythonanywhere.com'),
    'videotouche': os.environ.get('URL_VIDEOTOUCHE', 'https://videotouche.pythonanywhere.com'),
    'doctouche':   os.environ.get('URL_DOCTOUCHE',   'https://doctouche.pythonanywhere.com'),
}

# Chiave segreta condivisa — impostare TOUCHESUITE_SECRET come var. d'ambiente
SHARED_SECRET = os.environ.get('TOUCHESUITE_SECRET', 'CHANGE_ME_IN_PRODUCTION_touchesuite_2025')

TOKEN_TTL = 120  # secondi di validità del token SSO

# ─── HMAC token ───────────────────────────────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + '=' * (pad % 4))

def generate_passweb_token(uid: int, username: str, email: str, platform: str) -> str:
    """Genera un token SSO firmato per il login automatico su una piattaforma."""
    payload = {
        'uid':      uid,
        'username': username,
        'email':    email,
        'platform': platform,
        'iat':      int(time.time()),
        'exp':      int(time.time()) + TOKEN_TTL,
        'nonce':    _b64url(os.urandom(8)),
    }
    header_b64  = _b64url(json.dumps({'alg': 'HS256', 'typ': 'TSW'}).encode())
    payload_b64 = _b64url(json.dumps(payload).encode())
    signing_input = f'{header_b64}.{payload_b64}'.encode()
    sig = hmac.new(SHARED_SECRET.encode(), signing_input, hashlib.sha256).digest()
    return f'{header_b64}.{payload_b64}.{_b64url(sig)}'

def verify_passweb_token(token: str, platform: str) -> dict | None:
    """
    Verifica un token SSO. Ritorna il payload se valido, None altrimenti.
    Da usare nelle singole piattaforme Flask sull'endpoint /autologin.
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f'{header_b64}.{payload_b64}'.encode()
        expected_sig = hmac.new(SHARED_SECRET.encode(), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url_decode(sig_b64), expected_sig):
            log.warning('Passweb: firma non valida')
            return None
        payload = json.loads(_b64url_decode(payload_b64))
        if payload.get('platform') != platform:
            log.warning('Passweb: platform mismatch')
            return None
        if payload.get('exp', 0) < time.time():
            log.warning('Passweb: token scaduto')
            return None
        return payload
    except Exception as e:
        log.error(f'Passweb verify error: {e}')
        return None

def build_autologin_url(uid: int, username: str, email: str, platform: str) -> str | None:
    """Costruisce l'URL di auto-login per la piattaforma richiesta."""
    base = PLATFORM_URLS.get(platform)
    if not base:
        return None
    token = generate_passweb_token(uid, username, email, platform)
    return f'{base.rstrip("/")}/autologin?ts_token={token}'

# ─── CHIAMATE API REST ────────────────────────────────────────────────────────

def _api_call(platform: str, endpoint: str, payload: dict) -> str:
    """
    Chiama un endpoint Passweb su una piattaforma remota.
    Ritorna 'ok', 'http_error: ...', 'connessione_fallita: ...', ecc.
    """
    base = PLATFORM_URLS.get(platform, '').rstrip('/')
    if not base:
        return 'url_non_configurato'

    url = f'{base}{endpoint}'
    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            'Content-Type':     'application/json',
            'X-Passweb-Secret': SHARED_SECRET,
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return 'ok' if data.get('ok') else f'errore: {data.get("error", "sconosciuto")}'
    except urllib.error.HTTPError as e:
        try:
            body_err = json.loads(e.read().decode())
            return f'http_{e.code}: {body_err.get("error", e.reason)}'
        except Exception:
            return f'http_{e.code}: {e.reason}'
    except urllib.error.URLError as e:
        return f'connessione_fallita: {e.reason}'
    except Exception as e:
        return f'errore: {e}'

def _api_get(platform: str, endpoint: str, params: dict) -> dict | None:
    """GET con query string per platform_status."""
    import urllib.parse
    base = PLATFORM_URLS.get(platform, '').rstrip('/')
    if not base:
        return None
    qs = urllib.parse.urlencode(params)
    url = f'{base}{endpoint}?{qs}'
    req = urllib.request.Request(
        url,
        headers={'X-Passweb-Secret': SHARED_SECRET},
        method='GET',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        log.error(f'Passweb status {platform}: {e}')
        return None

# ─── FUNZIONI PUBBLICHE ───────────────────────────────────────────────────────

def _uname(user: dict, platform: str) -> str:
    override = user.get(f'{platform}_username')
    return override if override else user['username']

def hash_password(pw: str) -> str:
    import hashlib as _h
    return _h.sha256(pw.encode()).hexdigest()

def secrets_token() -> str:
    import secrets as _s
    return _s.token_hex(16)

def sync_user_to_platforms(user: dict, platforms: list, password_plaintext: str | None = None) -> dict:
    """
    Sincronizza l'utente verso le piattaforme via API REST.
    Ritorna { platform: 'ok' | 'errore: ...' | ... }
    """
    results = {}
    ph = hash_password(password_plaintext) if password_plaintext else None

    for platform in platforms:
        payload = {
            'username':         _uname(user, platform),
            'email':            user.get('email', ''),
            'nome':             user.get('nome') or '',
            'cognome':          user.get('cognome') or '',
            'attivo':           1 if user.get('stato') == 'attivo' else 0,
            'tessera_federale': user.get('tessera_federale') or 'N/D',
        }
        if ph:
            payload['password_hash'] = ph

        results[platform] = _api_call(platform, '/passweb/sync', payload)

    return results

def revoke_platform_user(user: dict, platforms: list) -> dict:
    """Disattiva l'utente su tutte le piattaforme via API REST."""
    results = {}
    for platform in platforms:
        payload = {
            'username': _uname(user, platform),
            'email':    user.get('email', ''),
        }
        result = _api_call(platform, '/passweb/revoke', payload)
        results[platform] = 'revocato' if result == 'ok' else result
    return results

def platform_status(user: dict) -> dict:
    """
    Controlla se l'utente esiste sulle piattaforme via API REST.
    Ritorna { platform: 'presente' | 'assente' | 'irraggiungibile' }
    """
    status = {}
    for platform in PLATFORM_URLS:
        params = {
            'username': _uname(user, platform),
            'email':    user.get('email', ''),
        }
        data = _api_get(platform, '/passweb/status', params)
        if data is None:
            status[platform] = 'irraggiungibile'
        else:
            status[platform] = 'presente' if data.get('presente') else 'assente'
    return status
