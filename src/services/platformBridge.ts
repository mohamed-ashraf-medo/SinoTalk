// src/services/platformBridge.ts
// Unified hardware & native bridge for Web, Electron (.exe), and Capacitor Android (.apk)

import { toast } from 'sonner';
import { createSpeechRecognizer as webRecognizer } from './speechService';
import { speakNatural, stopNaturalSpeech, primeAudioEngine } from './voiceEngine';

export { primeAudioEngine };

export type RuntimePlatform = 'electron' | 'capacitor' | 'web';

declare global {
  interface Window {
    sinoElectron?: {
      isElectron: boolean;
      platform: string;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      fetchMaleTts?: (text: string, voice: string) => Promise<string | null>;
      onQuickTranslate: (cb: (text: string) => void) => () => void;
    };
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

export function detectPlatform(): RuntimePlatform {
  if (typeof window !== 'undefined') {
    if (window.sinoElectron?.isElectron) return 'electron';
    if (window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return 'capacitor';
    }
  }
  return 'web';
}

export async function nativeSpeak({
  text,
  lang = 'zh-CN',
  rate = 1.0,
  voiceName = '',
  onEnd,
  onError
}: {
  text: string;
  lang?: string;
  rate?: number;
  voiceName?: string;
  onEnd?: () => void;
  onError?: (e: unknown) => void;
}): Promise<void> {
  const safeErrorHandler =
    onError ||
    ((err: unknown) => {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'تعذر تشغيل الصوت الرجالي — تحقق من اتصال الإنترنت ومستوى الصوت.';
      toast.error(msg);
    });
  await speakNatural({ text, lang, rate, voiceName, onEnd, onError: safeErrorHandler });
}

export async function nativeStopSpeak(): Promise<void> {
  stopNaturalSpeech();
  const platform = detectPlatform();
  if (platform === 'capacitor') {
    try {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      await TextToSpeech.stop();
    } catch {
      // ignore
    }
  }
}

export async function nativeListen({
  lang = 'ar-SA',
  onResult,
  onError,
  onStart,
  onEnd
}: {
  lang: string;
  onResult: (transcript: string) => void;
  onError: (errorMsg: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<{ stop: () => void }> {
  const platform = detectPlatform();

  if (platform === 'capacitor') {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      const avail = await SpeechRecognition.available();
      if (avail.available) {
        const perm = await SpeechRecognition.checkPermissions();
        if (perm.speechRecognition !== 'granted') {
          await SpeechRecognition.requestPermissions();
        }
        if (onStart) onStart();
        const result = await SpeechRecognition.start({
          language: lang,
          maxResults: 1,
          prompt: lang.startsWith('zh') ? '请说话...' : 'تحدث الآن...',
          partialResults: false,
          popup: true
        });
        if (onEnd) onEnd();
        const match = result.matches?.[0];
        if (match) {
          onResult(match);
        } else {
          onError('لم يتم التقاط كلام واضح، حاول مرة أخرى.');
        }
        return {
          stop: () => {
            SpeechRecognition.stop().catch(() => {});
          }
        };
      }
    } catch (err) {
      console.warn('Capacitor SpeechRecognition fallback:', err);
    }
  }

  const recognizer = webRecognizer({ lang, onResult, onError, onStart, onEnd });
  if (recognizer.supported) {
    recognizer.start();
  }
  return { stop: recognizer.stop };
}

export async function nativeCapturePhoto(): Promise<string | null> {
  const platform = detectPlatform();
  if (platform === 'capacitor') {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt
      });
      return photo.dataUrl || null;
    } catch (err) {
      console.warn('Capacitor camera cancelled or unavailable:', err);
      return null;
    }
  }
  return null;
}

export async function nativeShare(title: string, text: string): Promise<boolean> {
  const platform = detectPlatform();
  if (platform === 'capacitor') {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
      return true;
    } catch {
      // fallback below
    }
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text });
      return true;
    } catch {
      // fallback to clipboard
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return false;
  }
  return false;
}
