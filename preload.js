const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openPackageJson: () => ipcRenderer.invoke('open-package-json'),
  openPackagePath: (filePath) => ipcRenderer.invoke('open-package-path', filePath),
  loadLastSession: () => ipcRenderer.invoke('load-last-session'),

  runScript: (id, script, cwd) => {
    ipcRenderer.send('run-script', { id, script, cwd });
  },

  stopScript: (id) => {
    return ipcRenderer.invoke('stop-script', { id });
  },

  stopAllScripts: () => {
    return ipcRenderer.invoke('stop-all-scripts');
  },

  detectManagers: () => ipcRenderer.invoke('detect-managers'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  onScriptOutput: (callback) => {
    ipcRenderer.on('script-output', (_event, data) => callback(data));
  },

  onScriptExit: (callback) => {
    ipcRenderer.on('script-exit', (_event, data) => callback(data));
  },

  onScriptError: (callback) => {
    ipcRenderer.on('script-error', (_event, data) => callback(data));
  },
});
