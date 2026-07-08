const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('doctouche', {
  loginSuccess: (session) => ipcRenderer.invoke('auth:login-success', session),
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getServerUrls: () => ipcRenderer.invoke('config:get-server-urls'),
  notify: (title, body) => ipcRenderer.invoke('notify:show', { title, body }),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value)
});
