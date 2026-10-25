const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dentalDB', {
  load: () => ipcRenderer.invoke('db:load'),
  save: (patients) => ipcRenderer.invoke('db:save', patients),
  path: () => ipcRenderer.invoke('db:path'),
  loadPrices: () => ipcRenderer.invoke('prices:load'),
  pricePath: () => ipcRenderer.invoke('prices:path')
});

contextBridge.exposeInMainWorld('dentalApp', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkUpdate: (repo) => ipcRenderer.invoke('app:check-update', repo),
  downloadUpdate: (url) => ipcRenderer.invoke('app:download-update', url),
  onDownloadProgress: (callback) => {
    ipcRenderer.on('update:download-progress', (_e, data) => callback(data));
  },
  installAndRestart: (customPath) => ipcRenderer.invoke('app:install-and-restart', customPath),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  onSerialDeviceChanged: (callback) => {
    ipcRenderer.on('serial:device-changed', (_e, data) => callback(data));
  }
});

