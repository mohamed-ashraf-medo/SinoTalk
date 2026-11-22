// src/services/readingSpeechService.ts
// Reliable Chinese (zh-CN) Speech Recognition for Story Reading Evaluation.
// - On Capacitor Android APK: uses native Google Voice Popup (popup: true) which works reliably across all Android devices & immediately returns spoken Chinese!
// - On Web (Chrome/Edge): uses continuous Web Speech API with interim results and clear error reporting.

import { detectPlatform } from './platformBridge';

export interface ReadingMicSession {
  stop: () => Promise<string>;
}

export async function startContinuousChineseReading({
  onLiveTranscript,
  onFinalTranscript,
  onError
}: {
  onLiveTranscript: (fullTranscript: string) => void;
  onFinalTranscript?: (finalText: string) => void;
  onError: (msg: string) => void;
}): Promise<ReadingMicSession | null> {
  const platform = detectPlatform();
  let accumulated = '';
  let interim = '';

  if (platform === 'capacitor') {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      const avail = await SpeechRecognition.available();
      if (!avail.available) {
        onError('خدمة التعرّف على الصوت غير مفعّلة على الهاتف. فعّل تطبيق Google من إعدادات الجهاز.');
        return null;
      }

      const perm = await SpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') {
        const req = await SpeechRecognition.requestPermissions();
        if (req.speechRecognition !== 'granted') {
          onError('يرجى السماح بإذن الميكروفون للتطبيق من إعدادات الهاتف.');
          return null;
        }
      }

      SpeechRecognition.start({
        language: 'zh-CN',
        maxResults: 3,
        prompt: 'اقرأ الجملة بالصينية الآن... 请朗读中文',
        partialResults: false,
        popup: true
      })
        .then((res) => {
          const best = res?.matches?.[0]?.trim() || '';
          if (best) {
            accumulated = best;
            onLiveTranscript(best);
            if (onFinalTranscript) onFinalTranscript(best);
          } else {
            onError('لم يتم التقاط كلام صيني واضح — حاول القراءة بصوت أوضح.');
          }
        })
        .catch(() => {
          onError('تم إلغاء الميكروفون أو تعذر الاتصال بخدمة الصوت (تأكد من الاتصال بالإنترنت).');
        });

      return {
        stop: async () => {
          try {
            await SpeechRecognition.stop();
          } catch {}
          return accumulated.trim();
        }
      };
    } catch (err) {
      console.warn('Capacitor SpeechRecognition error:', err);
      onError('تعذر تشغيل ميكروفون الأندرويد — تأكد من منح إذن الميكروفون.');
      return null;
    }
  }

  if (platform === 'electron') {
    onError('ملاحظة: نسخة سطح المكتب (.exe) لا تحتوي على مفتاح Google STT المدمج — استخدم نسخة الأندرويد (.apk) أو متصفح Chrome/Edge للميكروفون.');
    return null;
  }

  const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRec) {
    onError('الميكروفون غير مدعوم في هذا المتصفح. يُرجى استخدام Chrome أو Edge أو تطبيق الأندرويد.');
    return null;
  }

  const recognition = new SpeechRec();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  let stoppedManually = false;

  recognition.onresult = (event: any) => {
    let finalPart = '';
    let interimPart = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) finalPart += piece;
      else interimPart += piece;
    }
    if (finalPart) accumulated = (accumulated + finalPart).trim();
    interim = interimPart;
    onLiveTranscript((accumulated + interim).trim());
  };

  recognition.onerror = (event: any) => {
    if (stoppedManually) return;
    if (event.error === 'not-allowed') onError('تم رفض إذن الميكروفون. يرجى تفعيل إذن الميكروفون للمتصفح.');
    else if (event.error === 'network') onError('تعذر الاتصال بخدمة التعرّف الصوتي (تأكد من الاتصال بالإنترنت أو استخدم Chrome/Android).');
    else if (event.error !== 'no-speech') onError('تعذر التقاط الصوت الصيني — تحدث بوضوح وحاول مجدداً.');
  };

  recognition.onend = () => {
    if (!stoppedManually) {
      const combined = (accumulated + interim).trim();
      if (combined && onFinalTranscript) onFinalTranscript(combined);
    }
  };

  try {
    recognition.start();
  } catch {
    onError('تعذر تشغيل الميكروفون.');
    return null;
  }

  return {
    stop: async () => {
      stoppedManually = true;
      try {
        recognition.stop();
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
      return (accumulated + interim).trim();
    }
  };
}