const form = document.getElementById('loginForm');
const errEl = document.getElementById('err');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    const { passweb } = await window.doctouche.getServerUrls();

    // Chiamata all'endpoint di autenticazione del PassWeb.
    // Ci si aspetta che il server ritorni { ok: true, user: {...}, session_token: '...' }
    const res = await fetch(`${passweb}/passweb/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, platform: 'doctouche' })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      errEl.textContent = body.error || 'Credenziali non valide.';
      return;
    }

    const data = await res.json();
    if (!data.ok) {
      errEl.textContent = data.error || 'Accesso negato.';
      return;
    }

    await window.doctouche.loginSuccess({
      user: data.user,
      token: data.session_token,
      loggedAt: Date.now()
    });
  } catch (err) {
    errEl.textContent = 'Impossibile contattare il server PassWeb (modalità offline: ' +
      'verifica connessione oppure usa un accesso già memorizzato).';
    console.error(err);
  }
});
