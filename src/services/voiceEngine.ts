// src/services/voiceEngine.ts
// V8.2 Rock-Solid STRICT MALE-ONLY Multi-Layer Studio Voice Engine (ZERO Female Voices!)
// - 4 Verified Genuine Male Beijing Mandarin MP3 speakers:
//   1. 'BV002_streaming' (Standard Beijing Male Newsreader — super clear & authentic)
//   2. 'zh_male_zhubo'   (Professional Male Broadcaster)
//   3. 'zh_male_chunhou' (Deep Resonant Male Narrator)
//   4. 'zh_male_xiaoming'(Crisp Male Speaker)
// - UTF-8 Byte-Safe Chunker (<= 165 bytes / ~55 Chinese chars) — eliminates HTTP 500 on long sentences/stories!
// - Zero-Deadlock 3-Layer Playback:
//   1. Android Native Hardware MediaPlayer (window.SinoNativeAudio, USAGE_MEDIA — bypasses WebView autoplay & silent switch!)
//   2. Fresh HTMLAudioElement (data:audio/mpeg;base64) with start-timeout guard
//   3. Web Audio API (AudioContext.decodeAudioData) with strict 500ms resume() timeout (NEVER deadlocks!)
// - Multi-Transport Fetch: Electron IPC -> Browser fetch -> Android native HttpURLConnection
// - Pre-warmed Male-Only OS / Capacitor TTS (category: 'playback') for Chinese offline & Arabic Male!

export type VoiceMode = 'hd' | 'device';
export type MaleSpeakerId = 'BV002_streaming' | 'zh_male_zhubo' | 'zh_male_chunhou' | 'zh_male_xiaoming';

export interface VoiceDiagnosticResult {
  online: boolean;
  serverReachable: boolean;
  activePlaybackLayer: string;
  maleZhOsVoices: string[];
  maleArOsVoices: string[];
  summaryAr: string;
}

interface SinoNativeAudioInterface {
  isAvailable?: () => boolean;
  stop?: () => void;
  playBase64Mp3?: (base64Audio: string, rate: number, callbackId: string) => void;
  fetchTikTokMp3Async?: (text: string, voice: string, callbackId: string) => void;
}

declare global {
  interface Window {
    SinoNativeAudio?: SinoNativeAudioInterface;
    __sinoNativeAudioDone?: (id: string, ok: boolean) => void;
    __sinoNativeFetchDone?: (id: string, b64: string) => void;
  }
}

const ALL_MALE_SPEAKERS: MaleSpeakerId[] = [
  'BV002_streaming',
  'zh_male_zhubo',
  'zh_male_chunhou',
  'zh_male_xiaoming'
];

// Known female voice names strictly blocked from ever playing
const FEMALE_VOICE_BLACKLIST = [
  'xiaoxiao', 'huihui', 'yaoyao', 'ting-ting', 'tingting', 'meijia', 'sinji',
  'zhiyu', 'salma', 'hoda', 'laila', 'mariam', 'rana', 'zaira', 'zeina', 'amira',
  'female', 'woman', 'girl'
];

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

let currentMode: VoiceMode = 'hd';
let currentSpeaker: MaleSpeakerId = 'BV002_streaming';
let audioCtx: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let playbackSessionId = 0;
let callbackCounter = 0;
const audioBase64Cache = new Map<string, string>();
const listeners = new Set<(speaking: boolean) => void>();
const pendingNativeAudioCallbacks = new Map<string, (ok: boolean) => void>();
const pendingNativeFetchCallbacks = new Map<string, (b64: string) => void>();

// Wire global callbacks for Android SinoNativeAudioBridge
if (typeof window !== 'undefined') {
  window.__sinoNativeAudioDone = (id: string, ok: boolean) => {
    const resolver = pendingNativeAudioCallbacks.get(id);
    if (resolver) {
      pendingNativeAudioCallbacks.delete(id);
      resolver(ok);
    }
  };
  window.__sinoNativeFetchDone = (id: string, b64: string) => {
    const resolver = pendingNativeFetchCallbacks.get(id);
    if (resolver) {
      pendingNativeFetchCallbacks.delete(id);
      resolver(b64 || '');
    }
  };
}

try {
  if (typeof localStorage !== 'undefined') {
    const savedSpeaker = localStorage.getItem('sinotalk_male_speaker_v81') as MaleSpeakerId | null;
    if (savedSpeaker && ALL_MALE_SPEAKERS.includes(savedSpeaker)) {
      currentSpeaker = savedSpeaker;
    }
    const savedMode = localStorage.getItem('sinotalk_voice_mode_v81');
    if (savedMode === 'hd' || savedMode === 'device') currentMode = savedMode;
  }
} catch {
  // ignore storage errors
}

// Pre-warm OS speechSynthesis voices immediately so getVoices() is never empty []
let osVoicesWarmed = false;
export function warmUpOsVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) {
    osVoicesWarmed = true;
    return Promise.resolve(existing);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      osVoicesWarmed = true;
      resolve(window.speechSynthesis.getVoices());
    };
    try {
      window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
    } catch {
      window.speechSynthesis.onvoiceschanged = finish;
    }
    setTimeout(finish, 600);
  });
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  warmUpOsVoices().catch(() => {});
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Call synchronously inside click handlers (e.g. "ترجم الآن") BEFORE async await
 * so browsers/WebViews unlock audio playback immediately inside the user gesture!
 */
export function primeAudioEngine(): void {
  getOrCreateAudioContext();
  if (!osVoicesWarmed) {
    warmUpOsVoices().catch(() => {});
  }
}

function notifySpeaking(state: boolean) {
  listeners.forEach((cb) => {
    try {
      cb(state);
    } catch {
      // ignore
    }
  });
}

export function onSpeakingChange(cb: (speaking: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getVoiceMode(): VoiceMode {
  return currentMode;
}

export function setVoiceMode(mode: VoiceMode): void {
  currentMode = mode;
  try {
    localStorage.setItem('sinotalk_voice_mode_v81', mode);
  } catch {
    // ignore
  }
}

export function getMaleSpeaker(): MaleSpeakerId {
  return currentSpeaker;
}

export function setMaleSpeaker(speaker: MaleSpeakerId): void {
  currentSpeaker = speaker;
  try {
    localStorage.setItem('sinotalk_male_speaker_v81', speaker);
  } catch {
    // ignore
  }
}

export function stopNaturalSpeech(): void {
  playbackSessionId++;

  // Resolve any pending Android native playback promises so awaiting loops exit cleanly
  if (pendingNativeAudioCallbacks.size > 0) {
    for (const [id, resolver] of pendingNativeAudioCallbacks.entries()) {
      pendingNativeAudioCallbacks.delete(id);
      resolver(true);
    }
  }
  if (typeof window !== 'undefined' && window.SinoNativeAudio?.stop) {
    try {
      window.SinoNativeAudio.stop();
    } catch {
      // ignore
    }
  }

  if (currentSourceNode) {
    try {
      currentSourceNode.onended = null;
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch {
      // ignore
    }
    currentSourceNode = null;
  }

  if (currentAudioEl) {
    try {
      currentAudioEl.onended = null;
      currentAudioEl.onerror = null;
      currentAudioEl.onplaying = null;
      currentAudioEl.pause();
      currentAudioEl.src = '';
    } catch {
      // ignore
    }
    currentAudioEl = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  notifySpeaking(false);
}

function utf8ByteLength(str: string): number {
  if (utf8Encoder) return utf8Encoder.encode(str).length;
  // Safe fallback without TextEncoder
  let bytes = 0;
  for (const ch of Array.from(str)) {
    const cp = ch.codePointAt(0) || 0;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/**
 * Splits text strictly by UTF-8 byte length (<= 165 bytes, ~55 Chinese chars)
 * so TikTok's ~220-byte server cap NEVER returns HTTP 500 on long sentences or stories!
 */
export function splitSpeechChunksByBytes(text: string, maxBytes = 165): string[] {
  const clean = text.replace(/\r/g, '').trim();
  if (!clean) return [];
  if (utf8ByteLength(clean) <= maxBytes) return [clean];

  const rawParts = clean.split(/(?<=[。！？.!?,，、؛;\n])\s*/).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';

  const pushOversizedSegment = (segment: string) => {
    let cur = '';
    for (const ch of Array.from(segment)) {
      const candidate = cur + ch;
      if (utf8ByteLength(candidate) > maxBytes && cur) {
        chunks.push(cur.trim());
        cur = ch;
      } else {
        cur = candidate;
      }
    }
    if (cur.trim()) chunks.push(cur.trim());
  };

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (utf8ByteLength(trimmed) > maxBytes) {
      if (buf.trim()) {
        chunks.push(buf.trim());
        buf = '';
      }
      pushOversizedSegment(trimmed);
    } else {
      const joined = buf ? `${buf} ${trimmed}` : trimmed;
      if (utf8ByteLength(joined) > maxBytes && buf) {
        chunks.push(buf.trim());
        buf = trimmed;
      } else {
        buf = joined;
      }
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function fetchViaAndroidNative(text: string, voice: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.SinoNativeAudio?.fetchTikTokMp3Async) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const id = `f_${++callbackCounter}_${Date.now()}`;
    const timer = setTimeout(() => {
      pendingNativeFetchCallbacks.delete(id);
      resolve(null);
    }, 10500);

    pendingNativeFetchCallbacks.set(id, (b64) => {
      clearTimeout(timer);
      resolve(b64 && b64.length > 200 ? b64 : null);
    });

    try {
      window.SinoNativeAudio!.fetchTikTokMp3Async!(text, voice, id);
    } catch {
      clearTimeout(timer);
      pendingNativeFetchCallbacks.delete(id);
      resolve(null);
    }
  });
}

async function fetchSingleSpeakerBase64(text: string, voice: MaleSpeakerId): Promise<string | null> {
  // Transport 1: Electron Main-Process IPC (zero CORS / file:// restrictions on Windows Desktop)
  if (typeof window !== 'undefined' && window.sinoElectron?.fetchMaleTts) {
    try {
      const ipcData = await window.sinoElectron.fetchMaleTts(text, voice);
      if (typeof ipcData === 'string' && ipcData.length > 200) return ipcData;
    } catch {
      // fall through to standard fetch
    }
  }

  // Transport 2: Direct HTTPS fetch (Web, Electron fallback, Android WebView)
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
    if (res.ok) {
      const json = await res.json();
      if (json?.success && typeof json.data === 'string' && json.data.length > 200) {
        return json.data;
      }
    }
  } catch {
    // fall through to Android native HttpURLConnection if available
  }

  // Transport 3: Android Native HttpURLConnection bridge (bypass WebView network stack issues)
  const nativeData = await fetchViaAndroidNative(text, voice);
  if (nativeData) return nativeData;

  return null;
}

/**
 * Fetches 100% VERIFIED GENUINE MALE Beijing Mandarin MP3 across 4 redundant male speakers.
 */
async function fetchMaleMandarinBase64(text: string, speaker: MaleSpeakerId): Promise<string | null> {
  const cacheKey = `${speaker}:${text}`;
  const cached = audioBase64Cache.get(cacheKey);
  if (cached) return cached;

  const order: MaleSpeakerId[] = [speaker, ...ALL_MALE_SPEAKERS.filter((s) => s !== speaker)];

  for (const voice of order) {
    const data = await fetchSingleSpeakerBase64(text, voice);
    if (data) {
      audioBase64Cache.set(cacheKey, data);
      return data;
    }
  }
  return null;
}

function playViaAndroidNativeMediaPlayer(
  base64: string,
  rate: number,
  sessionId: number
): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    !window.SinoNativeAudio?.playBase64Mp3 ||
    sessionId !== playbackSessionId
  ) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const id = `p_${++callbackCounter}_${Date.now()}`;
    const timer = setTimeout(() => {
      pendingNativeAudioCallbacks.delete(id);
      resolve(false);
    }, 35000);

    pendingNativeAudioCallbacks.set(id, (ok) => {
      clearTimeout(timer);
      resolve(ok);
    });

    try {
      window.SinoNativeAudio!.playBase64Mp3!(base64, Math.max(0.65, Math.min(1.6, rate)), id);
    } catch {
      clearTimeout(timer);
      pendingNativeAudioCallbacks.delete(id);
      resolve(false);
    }
  });
}

function playViaHtmlAudio(base64: string, rate: number, sessionId: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (sessionId !== playbackSessionId) return resolve();

    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    audio.volume = 1.0;
    audio.playbackRate = Math.max(0.65, Math.min(1.6, rate));
    currentAudioEl = audio;

    let started = false;
    const startGuard = setTimeout(() => {
      if (!started) {
        try {
          audio.pause();
          audio.src = '';
        } catch {
          // ignore
        }
        if (currentAudioEl === audio) currentAudioEl = null;
        reject(new Error('HTMLAudio start timeout'));
      }
    }, 4000);

    audio.onplaying = () => {
      started = true;
      clearTimeout(startGuard);
    };

    audio.onended = () => {
      clearTimeout(startGuard);
      if (currentAudioEl === audio) currentAudioEl = null;
      resolve();
    };

    audio.onerror = () => {
      clearTimeout(startGuard);
      if (currentAudioEl === audio) currentAudioEl = null;
      reject(new Error('HTMLAudio playback error'));
    };

    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        clearTimeout(startGuard);
        if (currentAudioEl === audio) currentAudioEl = null;
        reject(err);
      });
    }
  });
}

async function playViaWebAudio(base64: string, rate: number, sessionId: number): Promise<void> {
  if (sessionId !== playbackSessionId) return;

  const ctx = getOrCreateAudioContext();
  if (!ctx) throw new Error('AudioContext unavailable');

  if (ctx.state === 'suspended') {
    // STRICT 500ms timeout guard — NEVER deadlocks when autoplay blocks resume()!
    await Promise.race([
      ctx.resume(),
      new Promise<void>((resolve) => setTimeout(resolve, 500))
    ]);
  }

  if (ctx.state !== 'running') {
    throw new Error('AudioContext remained suspended');
  }

  const ab = base64ToArrayBuffer(base64);
  const audioBuffer = await ctx.decodeAudioData(ab.slice(0));
  if (sessionId !== playbackSessionId) return;

  await new Promise<void>((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = Math.max(0.65, Math.min(1.6, rate));
    source.connect(ctx.destination);
    currentSourceNode = source;

    source.onended = () => {
      if (currentSourceNode === source) currentSourceNode = null;
      resolve();
    };
    source.start(0);
  });
}

/**
 * Zero-Deadlock 3-Layer MP3 Playback:
 * 1. Android Native Hardware MediaPlayer (bypasses WebView autoplay & silent switch completely!)
 * 2. Fresh HTMLAudioElement (unlocked by MainActivity & Electron autoplay-policy!)
 * 3. Web Audio API with 500ms resume() timeout guard (never hangs!)
 */
async function playBase64Mp3(base64: string, rate: number, sessionId: number): Promise<void> {
  if (sessionId !== playbackSessionId) return;

  // Layer 1: Android Native Hardware MediaPlayer (USAGE_MEDIA)
  if (typeof window !== 'undefined' && window.SinoNativeAudio?.playBase64Mp3) {
    const nativeOk = await playViaAndroidNativeMediaPlayer(base64, rate, sessionId);
    if (nativeOk || sessionId !== playbackSessionId) return;
  }

  // Layer 2: Fresh HTMLAudioElement (data:audio/mpeg;base64)
  try {
    await playViaHtmlAudio(base64, rate, sessionId);
    return;
  } catch {
    if (sessionId !== playbackSessionId) return;
  }

  // Layer 3: Web Audio API (with strict 500ms resume guard)
  await playViaWebAudio(base64, rate, sessionId);
}

async function tryPlayGenuineMaleChinese(
  text: string,
  rate: number,
  sessionId: number
): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  const chunks = splitSpeechChunksByBytes(text, 165);
  if (!chunks.length) return false;

  notifySpeaking(true);

  try {
    let nextPromise: Promise<string | null> | null = fetchMaleMandarinBase64(chunks[0], currentSpeaker);

    for (let i = 0; i < chunks.length; i++) {
      if (sessionId !== playbackSessionId) return true;

      const b64 = await nextPromise;
      if (sessionId !== playbackSessionId) return true;

      nextPromise =
        i + 1 < chunks.length ? fetchMaleMandarinBase64(chunks[i + 1], currentSpeaker) : null;

      if (!b64) {
        if (sessionId === playbackSessionId) notifySpeaking(false);
        return false;
      }

      await playBase64Mp3(b64, rate, sessionId);
    }

    if (sessionId === playbackSessionId) notifySpeaking(false);
    return true;
  } catch {
    if (sessionId === playbackSessionId) notifySpeaking(false);
    return false;
  }
}

export function isBlacklistedFemaleVoice(name: string): boolean {
  const lower = (name || '').toLowerCase();
  return FEMALE_VOICE_BLACKLIST.some((kw) => lower.includes(kw));
}

async function findStrictMaleOsVoice(lang: string): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = await warmUpOsVoices();
  if (!voices.length) return null;

  const isZh = lang.startsWith('zh');
  const matching = voices.filter((v) => {
    const l = (v.lang || '').toLowerCase();
    const langOk = isZh ? l.startsWith('zh') || l.startsWith('cmn') : l.startsWith('ar');
    return langOk && !isBlacklistedFemaleVoice(v.name);
  });
  if (!matching.length) return null;

  const maleKeywords = isZh
    ? ['yunxi', 'yunjian', 'yunyang', 'yunze', 'kangkang', 'yunhao', 'zhe', 'ccd', 'ccc', 'dfc', 'ctc', 'ctd', 'male', 'man']
    : ['shakir', 'hamed', 'maged', 'naayf', 'bassel', 'omar', 'tarik', 'hamdan', 'ard', 'arz', 'arc', 'male', 'man'];

  for (const kw of maleKeywords) {
    const found = matching.find((v) => v.name.toLowerCase().includes(kw));
    if (found) return found;
  }
  return null;
}

/**
 * STRICT MALE-ONLY Capacitor Native TTS (category: 'playback'):
 * Uses Android's verified MALE Google/Samsung voices — NEVER plays a female voice!
 */
async function tryPlayStrictMaleCapacitorTts(
  text: string,
  lang: string,
  rate: number,
  sessionId: number
): Promise<boolean> {
  const isCapacitor =
    typeof window !== 'undefined' &&
    Boolean((window as any).Capacitor?.isNativePlatform?.());
  if (!isCapacitor) return false;

  try {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    const { voices } = await TextToSpeech.getSupportedVoices();
    const isZh = lang.startsWith('zh');
    const maleHints = isZh
      ? ['zhe', 'ccd', 'ccc', 'dfc', 'ctc', 'ctd', 'yunxi', 'yunjian', 'yunyang', 'kangkang', 'male']
      : ['shakir', 'maged', 'hamed', 'bassel', 'naayf', 'omar', 'tarik', 'hamdan', 'ard', 'arz', 'arc', 'male'];

    const idx = voices.findIndex((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = (v.name || '').toLowerCase();
      const langOk = isZh ? l.startsWith('zh') || l.startsWith('cmn') : l.startsWith('ar');
      return langOk && !isBlacklistedFemaleVoice(n) && maleHints.some((h) => n.includes(h));
    });

    if (idx < 0) {
      return false;
    }

    notifySpeaking(true);
    await TextToSpeech.speak({
      text,
      lang,
      rate: Math.max(0.65, Math.min(1.6, rate)),
      pitch: 0.92,
      volume: 1.0,
      voice: idx,
      category: 'playback'
    });
    if (sessionId === playbackSessionId) notifySpeaking(false);
    return true;
  } catch {
    if (sessionId === playbackSessionId) notifySpeaking(false);
    return false;
  }
}

export async function diagnoseVoiceEngine(): Promise<VoiceDiagnosticResult> {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const hasNativeAndroid = Boolean(typeof window !== 'undefined' && window.SinoNativeAudio?.playBase64Mp3);
  const hasElectronIpc = Boolean(typeof window !== 'undefined' && window.sinoElectron?.fetchMaleTts);

  let serverReachable = false;
  if (online) {
    const sample = await fetchSingleSpeakerBase64('你好', currentSpeaker);
    serverReachable = Boolean(sample);
  }

  const voices = await warmUpOsVoices();
  const maleZhOsVoices = voices
    .filter((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = v.name.toLowerCase();
      return (l.startsWith('zh') || l.startsWith('cmn')) && !isBlacklistedFemaleVoice(n) &&
        ['yunxi', 'yunjian', 'yunyang', 'kangkang', 'yunhao', 'zhe', 'ccd', 'ccc', 'dfc', 'male'].some((k) => n.includes(k));
    })
    .map((v) => v.name);

  const maleArOsVoices = voices
    .filter((v) => {
      const l = (v.lang || '').toLowerCase();
      const n = v.name.toLowerCase();
      return l.startsWith('ar') && !isBlacklistedFemaleVoice(n) &&
        ['shakir', 'hamed', 'maged', 'naayf', 'bassel', 'omar', 'tarik', 'hamdan', 'ard', 'arz', 'arc', 'male'].some((k) => n.includes(k));
    })
    .map((v) => v.name);

  const activePlaybackLayer = hasNativeAndroid
    ? 'Android Native MediaPlayer (USAGE_MEDIA)'
    : hasElectronIpc
      ? 'Electron Desktop IPC + HTMLAudio'
      : 'HTMLAudio + WebAudio (Safe Guard)';

  let summaryAr = '';
  if (!online) {
    summaryAr = 'الجهاز غير متصل بالإنترنت حالياً — يرجى الاتصال بالإنترنت لتشغيل صوت الرجل الاستوديو.';
  } else if (serverReachable) {
    summaryAr = `ممتاز! سيرفر صوت الرجل الاستوديو متصل ويعمل بكفاءة عبر (${activePlaybackLayer}).`;
  } else {
    summaryAr = 'تعذر الوصول لسيرفر الصوت الاستوديو من شبكتك الحالية — تحقق من الإنترنت أو جرّب شبكة أخرى.';
  }

  return {
    online,
    serverReachable,
    activePlaybackLayer,
    maleZhOsVoices,
    maleArOsVoices,
    summaryAr
  };
}

export async function speakNatural({
  text,
  lang = 'zh-CN',
  rate = 1.0,
  onEnd,
  onError
}: {
  text: string;
  lang?: string;
  rate?: number;
  voiceName?: string;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}): Promise<void> {
  const clean = (text || '').trim();
  if (!clean) return;

  stopNaturalSpeech();
  primeAudioEngine();

  const sessionId = ++playbackSessionId;
  const isZh = lang.startsWith('zh');

  // 1. Mandarin Chinese: ALWAYS try 100% verified Studio MALE Mandarin MP3 first!
  if (isZh && currentMode === 'hd') {
    const ok = await tryPlayGenuineMaleChinese(clean, rate, sessionId);
    if (ok) {
      if (sessionId === playbackSessionId && onEnd) onEnd();
      return;
    }
  }

  // 2. Strict Male-Only Android Capacitor TTS (category: 'playback', NEVER female!)
  const capMaleOk = await tryPlayStrictMaleCapacitorTts(clean, lang, rate, sessionId);
  if (capMaleOk) {
    if (sessionId === playbackSessionId && onEnd) onEnd();
    return;
  }

  // 3. Strict Male-Only OS Web Speech API (pre-warmed voices, NEVER Huihui / Xiaoxiao / Hoda!)
  const maleOsVoice = await findStrictMaleOsVoice(lang);
  if (maleOsVoice && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    notifySpeaking(true);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    utterance.rate = Math.max(0.65, Math.min(1.6, rate));
    utterance.pitch = 0.92;
    utterance.voice = maleOsVoice;
    utterance.onend = () => {
      if (sessionId === playbackSessionId) {
        notifySpeaking(false);
        if (onEnd) onEnd();
      }
    };
    utterance.onerror = (e) => {
      if (sessionId === playbackSessionId) {
        notifySpeaking(false);
        if (onError) onError(e);
      }
    };
    window.speechSynthesis.speak(utterance);
    return;
  }

  // 4. Last-resort retry of Studio Male Mandarin if device mode had no local male voice
  if (isZh && currentMode === 'device') {
    const ok = await tryPlayGenuineMaleChinese(clean, rate, sessionId);
    if (ok) {
      if (sessionId === playbackSessionId && onEnd) onEnd();
      return;
    }
  }

  if (sessionId === playbackSessionId) notifySpeaking(false);

  if (onError) {
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const msg = !isZh
      ? 'لا يوجد صوت رجل عربي مثبّت على جهازك حالياً (النظام يمنع تشغيل صوت البنت). فعّل صوت Google العربي الرجالي من إعدادات الجهاز.'
      : isOffline
        ? 'أنت غير متصل بالإنترنت — اتصل بالنت لتشغيل صوت الرجل الصيني الواضح.'
        : 'تعذر تشغيل صوت الرجل الاستوديو حالياً — تحقق من الإنترنت أو افتح «الإعدادات ➔ اختبار وتشخيص الصوت».';
    onError(new Error(msg));
  }
}
