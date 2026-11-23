// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sinoElectron', {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  fetchMaleTts: (text, lang, voice) => ipcRenderer.invoke('tts-fetch-male', { text, lang, voice }),
  onQuickTranslate: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on('quick-translate', handler);
    return () => ipcRenderer.removeListener('quick-translate', handler);
  }
});
