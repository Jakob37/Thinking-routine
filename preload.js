const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  restoreFolder: () => ipcRenderer.invoke('folder:restore'),
  readFolder: (directoryPath) => ipcRenderer.invoke('folder:read', directoryPath),
  readTextFile: (filePath) => ipcRenderer.invoke('file:read-text', filePath),
  setLandingPage: (filePath) => ipcRenderer.invoke('page:set-landing', filePath),
  getLandingPage: () => ipcRenderer.invoke('page:get-landing'),
  getPomodoroHistory: () => ipcRenderer.invoke('pomodoro:get-history'),
  getPomodoroState: () => ipcRenderer.invoke('pomodoro:get-state'),
  startPomodoro: (message) => ipcRenderer.invoke('pomodoro:start', message),
  completePomodoro: () => ipcRenderer.invoke('pomodoro:complete'),
  resetPomodoro: () => ipcRenderer.invoke('pomodoro:reset'),
});
