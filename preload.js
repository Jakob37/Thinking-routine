const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  readFolder: (directoryPath) => ipcRenderer.invoke('folder:read', directoryPath),
  readTextFile: (filePath) => ipcRenderer.invoke('file:read-text', filePath),
});
