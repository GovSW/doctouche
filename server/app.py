"""
DocTouché! — Server di sincronizzazione
=========================================
Da deployare su PythonAnywhere in /home/doctouche/doctouche-server/
Si appoggia al modulo passweb_sync.py (Touché! PassWeb, già esistente in
home/touchesuite/touchesuite) per autenticazione e gestione utenti/organizzazioni,
e al modulo database.py (Database) per la persistenza locale dei documenti.

Endpoint principali:
  POST /passweb/sync              (chiamato DA touchesuite verso doctouche)
  POST /passweb/revoke
  GET  /passweb/status
  GET  /autologin                 (SSO da PassWeb)

  POST /api/documenti/sync
  GET  /api/documenti/recenti
  POST /api/documenti/condividi
  GET  /api/fascicoli
  GET  /api/normativa/cerca
  POST /api/workflow/invia
  POST /api/organizzazioni/richiedi
  POST /api/organizzazioni/approva   (solo admin)
"""

import hmac, os, sqlite3
from flask import Flask, request, jsonify, g
from functools import wraps

from database import Database
import passweb_sync as passweb  # il modulo che hai già fornito

app = Flask(__name__)
db = Database()

SHARED_SECRET = os.environ.get('TOUCHESUITE_SECRET', 'CHANGE_ME_IN_PRODUCTION_touchesuite_2025')

# ─── Decoratori di sicurezza ────────────────────────────────────────────────

def require_passweb_secret(fn):
    """Protegge gli endpoint chiamati dalle altre piattaforme Touché! (S2S)."""
    @wraps(fn)
    def wrapper(*a, **kw):
        secret = request.headers.get('X-Passweb-Secret', '')
        if not hmac.compare_digest(secret, SHARED_SECRET):
            return jsonify({'ok': False, 'error': 'secret_non_valido'}), 401
        return fn(*a, **kw)
    return wrapper


def require_session(fn):
    """Protegge gli endpoint applicativi (chiamati dal client Electron)."""
    @wraps(fn)
    def wrapper(*a, **kw):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'ok': False, 'error': 'non_autenticato'}), 401
        token = auth.split(' ', 1)[1]
        payload = passweb.verify_passweb_token(token, 'doctouche')
        if not payload:
            return jsonify({'ok': False, 'error': 'token_non_valido_o_scaduto'}), 401
        g.user = payload
        return fn(*a, **kw)
    return wrapper


# ─── Passweb: endpoint S2S richiesti dal modulo sync ───────────────────────

@app.route('/passweb/sync', methods=['POST'])
@require_passweb_secret
def passweb_sync():
    data = request.get_json(force=True)
    conn = db.get_connection()
    cur = conn.cursor()
    cur.execute('SELECT id FROM utenti WHERE email = ?', (data.get('email'),))
    row = cur.fetchone()
    if row:
        cur.execute(
            'UPDATE utenti SET nome=?, cognome=? WHERE id=?',
            (data.get('nome'), data.get('cognome'), row['id'])
        )
    else:
        cur.execute(
            'INSERT INTO utenti (email, password_hash, nome, cognome) VALUES (?,?,?,?)',
            (data.get('email'), data.get('password_hash', ''), data.get('nome'), data.get('cognome'))
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/passweb/revoke', methods=['POST'])
@require_passweb_secret
def passweb_revoke():
    data = request.get_json(force=True)
    conn = db.get_connection()
    conn.execute('UPDATE utenti SET ultimo_accesso = NULL WHERE email = ?', (data.get('email'),))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/passweb/status', methods=['GET'])
@require_passweb_secret
def passweb_status():
    email = request.args.get('email', '')
    conn = db.get_connection()
    row = conn.execute('SELECT id FROM utenti WHERE email = ?', (email,)).fetchone()
    conn.close()
    return jsonify({'presente': row is not None})


@app.route('/autologin', methods=['GET'])
def autologin():
    token = request.args.get('ts_token', '')
    payload = passweb.verify_passweb_token(token, 'doctouche')
    if not payload:
        return jsonify({'ok': False, 'error': 'token_non_valido'}), 401
    # In un client Electron l'autologin avviene tramite deep-link / protocollo custom
    # doctouche://autologin?token=... intercettato dal main process.
    return jsonify({'ok': True, 'user': payload})


# ─── API applicative ─────────────────────────────────────────────────────

@app.route('/api/documenti/sync', methods=['POST'])
@require_session
def documenti_sync():
    data = request.get_json(force=True)
    # TODO: upsert reale nella tabella documenti (da aggiungere allo schema Database)
    return jsonify({'ok': True, 'id': data.get('id') or 1})


@app.route('/api/documenti/recenti', methods=['GET'])
@require_session
def documenti_recenti():
    return jsonify([])


@app.route('/api/documenti/condividi', methods=['POST'])
@require_session
def documenti_condividi():
    data = request.get_json(force=True)
    # TODO: tabella condivisioni (documento_id, email, ruolo: viewer|editor|owner)
    return jsonify({'ok': True})


@app.route('/api/fascicoli', methods=['GET'])
@require_session
def fascicoli_list():
    conn = db.get_connection()
    rows = conn.execute(
        'SELECT id, numero_fascicolo, anno, titolo FROM fascicoli WHERE user_id = ?',
        (g.user['uid'],)
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/normativa/cerca', methods=['GET'])
@require_session
def normativa_cerca():
    q = f"%{request.args.get('q', '')}%"
    conn = db.get_connection()
    rows = conn.execute('''
        SELECT id, titolo, riferimento, categoria FROM normativa
        WHERE titolo LIKE ? OR testo LIKE ? OR riferimento LIKE ?
        ORDER BY titolo LIMIT 20
    ''', (q, q, q)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/workflow/invia', methods=['POST'])
@require_session
def workflow_invia():
    data = request.get_json(force=True)
    conn = db.get_connection()

    # Se non è specificato un organo singolo, usa l'intero organigramma configurato
    # come sequenza di step approvativi (step_corrente parte da 1).
    organo = data.get('organo')
    if not organo:
        primo = conn.execute('SELECT nome FROM organigramma ORDER BY ordine LIMIT 1').fetchone()
        organo = primo['nome'] if primo else 'Approvazione'

    conn.execute(
        'INSERT INTO workflow_approvazioni (documento_id, organo, stato, step_corrente) VALUES (?,?,?,1)',
        (data.get('documento_id'), organo, 'in_attesa')
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'organo': organo})


@app.route('/api/workflow/approva-step', methods=['POST'])
@require_session
def workflow_approva_step():
    """Approva lo step corrente e avanza al prossimo organo dell'organigramma,
    oppure segna il workflow come completato se era l'ultimo step."""
    data = request.get_json(force=True)
    conn = db.get_connection()
    wf = conn.execute('SELECT * FROM workflow_approvazioni WHERE id = ?', (data.get('workflow_id'),)).fetchone()
    if not wf:
        conn.close()
        return jsonify({'ok': False, 'error': 'workflow_non_trovato'}), 404

    organi = conn.execute('SELECT nome FROM organigramma ORDER BY ordine').fetchall()
    next_step = wf['step_corrente'] + 1
    if next_step <= len(organi):
        prossimo_organo = organi[next_step - 1]['nome']
        conn.execute(
            'UPDATE workflow_approvazioni SET step_corrente=?, organo=?, stato=? WHERE id=?',
            (next_step, prossimo_organo, 'in_attesa', wf['id'])
        )
        stato_finale = 'in_attesa'
    else:
        conn.execute('UPDATE workflow_approvazioni SET stato=? WHERE id=?', ('approvato', wf['id']))
        stato_finale = 'approvato'

    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'stato': stato_finale})


@app.route('/api/organizzazioni/richiedi', methods=['POST'])
@require_session
def organizzazioni_richiedi():
    data = request.get_json(force=True)
    conn = db.get_connection()
    conn.execute(
        'INSERT INTO enti (user_id, nome, descrizione) VALUES (?,?,?)',
        (g.user['uid'], data.get('nome'), data.get('descrizione', ''))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True, 'stato': 'in_attesa_approvazione'})


@app.route('/api/organizzazioni/approva', methods=['POST'])
@require_session
@require_admin
def organizzazioni_approva():
    return jsonify({'ok': True})


# ─── Admin: ruolo ──────────────────────────────────────────────────────────

def _is_admin(uid):
    conn = db.get_connection()
    row = conn.execute('SELECT ruolo FROM utenti WHERE id = ?', (uid,)).fetchone()
    conn.close()
    return bool(row) and row['ruolo'] == 'admin'


def require_admin(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if not _is_admin(g.user['uid']):
            return jsonify({'ok': False, 'error': 'permessi_insufficienti'}), 403
        return fn(*a, **kw)
    return wrapper


# ─── Admin: utenti ──────────────────────────────────────────────────────────

@app.route('/api/admin/utenti', methods=['GET'])
@require_session
@require_admin
def admin_utenti():
    conn = db.get_connection()
    rows = conn.execute('SELECT id, email, nome, cognome, ente_predefinito, attivo FROM utenti').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/utenti/<int:uid>/toggle', methods=['POST'])
@require_session
@require_admin
def admin_utente_toggle(uid):
    conn = db.get_connection()
    conn.execute('UPDATE utenti SET attivo = NOT COALESCE(attivo, 0) WHERE id = ?', (uid,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/admin/utenti/<int:uid>/revoke', methods=['POST'])
@require_session
@require_admin
def admin_utente_revoke(uid):
    conn = db.get_connection()
    row = conn.execute('SELECT email FROM utenti WHERE id = ?', (uid,)).fetchone()
    conn.close()
    if row:
        passweb.revoke_platform_user({'email': row['email'], 'username': row['email']},
                                      list(passweb.PLATFORM_URLS.keys()))
    return jsonify({'ok': True})


# ─── Admin: organizzazioni ──────────────────────────────────────────────────

@app.route('/api/admin/organizzazioni', methods=['GET'])
@require_session
@require_admin
def admin_organizzazioni():
    conn = db.get_connection()
    rows = conn.execute('''
        SELECT enti.id, enti.nome,
               COALESCE(enti.stato, 'in_attesa') AS stato,
               utenti.email AS richiedente_email
        FROM enti LEFT JOIN utenti ON utenti.id = enti.user_id
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/organizzazioni/<int:oid>/approva', methods=['POST'])
@require_session
@require_admin
def admin_org_approva(oid):
    conn = db.get_connection()
    conn.execute('UPDATE enti SET stato = ? WHERE id = ?', ('approvato', oid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/api/admin/organizzazioni/<int:oid>/rifiuta', methods=['POST'])
@require_session
@require_admin
def admin_org_rifiuta(oid):
    conn = db.get_connection()
    conn.execute('UPDATE enti SET stato = ? WHERE id = ?', ('rifiutato', oid))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── Admin: organigramma workflow approvativo ──────────────────────────────

@app.route('/api/admin/organigramma', methods=['GET'])
@require_session
def admin_organigramma_get():
    conn = db.get_connection()
    rows = conn.execute('SELECT ordine, nome FROM organigramma ORDER BY ordine').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/admin/organigramma', methods=['POST'])
@require_session
@require_admin
def admin_organigramma_set():
    data = request.get_json(force=True)
    conn = db.get_connection()
    conn.execute('DELETE FROM organigramma')
    for node in data.get('nodes', []):
        conn.execute('INSERT INTO organigramma (ordine, nome) VALUES (?,?)', (node['ordine'], node['nome']))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── Normativa: banca dati completa (CRUD base) ────────────────────────────

@app.route('/api/normativa/tutte', methods=['GET'])
@require_session
def normativa_tutte():
    conn = db.get_connection()
    rows = conn.execute('SELECT id, titolo, riferimento, categoria FROM normativa ORDER BY titolo').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route('/api/normativa/aggiungi', methods=['POST'])
@require_session
def normativa_aggiungi():
    data = request.get_json(force=True)
    conn = db.get_connection()
    conn.execute(
        'INSERT INTO normativa (titolo, testo, riferimento, categoria) VALUES (?,?,?,?)',
        (data.get('titolo'), data.get('testo', ''), data.get('riferimento', ''), data.get('categoria', ''))
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


# ─── Protocollo.net: broker di collegamento account ────────────────────────
# L'account reale vive su /home/protocollonetweb/protocollonet-web (PythonAnywhere).
# Questo server fa da broker: genera un URL di autorizzazione firmato che l'utente
# apre in popup; Protocollo.net, dopo il login, reindirizza a un endpoint di callback
# che salva il token di collegamento associato all'utente DocTouché.

PROTOCOLLONET_URL = os.environ.get('URL_PROTOCOLLONET', 'https://protocollonetweb.pythonanywhere.com')


@app.route('/api/protocollonet/connect-url', methods=['GET'])
@require_session
def protocollonet_connect_url():
    token = passweb.generate_passweb_token(g.user['uid'], g.user['username'], g.user['email'], 'doctouche')
    url = f'{PROTOCOLLONET_URL}/oauth/authorize?client=doctouche&state={token}'
    return jsonify({'connect_url': url})


@app.route('/api/protocollonet/callback', methods=['GET'])
def protocollonet_callback():
    """Chiamato da Protocollo.net dopo l'autorizzazione dell'utente."""
    state = request.args.get('state', '')
    proto_token = request.args.get('access_token', '')
    payload = passweb.verify_passweb_token(state, 'doctouche')
    if not payload:
        return 'Collegamento non valido o scaduto.', 400

    conn = db.get_connection()
    conn.execute(
        'INSERT OR REPLACE INTO protocollonet_link (user_id, access_token) VALUES (?,?)',
        (payload['uid'], proto_token)
    )
    conn.commit()
    conn.close()

    # Pagina che notifica la finestra opener e si chiude da sola.
    return '''
    <script>
      window.opener?.postMessage({ type: "protocollonet:connected", payload: { ok: true } }, "*");
      window.close();
    </script>
    Collegamento riuscito. Puoi chiudere questa finestra.
    '''


@app.route('/api/protocollonet/cerca', methods=['GET'])
@require_session
def protocollonet_cerca():
    q = request.args.get('q', '')
    conn = db.get_connection()
    link = conn.execute('SELECT access_token FROM protocollonet_link WHERE user_id = ?', (g.user['uid'],)).fetchone()
    conn.close()
    if not link:
        return jsonify({'ok': False, 'error': 'account_protocollonet_non_collegato'}), 400

    # Interrogazione reale dell'account Protocollo.net dell'utente.
    import urllib.request, urllib.parse, json as _json
    try:
        qs = urllib.parse.urlencode({'q': q})
        req = urllib.request.Request(
            f'{PROTOCOLLONET_URL}/api/protocolli/cerca?{qs}',
            headers={'Authorization': f"Bearer {link['access_token']}"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return jsonify(_json.loads(resp.read().decode()))
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 502


if __name__ == '__main__':
    app.run(debug=True)
