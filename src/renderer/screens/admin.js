let session, syncServer;

(async function init() {
  session = await window.doctouche.getSession();
  const urls = await window.doctouche.getServerUrls();
  syncServer = urls.syncServer;

  wireTabs();
  loadUtenti();
  loadOrganizzazioni();
  loadOrgchart();
  loadNormativa();

  document.getElementById('addOrganNode').addEventListener('click', addOrganNode);
  document.getElementById('saveOrgchart').addEventListener('click', saveOrgchart);
  document.getElementById('addNorm').addEventListener('click', addNorm);
})();

function wireTabs() {
  document.querySelectorAll('.atab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.p}`).classList.add('active');
    });
  });
}

async function authFetch(path, opts = {}) {
  return fetch(`${syncServer}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
      ...(opts.headers || {})
    }
  });
}

// ─── Utenti ─────────────────────────────────────────────────────────────────
async function loadUtenti() {
  try {
    const res = await authFetch('/api/admin/utenti');
    const list = res.ok ? await res.json() : [];
    const tbody = document.querySelector('#tblUtenti tbody');
    tbody.innerHTML = list.map(u => `
      <tr>
        <td>${u.nome || ''} ${u.cognome || ''}</td>
        <td>${u.email}</td>
        <td>${u.ente_predefinito || '—'}</td>
        <td><span class="badge ${u.attivo ? 'approved' : 'pending'}">${u.attivo ? 'Attivo' : 'Sospeso'}</span></td>
        <td>
          <button class="btn" data-act="toggle" data-id="${u.id}">${u.attivo ? 'Sospendi' : 'Riattiva'}</button>
          <button class="btn btn-danger" data-act="revoke" data-id="${u.id}">Revoca</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="5" style="opacity:.5">Nessun utente</td></tr>';

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => userAction(btn.dataset.act, btn.dataset.id));
    });
  } catch { /* offline */ }
}

async function userAction(action, id) {
  await authFetch(`/api/admin/utenti/${id}/${action}`, { method: 'POST' });
  loadUtenti();
}

// ─── Organizzazioni ─────────────────────────────────────────────────────────
async function loadOrganizzazioni() {
  try {
    const res = await authFetch('/api/admin/organizzazioni');
    const list = res.ok ? await res.json() : [];
    const tbody = document.querySelector('#tblOrg tbody');
    tbody.innerHTML = list.map(o => `
      <tr>
        <td>${o.nome}</td>
        <td>${o.richiedente_email || '—'}</td>
        <td><span class="badge ${o.stato === 'approvato' ? 'approved' : 'pending'}">${o.stato}</span></td>
        <td>
          ${o.stato !== 'approvato' ? `<button class="btn btn-primary" data-id="${o.id}" data-act="approva">Approva</button>
          <button class="btn btn-danger" data-id="${o.id}" data-act="rifiuta">Rifiuta</button>` : ''}
        </td>
      </tr>`).join('') || '<tr><td colspan="4" style="opacity:.5">Nessuna richiesta</td></tr>';

    tbody.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await authFetch(`/api/admin/organizzazioni/${btn.dataset.id}/${btn.dataset.act}`, { method: 'POST' });
        loadOrganizzazioni();
      });
    });
  } catch { /* offline */ }
}

// ─── Organigramma ───────────────────────────────────────────────────────────
async function loadOrgchart() {
  try {
    const res = await authFetch('/api/admin/organigramma');
    const nodes = res.ok ? await res.json() : [];
    const container = document.getElementById('orgchart');
    container.innerHTML = '';
    (nodes.length ? nodes : [{ ordine: 1, nome: '' }]).forEach(n => renderOrganNode(n.nome, n.ordine));
  } catch {
    renderOrganNode('', 1);
  }
}

function renderOrganNode(nome = '', ordine) {
  const container = document.getElementById('orgchart');
  const div = document.createElement('div');
  div.className = 'org-node';
  const idx = ordine || container.children.length + 1;
  div.innerHTML = `
    <span>${idx}.</span>
    <input type="text" value="${nome}" placeholder="Nome organo (es. Segreteria)">
    <button class="btn btn-danger" data-remove>Rimuovi</button>`;
  div.querySelector('[data-remove]').addEventListener('click', () => div.remove());
  container.appendChild(div);
}

function addOrganNode() { renderOrganNode('', document.getElementById('orgchart').children.length + 1); }

async function saveOrgchart() {
  const nodes = Array.from(document.querySelectorAll('.org-node')).map((div, i) => ({
    ordine: i + 1,
    nome: div.querySelector('input').value.trim()
  })).filter(n => n.nome);

  await authFetch('/api/admin/organigramma', {
    method: 'POST',
    body: JSON.stringify({ nodes })
  });
  window.doctouche.notify('Organigramma', 'Organigramma approvativo salvato.');
}

// ─── Normativa ──────────────────────────────────────────────────────────────
async function loadNormativa() {
  try {
    const res = await authFetch('/api/normativa/tutte');
    const list = res.ok ? await res.json() : [];
    document.querySelector('#tblNorm tbody').innerHTML = list.map(n => `
      <tr><td>${n.titolo}</td><td>${n.riferimento || '—'}</td><td>${n.categoria || '—'}</td></tr>
    `).join('') || '<tr><td colspan="3" style="opacity:.5">Banca dati vuota</td></tr>';
  } catch { /* offline */ }
}

async function addNorm() {
  const titolo = document.getElementById('normTitolo').value.trim();
  const riferimento = document.getElementById('normRif').value.trim();
  const testo = document.getElementById('normTesto').value.trim();
  if (!titolo) return;
  await authFetch('/api/normativa/aggiungi', {
    method: 'POST',
    body: JSON.stringify({ titolo, riferimento, testo })
  });
  document.getElementById('normTitolo').value = '';
  document.getElementById('normRif').value = '';
  document.getElementById('normTesto').value = '';
  loadNormativa();
}
