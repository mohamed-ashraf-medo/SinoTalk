// server/index.js
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { executeTranslation } from './services/translationAdapter.js';
import { parseDocument } from './services/documentParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Temporary upload folder
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage for temporary processing (cleaned up immediately)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'SinoTalk Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Translation Endpoint
app.post('/api/translate', async (req, res) => {
  try {
    const { text, direction, userKey } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "النص المطلوب ترجمته فارغ." });
    }

    const result = await executeTranslation({ text, direction, userKey });
    res.json(result);
  } catch (error) {
    console.error("Translation API error:", error);
    res.status(500).json({ error: error.message || "حدث خطأ أثناء معالجة الترجمة." });
  }
});

// Document Upload & Parsing Endpoint
app.post('/api/documents/parse', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "لم يتم استلام أي ملف." });
  }

  const filePath = req.file.path;
  try {
    const parsed = await parseDocument(filePath, req.file.originalname, req.file.mimetype);
    // Remove temporary file immediately according to privacy policy (Requirement 14)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      filename: req.file.originalname,
      size: req.file.size,
      ...parsed
    });
  } catch (error) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error("Document parse error:", error);
    res.status(500).json({ error: error.message || "فشل استخراج محتوى المستند." });
  }
});

// Document Batch Paragraph Translation Endpoint
app.post('/api/documents/translate-batch', async (req, res) => {
  try {
    const { paragraphs, direction } = req.body;
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
      return res.status(400).json({ error: "قائمة الفقرات فارغة." });
    }

    // Limit to 50 paragraphs per batch for performance
    const selected = paragraphs.slice(0, 50);
    const translatedList = [];

    for (const p of selected) {
      if (!p.trim()) {
        translatedList.push({ original: p, translated: '' });
        continue;
      }
      try {
        const trans = await executeTranslation({ text: p, direction });
        translatedList.push({
          original: p,
          simplified: trans.simplified,
          traditional: trans.traditional,
          translated: trans.simplified || trans.translated_arabic || trans.original,
          pinyin: trans.pinyin
        });
      } catch (err) {
        translatedList.push({ original: p, translated: p, error: true });
      }
    }

    res.json({ results: translatedList });
  } catch (error) {
    console.error("Batch translate error:", error);
    res.status(500).json({ error: "حدث خطأ أثناء ترجمة فقرات المستند." });
  }
});

// Microsoft Bing Neural Male TTS Proxy (Chinese + Egyptian/Standard Arabic — zero CORS for Web!)
const BING_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let serverBingSession = null;

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchBingTtsServer(text, lang, voice) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1 || !serverBingSession || Date.now() - serverBingSession.at > 480000) {
      try {
        const pageRes = await fetch('https://www.bing.com/translator', {
          headers: { 'User-Agent': BING_UA, 'Accept-Language': 'en-US,en;q=0.9' }
        });
        if (!pageRes.ok) continue;
        const html = await pageRes.text();
        const ig = html.match(/IG:"([A-F0-9]+)"/)?.[1];
        const pm = html.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)",(\d+)\]/);
        if (!ig || !pm) continue;
        const cookies = typeof pageRes.headers.getSetCookie === 'function'
          ? pageRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
          : '';
        serverBingSession = { ig, key: pm[1], token: pm[2], cookies, at: Date.now() };
      } catch {
        continue;
      }
    }
    if (!serverBingSession) continue;
    try {
      const ttsUrl = `https://www.bing.com/tfettts?isVertical=1&&IG=${serverBingSession.ig}&IID=translator.5028`;
      const ssml = `<speak version='1.0' xml:lang='${escapeXml(lang)}'><voice xml:lang='${escapeXml(lang)}' xml:gender='Male' name='${escapeXml(voice)}'><prosody rate='0%'>${escapeXml(text)}</prosody></voice></speak>`;
      const body = `ssml=${encodeURIComponent(ssml)}&token=${encodeURIComponent(serverBingSession.token)}&key=${encodeURIComponent(serverBingSession.key)}`;
      const res = await fetch(ttsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': BING_UA,
          Referer: 'https://www.bing.com/translator',
          ...(serverBingSession.cookies ? { Cookie: serverBingSession.cookies } : {})
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

app.post('/api/tts', async (req, res) => {
  try {
    const { text, lang = 'zh-CN', voice = 'zh-CN-YunjianNeural' } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'النص المطلوب نطقه فارغ.' });
    }
    const data = await fetchBingTtsServer(String(text).trim(), String(lang), String(voice));
    if (data) {
      return res.json({ success: true, data, engine: 'bing-neural' });
    }
    return res.status(502).json({ success: false, error: 'تعذر توليد الصوت حالياً.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err?.message || 'TTS server error' });
  }
});

// Serve frontend build if in production
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`[SinoTalk Server] تعمل المنصة الآن بنجاح على الروابط التالية:`);
  console.log(`- الرابط المحلي (جهازك): http://localhost:${PORT}`);
  console.log(`- رابط الشبكة (لأي هاتف أو جهاز على نفس الواي فاي): http://192.168.1.5:${PORT}`);
  console.log(`======================================================\n`);
});
