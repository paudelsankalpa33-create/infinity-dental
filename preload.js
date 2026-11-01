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
  installSoundboxDriver: () => ipcRenderer.invoke('app:install-soundbox-driver'),
  onSerialDeviceChanged: (callback) => {
    ipcRenderer.on('serial:device-changed', (_e, data) => callback(data));
  }
});

contextBridge.exposeInMainWorld('dentalAuth', {
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  listUsers: () => ipcRenderer.invoke('users:list'),
  createUser: (userData) => ipcRenderer.invoke('users:create', userData),
  updateUser: (id, userData) => ipcRenderer.invoke('users:update', id, userData),
  deleteUser: (id) => ipcRenderer.invoke('users:delete', id)
});

contextBridge.exposeInMainWorld('dentalNpi', {
  generateQr: (data) => ipcRenderer.invoke('nepalpay:generate-qr', data),
  checkPaymentStatus: (data) => ipcRenderer.invoke('nepalpay:check-status', data),
  simulatePayment: (traceId) => ipcRenderer.invoke('nepalpay:simulate-payment', traceId)
});
