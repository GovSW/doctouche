# DocTouché!

Software offline-first di produzione documentale federale (Word + Excel + PowerPoint in uno), con normativa sportiva integrata, workflow approvativo, protocollazione e SSO tramite Touché! PassWeb.

## Stato del progetto

Tutti i moduli richiesti sono implementati end-to-end (client + server):

- **Editor** stile Word: formattazione, titoli, elenchi, tabelle, immagini, allineamento reale (sinistra/centro/destra/giustificato).
- **Intestazione/piè di pagina** editabili via dialog, con opzione "prima pagina diversa" e margini configurabili (`editor/layout.js`).
- **Export DOCX** fedele (titoli, grassetto/corsivo/sottolineato, tabelle, immagini, allineamento, intestazione/piè di pagina) via `editor/export-docx.js`.
- **Export PDF** pixel-perfect (rasterizzazione ad alta risoluzione della pagina composta, multipagina A4) via `editor/export-pdf.js`.
- **Banca dati normativa federale**: tabella `normativa`, ricerca full-text (`/api/normativa/cerca`), inserimento come riferimento incrociato nel testo, gestione/aggiunta da pannello admin.
- **Integrazione Protocollo.net**: broker OAuth-like (`/api/protocollonet/connect-url` + `/api/protocollonet/callback`), collegamento account per utente, ricerca protocolli e inserimento campi mappati liberamente (numero, data, destinatario, fascicolo, oggetto) nel documento.
- **Workflow approvativo multi-step**: organigramma configurabile da pannello admin (`/api/admin/organigramma`), invio in approvazione che segue automaticamente la sequenza degli organi, avanzamento step (`/api/workflow/approva-step`).
- **Pannello Amministrazione** (`screens/admin.html`): gestione utenti (sospendi/riattiva/revoca su tutte le piattaforme Touché!), approvazione/rifiuto richieste organizzazione, editor organigramma, gestione banca dati normativa.
- **Condivisione documenti** con ruoli viewer/editor/owner.
- **Sync offline-first** con coda di retry automatica e notifiche desktop.

### Ancora da rifinire (non bloccante, migliorie):
- UI di selezione dei campi Protocollo.net da mappare (attualmente mappatura di default modificabile solo nel codice `protocolFieldMapping`)
- Vero flusso OAuth lato server `protocollonetweb` (l'endpoint `/oauth/authorize` e `/api/protocolli/cerca` vanno implementati sull'account Protocollo.net esistente, qui è pronto solo il lato broker DocTouché)
- Notifiche push server→client (oggi le notifiche sono generate lato client sugli eventi)
- Editor visuale drag&drop dell'organigramma (oggi è una lista ordinata semplice)

## Come buildare in locale

```bash
npm install
npm start          # avvia l'app in modalità sviluppo
npm run dist       # builda per Windows + macOS + Linux (serve girare sui rispettivi OS o usare CI)
```

## Come ottenere gli eseguibili da GitHub (CI automatica)

1. Crea una repo su GitHub e carica **tutto il contenuto di questo ZIP** (mantenendo la cartella `.github/workflows/`).
2. Ad ogni `push` su `main` la Action builda automaticamente Windows/macOS/Linux e carica gli artefatti nella tab **Actions** della repo (scaricabili come ZIP).
3. Per creare una **Release ufficiale con installer pubblicati**, crea un tag versione:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   La Action pubblicherà automaticamente una GitHub Release con `.exe`, `.dmg`, `.AppImage`, `.deb` allegati.

Non serve configurare nulla: la Action usa `GITHUB_TOKEN` automatico di GitHub.

## Deploy del server di sincronizzazione (PythonAnywhere)

La cartella `server/` va caricata in `/home/doctouche/doctouche-server/` su PythonAnywhere:

```
server/
  app.py            → server Flask principale (WSGI entrypoint)
  passweb_sync.py   → modulo SSO/sync verso PassWeb (già fornito)
  database.py       → schema SQLite (già fornito + tabelle documenti/workflow/normativa)
  config.py         → percorso DB e chiave segreta
  requirements.txt
```

Variabili d'ambiente da impostare nel pannello "Web" di PythonAnywhere:
- `TOUCHESUITE_SECRET` — stessa chiave condivisa configurata su `touchesuite`
- `DOCTOUCHE_DB_PATH` — es. `/home/doctouche/doctouche-server/doctouche.db`

Imposta il file WSGI di PythonAnywhere per puntare a `server/app.py` (variabile `app`).

## Configurazione URL server nel client

Il client Electron legge gli URL da variabili d'ambiente (impostabili anche in un file `.env` caricato dal main process):
- `DOCTOUCHE_SERVER_URL` (default: `https://doctouche.pythonanywhere.com`)
- `PASSWEB_URL` (default: `https://touchesuite.pythonanywhere.com`)

## Icona

L'icona ufficiale è già inclusa in `src/renderer/assets/icon.png` ed è referenziata in `package.json` per la generazione degli installer.
