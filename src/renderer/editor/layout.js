/**
 * Stato di layout del documento, salvato insieme al documento e usato
 * sia in editor (per mostrare l'anteprima) sia in export DOCX/PDF.
 */
export function defaultPageLayout() {
  return {
    header: { text: '', enabled: false },
    footer: { text: '', enabled: false, pageNumbers: true },
    firstPageDifferent: false,
    firstPageHeader: '',
    firstPageFooter: '',
    margins: { top: 25, bottom: 25, left: 20, right: 20 } // mm
  };
}

export function applyLayoutToPageRoot(pageRootEl, layout) {
  pageRootEl.style.paddingTop = `${mmToPx(layout.margins.top)}px`;
  pageRootEl.style.paddingBottom = `${mmToPx(layout.margins.bottom)}px`;
  pageRootEl.style.paddingLeft = `${mmToPx(layout.margins.left)}px`;
  pageRootEl.style.paddingRight = `${mmToPx(layout.margins.right)}px`;

  renderBand(pageRootEl, 'doctouche-header-band', layout.header.enabled ? layout.header.text : '', 'top');
  renderBand(pageRootEl, 'doctouche-footer-band', layout.footer.enabled ? layout.footer.text : '', 'bottom');
}

function renderBand(root, cls, text, position) {
  let band = root.parentElement.querySelector(`.${cls}`);
  if (!text) { if (band) band.remove(); return; }
  if (!band) {
    band = document.createElement('div');
    band.className = cls;
    band.style.position = 'absolute';
    band.style[position] = '20px';
    band.style.left = '76px';
    band.style.right = '76px';
    band.style.fontSize = '10pt';
    band.style.color = '#555';
    band.style.textAlign = position === 'top' ? 'left' : 'center';
    root.parentElement.style.position = 'relative';
    root.parentElement.appendChild(band);
  }
  band.textContent = text;
}

function mmToPx(mm) { return Math.round(mm * 3.7795); }

/**
 * Apre un dialog HTML nativo (via <dialog>) per editare header/footer/margini.
 * Ritorna una Promise che risolve col nuovo layout oppure null se annullato.
 */
export function openLayoutDialog(kind, currentLayout) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.style.cssText = 'border-radius:10px;border:none;padding:0;width:420px;box-shadow:0 20px 60px rgba(0,0,0,.3)';
    dlg.innerHTML = buildDialogHTML(kind, currentLayout);
    document.body.appendChild(dlg);
    dlg.showModal();

    dlg.querySelector('.dt-cancel').addEventListener('click', () => { dlg.close(); dlg.remove(); resolve(null); });
    dlg.querySelector('.dt-save').addEventListener('click', () => {
      const updated = readDialogValues(kind, dlg, currentLayout);
      dlg.close(); dlg.remove();
      resolve(updated);
    });
  });
}

function buildDialogHTML(kind, layout) {
  const style = `
    <style>
      .dt-dlg { font-family: 'Segoe UI', sans-serif; padding: 20px; }
      .dt-dlg h2 { font-size: 15px; margin: 0 0 14px; }
      .dt-dlg label { display:block; font-size:12px; margin: 10px 0 4px; color:#444; }
      .dt-dlg input[type=text], .dt-dlg input[type=number] {
        width:100%; padding:7px 9px; border:1px solid #ccc; border-radius:5px; font-size:13px;
      }
      .dt-dlg .row { display:flex; gap:10px; }
      .dt-dlg .row > div { flex:1; }
      .dt-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
      .dt-actions button { padding:7px 16px; border-radius:6px; border:1px solid #ccc; cursor:pointer; font-size:13px; }
      .dt-save { background:#0b2d63; color:#fff; border-color:#0b2d63 !important; }
    </style>`;

  if (kind === 'editHeader' || kind === 'editFooter') {
    const field = kind === 'editHeader' ? 'header' : 'footer';
    return `${style}<div class="dt-dlg">
      <h2>${kind === 'editHeader' ? 'Intestazione' : 'Piè di pagina'}</h2>
      <label><input type="checkbox" id="dt-enabled" ${layout[field].enabled ? 'checked' : ''}> Attiva</label>
      <label>Testo</label>
      <input type="text" id="dt-text" value="${escapeHtml(layout[field].text)}">
      <div class="dt-actions">
        <button class="dt-cancel">Annulla</button>
        <button class="dt-save">Salva</button>
      </div>
    </div>`;
  }

  if (kind === 'differentFirstPage') {
    return `${style}<div class="dt-dlg">
      <h2>Prima pagina diversa</h2>
      <label><input type="checkbox" id="dt-fp-enabled" ${layout.firstPageDifferent ? 'checked' : ''}> Attiva prima pagina diversa</label>
      <label>Intestazione prima pagina</label>
      <input type="text" id="dt-fp-header" value="${escapeHtml(layout.firstPageHeader)}">
      <label>Piè di pagina prima pagina</label>
      <input type="text" id="dt-fp-footer" value="${escapeHtml(layout.firstPageFooter)}">
      <div class="dt-actions">
        <button class="dt-cancel">Annulla</button>
        <button class="dt-save">Salva</button>
      </div>
    </div>`;
  }

  if (kind === 'pageMargins') {
    return `${style}<div class="dt-dlg">
      <h2>Margini pagina (mm)</h2>
      <div class="row">
        <div><label>Superiore</label><input type="number" id="dt-m-top" value="${layout.margins.top}"></div>
        <div><label>Inferiore</label><input type="number" id="dt-m-bottom" value="${layout.margins.bottom}"></div>
      </div>
      <div class="row">
        <div><label>Sinistro</label><input type="number" id="dt-m-left" value="${layout.margins.left}"></div>
        <div><label>Destro</label><input type="number" id="dt-m-right" value="${layout.margins.right}"></div>
      </div>
      <div class="dt-actions">
        <button class="dt-cancel">Annulla</button>
        <button class="dt-save">Salva</button>
      </div>
    </div>`;
  }
  return `${style}<div class="dt-dlg"><p>Sezione non riconosciuta.</p></div>`;
}

function readDialogValues(kind, dlg, layout) {
  const updated = JSON.parse(JSON.stringify(layout));
  if (kind === 'editHeader') {
    updated.header.enabled = dlg.querySelector('#dt-enabled').checked;
    updated.header.text = dlg.querySelector('#dt-text').value;
  } else if (kind === 'editFooter') {
    updated.footer.enabled = dlg.querySelector('#dt-enabled').checked;
    updated.footer.text = dlg.querySelector('#dt-text').value;
  } else if (kind === 'differentFirstPage') {
    updated.firstPageDifferent = dlg.querySelector('#dt-fp-enabled').checked;
    updated.firstPageHeader = dlg.querySelector('#dt-fp-header').value;
    updated.firstPageFooter = dlg.querySelector('#dt-fp-footer').value;
  } else if (kind === 'pageMargins') {
    updated.margins = {
      top: Number(dlg.querySelector('#dt-m-top').value) || 25,
      bottom: Number(dlg.querySelector('#dt-m-bottom').value) || 25,
      left: Number(dlg.querySelector('#dt-m-left').value) || 20,
      right: Number(dlg.querySelector('#dt-m-right').value) || 20
    };
  }
  return updated;
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
