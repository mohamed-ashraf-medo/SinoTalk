// electron/main.cjs
// SinoTalk Windows Desktop App (.exe) Main Process
// Runs 100% standalone without localhost or external servers

const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Allow seamless audio playback (HTMLAudioElement & Web Audio API) after async translation fetches
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 620,
    frame: false,
    backgroundColor: '#070B14',
    title: 'SinoTalk - مترجمك الذكي بين العربية والصينية',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', 'public', 'logo.svg');
    const icon = nativeImage.createEmpty();
    tray = new Tray(fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : icon);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'فتح SinoTalk',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        }
      },
      {
        label: 'ترجمة النص المنسوخ (Ctrl+Shift+T)',
        click: () => triggerQuickTranslate()
      },
      { type: 'separator' },
      {
        label: 'إغلاق نهائي',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setToolTip('SinoTalk — مترجم العربية والصينية');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch (err) {
    console.warn('Tray skipped:', err.message);
  }
}

function triggerQuickTranslate() {
  if (!mainWindow) return;
  const text = clipboard.readText() || '';
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('quick-translate', text);
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Global Hotkey: Ctrl+Shift+T from anywhere in Windows!
  try {
    globalShortcut.register('CommandOrControl+Shift+T', triggerQuickTranslate);
  } catch (e) {
    console.warn('Could not register global shortcut:', e.message);
  }

  // Window control IPC
  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => {
    isQuitting = true;
    app.quit();
  });

  // Main-process Studio Male TTS fetch (zero CORS / file:// restrictions on Windows Desktop)
  ipcMain.handle('tts-fetch-male', async (_event, { text, voice }) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9500);
      const res = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = await res.json();
      if (json?.success && typeof json.data === 'string' && json.data.length > 200) {
        return json.data;
      }
      return null;
    } catch {
      return null;
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
