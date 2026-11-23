import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BING_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let viteBingSession: { ig: string; key: string; token: string; cookies: string; at: number } | null = null;

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchBingTtsForDev(text: string, lang: string, voice: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1 || !viteBingSession || Date.now() - viteBingSession.at > 480000) {
      try {
        const pageRes = await fetch('https://www.bing.com/translator', {
          headers: { 'User-Agent': BING_UA, 'Accept-Language': 'en-US,en;q=0.9' }
        });
        if (!pageRes.ok) continue;
        const html = await pageRes.text();
        const ig = html.match(/IG:"([A-F0-9]+)"/)?.[1];
        const pm = html.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)",(\d+)\]/);
        if (!ig || !pm) continue;
        const cookies = typeof (pageRes.headers as any).getSetCookie === 'function'
          ? (pageRes.headers as any).getSetCookie().map((c: string) => c.split(';')[0]).join('; ')
          : '';
        viteBingSession = { ig, key: pm[1], token: pm[2], cookies, at: Date.now() };
      } catch {
        continue;
      }
    }
    if (!viteBingSession) continue;
    try {
      const ttsUrl = `https://www.bing.com/tfettts?isVertical=1&&IG=${viteBingSession.ig}&IID=translator.5028`;
      const ssml = `<speak version='1.0' xml:lang='${escapeXml(lang)}'><voice xml:lang='${escapeXml(lang)}' xml:gender='Male' name='${escapeXml(voice)}'><prosody rate='0%'>${escapeXml(text)}</prosody></voice></speak>`;
      const body = `ssml=${encodeURIComponent(ssml)}&token=${encodeURIComponent(viteBingSession.token)}&key=${encodeURIComponent(viteBingSession.key)}`;
      const res = await fetch(ttsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': BING_UA,
          Referer: 'https://www.bing.com/translator',
          ...(viteBingSession.cookies ? { Cookie: viteBingSession.cookies } : {})
        },
        body
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.toLowerCase().includes('audio')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 500) return buf.toString('base64');
      }
    } catch {
      // retry once
    }
  }
  return null;
}

function sinoBingTtsDevPlugin() {
  return {
    name: 'sinotalk-bing-tts-dev',
    configureServer(server: any) {
      server.middlewares.use('/api/tts', (req: any, res: any, next: any) => {
        if (req.method !== 'POST') return next();
        let raw = '';
        req.on('data', (chunk: Buffer) => {
          raw += chunk.toString('utf8');
        });
        req.on('end', async () => {
          try {
            const { text, lang = 'zh-CN', voice = 'zh-CN-YunjianNeural' } = JSON.parse(raw || '{}');
            const data = await fetchBingTtsForDev(text, lang, voice);
            res.setHeader('Content-Type', 'application/json');
            if (data) {
              res.end(JSON.stringify({ success: true, data, engine: 'bing-neural' }));
            } else {
              res.statusCode = 502;
              res.end(JSON.stringify({ success: false, error: 'TTS unavailable' }));
            }
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, error: 'Invalid payload' }));
          }
        });
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), sinoBingTtsDevPlugin()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
