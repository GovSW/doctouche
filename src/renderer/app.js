import { createEditor, commands } from './editor/editor.js';
import { exportToDocx } from './editor/export-docx.js';
import { exportToPdf } from './editor/export-pdf.js';
import { defaultPageLayout, applyLayoutToPageRoot, openLayoutDialog as openLayoutDialogUI } from './editor/layout.js';
import { connectProtocolloNet, searchProtocolli, buildProtocolInsertText } from './editor/protocollonet.js';

let session = null;
let editorView = null;
let currentDoc = { id: null, titolo: 'Nuovo documento', contenutoHTML: '<p></p>', fascicoloId: null };
let dirty = false;
let pageLayout = defaultPageLayout();
let protocolFieldMapping = { numero: true, data: false, destinatario: false, fascicolo: false, oggetto: false };

// ─── Init ───────────────────────────────────────────────────────────────────
(async function init() {
  session = await window.doctouche.getSession();
  if (!session) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Sessione non trovata. Riavvia l\'app.</p>';
    return;
  }
  document.getElementById('userLabel').textContent =
    `${session.user?.nome || ''} ${session.user?.cognome || ''} — ${session.user?.email || ''}`;
  document.getElementById('orgName').textContent = session.user?.ente_predefinito || 'Nessuna organizzazione';

  editorView = createEditor(document.getElementById('editor-root'), {
    initialHTML: currentDoc.contenutoHTML,
    onChange: (state) => {
      dirty = true;
      updateWordCount(state);
      scheduleAutosync();
    }
  });

  wireRibbon();
  wireStatusbar();
  loadFascicoli();
  loadRecentDocs();
  startBackgroundSync();
})();

// ─── Ribbon: tabs ───────────────────────────────────────────────────────────
function wireRibbon() {
  document.querySelectorAll('.rtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.rpanel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });

  document.querySelectorAll('.rpanel button[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => runCommand(btn.dataset.cmd));
  });

  document.getElementById('paraStyle').addEventListener('change', (e) => runCommand(e.target.value));
}

function runCommand(cmd) {
  if (commands[cmd]) {
    commands[cmd](editorView);
    editorView.focus();
    return;
  }
  switch (cmd) {
    case 'insertImage':
      pickAndInsertImage();
      break;
    case 'insertPageBreak':
      commands.insertLine(editorView);
      break;
    case 'editHeader': case 'editFooter': case 'differentFirstPage': case 'pageMargins':
      openLayoutDialog(cmd);
      break;
    case 'searchNorm':
      searchNormativa();
      break;
    case 'protoConnect':
      doConnectProtocolloNet();
      break;
    case 'protoInsertField':
      insertProtocolField();
      break;
    case 'submitApproval':
      submitForApproval();
      break;
    case 'shareDoc':
      shareDocument();
      break;
    case 'exportDocx':
      exportToDocx(editorView, {
        titolo: currentDoc.titolo,
        headerText: pageLayout.header.enabled ? pageLayout.header.text : '',
        footerText: pageLayout.footer.enabled ? pageLayout.footer.text : ''
      });
      break;
    case 'exportPdf':
      exportToPdf(document.getElementById('page-container'), { titolo: currentDoc.titolo });
      break;
    case 'openAdmin':
      window.open('screens/admin.html', 'admin', 'width=1100,height=800');
      break;
  }
}

// ─── Word count / status ────────────────────────────────────────────────────
function updateWordCount(state) {
  const text = state.doc.textBetween(0, state.doc.content.size, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  document.getElementById('wordCount').textContent = `${words} parole`;
}

function wireStatusbar() {
  document.getElementById('logoutBtn').addEventListener('click', () => window.doctouche.logout());
}

// ─── Sync automatica col server DocTouché (PythonAnywhere) ────────────────
let syncTimer = null;
function scheduleAutosync() {
  document.getElementById('syncStatus').className = 'sync-pending';
  document.getElementById('syncStatus').textContent = '● modifiche non salvate';
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncCurrentDocument, 2500);
}

async function syncCurrentDocument() {
  if (!dirty) return;
  try {
    const { syncServer } = await window.doctouche.getServerUrls();
    const html = editorView.dom.innerHTML;
    const res = await fetch(`${syncServer}/api/documenti/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({
        id: currentDoc.id,
        titolo: currentDoc.titolo,
        contenuto_html: html,
        fascicolo_id: currentDoc.fascicoloId
      })
    });
    if (res.ok) {
      const data = await res.json();
      currentDoc.id = data.id || currentDoc.id;
      dirty = false;
      document.getElementById('syncStatus').className = 'sync-ok';
      document.getElementById('syncStatus').textContent = '● sincronizzato';
    } else {
      throw new Error('sync fallita');
    }
  } catch (e) {
    document.getElementById('syncStatus').className = 'sync-err';
    document.getElementById('syncStatus').textContent = '● offline (verrà sincronizzato)';
    // In offline-first: salva in coda locale per retry.
    const queue = (await window.doctouche.storeGet('syncQueue')) || [];
    queue.push({ ...currentDoc, contenuto_html: editorView.dom.innerHTML, ts: Date.now() });
    await window.doctouche.storeSet('syncQueue', queue);
  }
}

function startBackgroundSync() {
  setInterval(async () => {
    const queue = (await window.doctouche.storeGet('syncQueue')) || [];
    if (queue.length === 0) return;
    const { syncServer } = await window.doctouche.getServerUrls();
    const remaining = [];
    for (const item of queue) {
      try {
        const res = await fetch(`${syncServer}/api/documenti/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
          body: JSON.stringify(item)
        });
        if (!res.ok) remaining.push(item);
      } catch { remaining.push(item); }
    }
    await window.doctouche.storeSet('syncQueue', remaining);
    if (remaining.length === 0) {
      window.doctouche.notify('DocTouché!', 'Tutte le modifiche offline sono state sincronizzate.');
    }
  }, 30000);
}

// ─── Fascicoli / documenti recenti (sidebar) ───────────────────────────────
async function loadFascicoli() {
  try {
    const { syncServer } = await window.doctouche.getServerUrls();
    const res = await fetch(`${syncServer}/api/fascicoli`, { headers: { Authorization: `Bearer ${session.token}` } });
    const list = res.ok ? await res.json() : [];
    const ul = document.getElementById('fascicoliList');
    ul.innerHTML = list.map(f => `<li data-id="${f.id}">${f.numero_fascicolo}/${f.anno} — ${f.titolo}</li>`).join('') ||
      '<li style="opacity:.5">Nessun fascicolo</li>';
  } catch { /* offline: ignora */ }
}

async function loadRecentDocs() {
  try {
    const { syncServer } = await window.doctouche.getServerUrls();
    const res = await fetch(`${syncServer}/api/documenti/recenti`, { headers: { Authorization: `Bearer ${session.token}` } });
    const list = res.ok ? await res.json() : [];
    const ul = document.getElementById('recentDocs');
    ul.innerHTML = list.map(d => `<li data-id="${d.id}">${d.titolo}</li>`).join('') ||
      '<li style="opacity:.5">Nessun documento</li>';
  } catch { /* offline: ignora */ }
}

// ─── Normativa federale (banca dati incrociata) ────────────────────────────
async function searchNormativa() {
  const q = document.getElementById('normSearch').value.trim();
  if (!q) return;
  try {
    const { syncServer } = await window.doctouche.getServerUrls();
    const res = await fetch(`${syncServer}/api/normativa/cerca?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${session.token}` }
    });
    const results = res.ok ? await res.json() : [];
    if (results.length === 0) { window.doctouche.notify('Normativa', 'Nessun risultato trovato.'); return; }

    // Se più risultati, chiede quale inserire come riferimento incrociato.
    let chosen = results[0];
    if (results.length > 1) {
      const label = window.prompt(
        'Risultati trovati:\n' + results.map((r, i) => `${i + 1}. ${r.titolo} (${r.riferimento || '—'})`).join('\n') +
        '\n\nNumero da inserire come riferimento incrociato:', '1'
      );
      const idx = parseInt(label, 10) - 1;
      if (Number.isInteger(idx) && results[idx]) chosen = results[idx];
    }
    commands.insertCrossRef(editorView, { refId: chosen.id, label: `${chosen.titolo} — ${chosen.riferimento || ''}` });
    editorView.focus();
  } catch (e) {
    window.doctouche.notify('Normativa', 'Ricerca non disponibile offline.');
  }
}

// ─── Protocollo.net ─────────────────────────────────────────────────────────
async function doConnectProtocolloNet() {
  try {
    const { syncServer } = await window.doctouche.getServerUrls();
    window.doctouche.notify('Protocollo.net', 'Apertura finestra di autorizzazione…');
    const result = await connectProtocolloNet(syncServer, session.token);
    if (result?.ok) window.doctouche.notify('Protocollo.net', 'Account collegato con successo.');
  } catch (e) {
    window.doctouche.notify('Protocollo.net', 'Collegamento non riuscito: ' + e.message);
  }
}

async function insertProtocolField() {
  const query = document.getElementById('protoField').value.trim();
  if (!query) return;
  try {
    const { syncServer } = await window.doctouche.getServerUrls();
    const results = await searchProtocolli(syncServer, session.token, query);
    if (!results.length) { window.doctouche.notify('Protocollo.net', 'Nessun protocollo trovato.'); return; }
    const testo = buildProtocolInsertText(results[0], protocolFieldMapping);
    const { state, dispatch } = editorView;
    dispatch(state.tr.insertText(testo, state.selection.from));
    editorView.focus();
  } catch (e) {
    window.doctouche.notify('Protocollo.net', 'Account non collegato o ricerca non riuscita.');
  }
}

// ─── Immagini ───────────────────────────────────────────────────────────────
function pickAndInsertImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { state, dispatch } = editorView;
      const node = state.schema.nodes.image.create({ src: reader.result });
      dispatch(state.tr.replaceSelectionWith(node));
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// ─── Layout dialogs ─────────────────────────────────────────────────────────
async function openLayoutDialog(kind) {
  const updated = await openLayoutDialogUI(kind, pageLayout);
  if (!updated) return;
  pageLayout = updated;
  applyLayoutToPageRoot(document.getElementById('editor-root'), pageLayout);
  dirty = true;
  scheduleAutosync();
}

// ─── Workflow approvativo ───────────────────────────────────────────────────
async function submitForApproval() {
  const organo = document.getElementById('approvalOrgan').value;
  try {
    const { syncServer } = await window.doctouche.getServerUrls();
    const res = await fetch(`${syncServer}/api/workflow/invia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ documento_id: currentDoc.id, organo })
    });
    if (res.ok) {
      document.getElementById('approvalStatus').textContent = `In approvazione (${organo})`;
      window.doctouche.notify('Workflow', `Documento inviato per approvazione a: ${organo}`);
    }
  } catch { window.doctouche.notify('Workflow', 'Invio non riuscito: nessuna connessione.'); }
}

// ─── Condivisione ───────────────────────────────────────────────────────────
async function shareDocument() {
  const email = document.getElementById('shareUser').value.trim();
  const ruolo = document.getElementById('shareRole').value;
  if (!email) return;
  try {
    const { syncServer } = await window.doctouche.getServerUrls();
    await fetch(`${syncServer}/api/documenti/condividi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ documento_id: currentDoc.id, email, ruolo })
    });
    window.doctouche.notify('Condivisione', `Documento condiviso con ${email} (${ruolo})`);
  } catch { window.doctouche.notify('Condivisione', 'Condivisione non riuscita: offline.'); }
}
