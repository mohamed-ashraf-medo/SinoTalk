// src/services/voiceEngine.ts
// V8.1 STRICT MALE-ONLY Studio Voice Engine (ZERO Female Voice Fallback!)
// - Plays 100% verified genuine Male Beijing Mandarin MP3 voices:
//   1. 'BV002_streaming' (Standard Beijing Male Newsreader — super clear & authentic)
//   2. 'zh_male_chunhou' (Deep Resonant Male Narrator)
//   3. 'zh_male_xiaoming' (Crisp Male Speaker)
// - Uses Web Audio API (AudioContext.decodeAudioData) with clean data-URI HTMLAudioElement fallback
// - STRICTLY blocks any female OS/Android/Google fallback voice.

export type VoiceMode = 'hd' | 'device';
export type MaleSpeakerId = 'BV002_streaming' | 'zh_male_chunhou' | 'zh_male_xiaoming';

let currentMode: VoiceMode = 'hd';
let currentSpeaker: MaleSpeakerId = 'BV002_streaming';
let audioCtx: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentFallbackAudio: HTMLAudioElement | null = null;
let playbackSessionId = 0;
const audioBase64Cache = new Map<string, string>();
const listeners = new Set<(speaking: boolean) => void>();

const FEMALE_VOICE_BLACKLIST = [
  'xiaoxiao', 'huihui', 'yaoyao', 'ting-ting', 'tingting', 'meijia', 'sinji',
  'zhiyu', 'salma', 'hoda', 'laila', 'mariam', 'rana', 'zaira', 'female', 'woman', 'girl'
];

try {
  if (typeof localStorage !== 'undefined') {
    const savedSpeaker = localStorage.getItem('sinotalk_male_speaker_v81');
    if (savedSpeaker === 'BV002_streaming' || savedSpeaker === 'zh_male_chunhou' || savedSpeaker === 'zh_male_xiaoming') {
      currentSpeaker = savedSpeaker;
    }
    const savedMode = localStorage.getItem('sinotalk_voice_mode_v81');
    if (savedMode === 'hd' || savedMode === 'device') currentMode = savedMode;
  }
} catch {}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function notifySpeaking(state: boolean) {
  listeners.forEach((cb) => { try { cb(state); } catch {} });
}

export function onSpeakingChange(cb: (speaking: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function getVoiceMode(): VoiceMode { return currentMode; }
export function setVoiceMode(mode: VoiceMode): void {
  currentMode = mode;
  try { localStorage.setItem('sinotalk_voice_mode_v81', mode); } catch {}
}
export function getMaleSpeaker(): MaleSpeakerId { return currentSpeaker; }
export function setMaleSpeaker(speaker: MaleSpeakerId): void {
  currentSpeaker = speaker;
  try { localStorage.setItem('sinotalk_male_speaker_v81', speaker); } catch {}
}

export function stopNaturalSpeech(): void {
  playbackSessionId++;
  if (currentSourceNode) {
    try { currentSourceNode.onended = null; currentSourceNode.stop(); currentSourceNode.disconnect(); } catch {}
    currentSourceNode = null;
  }
  if (currentFallbackAudio) {
    try { currentFallbackAudio.onended = null; currentFallbackAudio.onerror = null; currentFallbackAudio.pause(); currentFallbackAudio.src = ''; } catch {}
    currentFallbackAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch {}
  }
  notifySpeaking(false);
}

function splitSpeechChunks(text: string, maxLen = 75): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const rawParts = clean.split(/(?<=[。！？.!?,，、؛;\n])\s*/).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  const pushOversized = (segment: string) => {
    let cursor = 0;
    while (cursor < segment.length) {
      chunks.push(segment.slice(cursor, cursor + maxLen).trim());
      cursor += maxLen;
    }
  };
  for (const part of rawParts) {
    if (part.length > maxLen) {
      if (buf.trim()) { chunks.push(buf.trim()); buf = ''; }
      pushOversized(part);
    } else if ((buf + part).length > maxLen && buf) {
      chunks.push(buf.trim());
      buf = part;
    } else {
      buf += (buf ? ' ' : '') + part;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function fetchMaleMandarinBase64(text: string, speaker: MaleSpeakerId): Promise<string | null> {
  const cacheKey = `${speaker}:${text}`;
  const cached = audioBase64Cache.get(cacheKey);
  if (cached) return cached;
  const allMaleSpeakers: MaleSpeakerId[] = ['BV002_streaming', 'zh_male_chunhou', 'zh_male_xiaoming'];
  const order: MaleSpeakerId[] = [speaker, ...allMaleSpeakers.filter((s) => s !== speaker)];
  for (const voice of order) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch('https://tiktok-tts.weilnet.workers.dev/api/generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json = await res.json();
      if (json?.success && typeof json.data === 'string' && json.data.length > 200) {
        audioBase64Cache.set(cacheKey, json.data);
        return json.data;
      }
    } catch {}
  }
  return null;
}

async function playBase64Mp3(base64: string, rate: number, sessionId: number): Promise<void> {
  if (sessionId !== playbackSessionId) return;
  const ctx = getOrCreateAudioContext();
  if (ctx) {
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      const ab = base64ToArrayBuffer(base64);
      const audioBuffer = await ctx.decodeAudioData(ab.slice(0));
      if (sessionId !== playbackSessionId) return;
      await new Promise<void>((resolve) => {
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = Math.max(0.65, Math.min(1.6, rate));
        source.connect(ctx.destination);
        currentSourceNode = source;
        source.onended = () => { if (currentSourceNode === source) currentSourceNode = null; resolve(); };
        source.start(0);
      });
      return;
    } catch {}
  }
  await new Promise<void>((resolve, reject) => {
    if (sessionId !== playbackSessionId) return resolve();
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audio.volume = 1.0;
    audio.playbackRate = Math.max(0.65, Math.min(1.6, rate));
    currentFallbackAudio = audio;
    audio.onended = () => { if (currentFallbackAudio === audio) currentFallbackAudio = null; resolve(); };
    audio.onerror = () => { if (currentFallbackAudio === audio) currentFallbackAudio = null; reject(new Error('Audio playback error')); };
    audio.play().catch(reject);
  });
}

async function tryPlayGenuineMaleChinese(text: string, rate: number, sessionId: number): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const chunks = splitSpeechChunks(text, 75);
  if (!chunks.length) return false;
  notifySpeaking(true);
  try {
    let nextPromise: Promise<string | null> | null = fetchMaleMandarinBase64(chunks[0], currentSpeaker);
    for (let i = 0; i < chunks.length; i++) {
      if (sessionId !== playbackSessionId) return true;
      const b64 = await nextPromise;
      if (sessionId !== playbackSessionId) return true;
      nextPromise = i + 1 < chunks.length ? fetchMaleMandarinBase64(chunks[i + 1], currentSpeaker) : null;
      if (!b64) { notifySpeaking(false); return false; }
      await playBase64Mp3(b64, rate, sessionId);
    }
    if (sessionId === playbackSessionId) notifySpeaking(false);
    return true;
  } catch {
    if (sessionId === playbackSessionId) notifySpeaking(false);
    return false;
  }
}

function isBlacklistedFemaleVoice(name: string): boolean {
  const lower = (name || '').toLowerCase();
  return FEMALE_VOICE_BLACKLIST.some((kw) => lower.includes(kw));
}

function findStrictMaleOsVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const isZh = lang.startsWith('zh');
  const matching = voices.filter((v) => {
    const langOk = isZh ? v.lang.toLowerCase().startsWith('zh') : v.lang.toLowerCase().startsWith('ar');
    return langOk && !isBlacklistedFemaleVoice(v.name);
  });
  const maleKeywords = isZh
    ? ['yunxi', 'yunjian', 'yunyang', 'kangkang', 'yunhao', 'male', 'man']
    : ['shakir', 'hamed', 'maged', 'naayf', 'bassel', 'omar', 'male', 'man'];
  for (const kw of maleKeywords) {
    const found = matching.find((v) => v.name.toLowerCase().includes(kw));
    if (found) return found;
  }
  return null;
}

async function tryPlayStrictMaleCapacitorTts(text: string, lang: string, rate: number, sessionId: number): Promise<boolean> {
  const isCapacitor = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
  if (!isCapacitor) return false;
  try {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    const { voices } = await TextToSpeech.getSupportedVoices();
    const isZh = lang.startsWith('zh');
    const maleHints = isZh ? ['zhe', 'ccd', 'dfc', 'yunxi', 'yunjian', 'kangkang', 'male'] : ['shakir', 'maged', 'hamed', 'ard', 'arz', 'male'];
    const idx = voices.findIndex((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = (v.name || '').toLowerCase();
      const langOk = isZh ? l.startsWith('zh') || l.startsWith('cmn') : l.startsWith('ar');
      return langOk && !isBlacklistedFemaleVoice(n) && maleHints.some((h) => n.includes(h));
    });
    if (idx < 0) return false;
    notifySpeaking(true);
    await TextToSpeech.speak({ text, lang, rate, pitch: 0.92, volume: 1.0, voice: idx, category: 'ambient' });
    if (sessionId === playbackSessionId) notifySpeaking(false);
    return true;
  } catch {
    notifySpeaking(false);
    return false;
  }
}

export async function speakNatural({ text, lang = 'zh-CN', rate = 1.0, onEnd, onError }: {
  text: string; lang?: string; rate?: number; voiceName?: string; onEnd?: () => void; onError?: (err: unknown) => void;
}): Promise<void> {
  const clean = (text || '').trim();
  if (!clean) return;
  stopNaturalSpeech();
  getOrCreateAudioContext();
  const sessionId = ++playbackSessionId;
  const isZh = lang.startsWith('zh');
  if (isZh && currentMode === 'hd') {
    const ok = await tryPlayGenuineMaleChinese(clean, rate, sessionId);
    if (ok) { if (sessionId === playbackSessionId && onEnd) onEnd(); return; }
  }
  const capMaleOk = await tryPlayStrictMaleCapacitorTts(clean, lang, rate, sessionId);
  if (capMaleOk) { if (sessionId === playbackSessionId && onEnd) onEnd(); return; }
  const maleOsVoice = findStrictMaleOsVoice(lang);
  if (maleOsVoice && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    notifySpeaking(true);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = 0.92;
    utterance.voice = maleOsVoice;
    utterance.onend = () => { if (sessionId === playbackSessionId) { notifySpeaking(false); if (onEnd) onEnd(); } };
    utterance.onerror = (e) => { if (sessionId === playbackSessionId) { notifySpeaking(false); if (onError) onError(e); } };
    window.speechSynthesis.speak(utterance);
    return;
  }
  if (isZh && currentMode === 'device') {
    const ok = await tryPlayGenuineMaleChinese(clean, rate, sessionId);
    if (ok) { if (sessionId === playbackSessionId && onEnd) onEnd(); return; }
  }
  if (onError) onError(new Error('تأكد من الاتصال بالإنترنت لتشغيل صوت الرجل الاستوديو الواضح.'));
}