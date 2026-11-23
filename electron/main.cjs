// electron/main.cjs
// SinoTalk Windows Desktop App (.exe) Main Process
// Runs 100% standalone without localhost or external servers

const { app, BrowserWindow, ipcMain, globalShortcut, clipboard, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Allow seamless audio playback (HTMLAudioElement & Web Audio API) after async translation fetches
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const BING_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let bingCache = null;

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function getBingSession(forceRefresh = false) {
  if (!forceRefresh && bingCache && Date.now() - bingCache.at < 480000) {
    return bingCache;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://www.bing.com/translator', {
      headers: { 'User-Agent': BING_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const igMatch = html.match(/IG:"([A-F0-9]+)"/);
    const paramsMatch = html.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)",(\d+)\]/);
    if (!igMatch || !paramsMatch) return null;
    const cookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
      : '';
    bingCache = {
      ig: igMatch[1],
      key: paramsMatch[1],
      token: paramsMatch[2],
      cookies,
      at: Date.now()
    };
    return bingCache;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function fetchBingMaleBase64(text, lang, voice) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getBingSession(attempt === 1);
    if (!session) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    try {
      const ttsUrl = `https://www.bing.com/tfettts?isVertical=1&&IG=${session.ig}&IID=translator.5028`;
      const ssml = `<speak version='1.0' xml:lang='${escapeXml(lang)}'><voice xml:lang='${escapeXml(lang)}' xml:gender='Male' name='${escapeXml(voice)}'><prosody rate='0%'>${escapeXml(text)}</prosody></voice></speak>`;
      const body = `ssml=${encodeURIComponent(ssml)}&token=${encodeURIComponent(session.token)}&key=${encodeURIComponent(session.key)}`;
      const res = await fetch(ttsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': BING_UA,
          Referer: 'https://www.bing.com/translator',
          ...(session.cookies ? { Cookie: session.cookies } : {})
        },
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.toLowerCase().includes('audio')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 500) {
          return buf.toString('base64');
        }
      }
    } catch {
      clearTimeout(timer);
    }
  }
  return null;
}

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

  // Primary: Microsoft Bing Neural Male TTS (Chinese + Egyptian/Standard Arabic — zero CORS!)
  ipcMain.handle('tts-fetch-male', async (_event, { text, lang = 'zh-CN', voice = 'zh-CN-YunjianNeural' }) => {
    const bingAudio = await fetchBingMaleBase64(text, lang, voice);
    if (bingAudio) return bingAudio;

    // Secondary fallback for Chinese only if Bing temporarily unavailable
    if (String(lang).startsWith('zh')) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: 'BV002_streaming' }),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          if (json?.success && typeof json.data === 'string' && json.data.length > 200) {
            return json.data;
          }
        }
      } catch {
        // ignore fallback error
      }
    }
    return null;
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
