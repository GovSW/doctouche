const { app, BrowserWindow, ipcMain, Menu, Notification } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({ name: 'doctouche-config' });

// ─── URL server di sincronizzazione (PythonAnywhere) ───────────────────────
const SYNC_SERVER_URL = process.env.DOCTOUCHE_SERVER_URL || 'https://doctouche.pythonanywhere.com';
const PASSWEB_URL = process.env.PASSWEB_URL || 'https://doctouche.pythonanywhere.com';

let mainWindow;
let loginWindow;

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 480,
    height: 640,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  loginWindow.setMenuBarVisibility(false);
  loginWindow.loadFile(path.join(__dirname, '..', 'renderer', 'screens', 'login.html'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createLoginWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: login riuscito → apri app principale ─────────────────────────────
ipcMain.handle('auth:login-success', async (evt, session) => {
  store.set('session', session);
  if (loginWindow) { loginWindow.close(); loginWindow = null; }
  createMainWindow();
  return true;
});

ipcMain.handle('auth:get-session', () => store.get('session'));
ipcMain.handle('auth:logout', () => { store.delete('session'); app.relaunch(); app.exit(); });

ipcMain.handle('config:get-server-urls', () => ({
  syncServer: SYNC_SERVER_URL,
  passweb: PASSWEB_URL
}));

ipcMain.handle('notify:show', (evt, { title, body }) => {
  new Notification({ title, body }).show();
  return true;
});

ipcMain.handle('store:get', (evt, key) => store.get(key));
ipcMain.handle('store:set', (evt, key, value) => { store.set(key, value); return true; });
