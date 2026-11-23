// src/components/translator/SmartTranslator.tsx
import React, { useState, useEffect } from 'react';
import {
  Languages,
  ArrowRightLeft,
  Volume2,
  Copy,
  CheckCircle2,
  Share2,
  Trash2,
  Edit3,
  Mic,
  MicOff,
  Sparkles,
  Info,
  BookOpen,
  Layers,
  HelpCircle,
  FileText,
  PenTool,
  X,
  Square,
  Maximize2,
  ImageDown
} from 'lucide-react';
import { TranslationResult, ChineseScript, DictionaryCharacter } from '../../types';
import { requestTranslation } from '../../services/translationService';
import { nativeSpeak, nativeListen, nativeShare, nativeStopSpeak, primeAudioEngine } from '../../services/platformBridge';
import { onSpeakingChange } from '../../services/voiceEngine';
import { exportTranslationCardPNG } from '../../services/shareCardService';
import {
  TranslatorSuggestion,
  getLocalSuggestions,
  fetchOnlinePinyinCandidates,
  isPinyinInput
} from '../../services/translatorSuggestService';
import { toast } from 'sonner';
import { HanziStrokeWriter } from '../../components/ui/HanziStrokeWriter';
import { FullscreenShowCard } from '../../components/ui/FullscreenShowCard';

interface SmartTranslatorProps {
  initialText?: string;
  defaultScript: ChineseScript;
  characters?: DictionaryCharacter[];
  onClearInitialText?: () => void;
}

export const SmartTranslator: React.FC<SmartTranslatorProps> = ({
  initialText = '',
  defaultScript = 'simplified',
  characters = [],
  onClearInitialText
}) => {
  const [inputText, setInputText] = useState(initialText);
  const [direction, setDirection] = useState('auto'); // auto, ar-zh-sim, ar-zh-tra, zh-ar, sim-tra, tra-sim
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [activeTab, setActiveTab] = useState<'breakdown' | 'grammar' | 'examples' | 'alternatives'>('breakdown');
  const [strokeChar, setStrokeChar] = useState<{ word: string; pinyin: string; meaning_ar: string } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [suggestions, setSuggestions] = useState<TranslatorSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Live Tri-Directional Suggestions (Arabic <-> Chinese <-> Pinyin) — Local 0ms + Online Pinyin IME
  useEffect(() => {
    const q = inputText.trim();
    if (!q || q.length > 60) {
      setSuggestions([]);
      return;
    }

    const local = getLocalSuggestions(q, characters);
    setSuggestions(local);

    if (!isPinyinInput(q)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const onlineZhList = await fetchOnlinePinyinCandidates(q);
      if (cancelled || !onlineZhList.length) return;
      const merged: TranslatorSuggestion[] = onlineZhList.map((zh) => {
        const hit = characters.find((c) => c.simplified === zh);
        return {
          zh,
          pinyin: hit?.pinyin || q,
          ar: hit?.meaning_ar || 'اقتراح بينيين أونلاين — اضغط للترجمة الفورية',
          source: 'online-pinyin'
        };
      });
      const existingZh = new Set(merged.map((m) => m.zh));
      for (const item of local) {
        if (!existingZh.has(item.zh)) merged.push(item);
      }
      setSuggestions(merged.slice(0, 8));
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inputText, characters]);

  useEffect(() => {
    return onSpeakingChange(setIsSpeaking);
  }, []);

  useEffect(() => {
    if (initialText) {
      setInputText(initialText);
      handleTranslate(initialText);
      if (onClearInitialText) onClearInitialText();
    }
  }, [initialText]);

  const handleTranslate = async (textToRun?: string) => {
    const text = (textToRun !== undefined ? textToRun : inputText).trim();
    if (!text) return;
    setShowSuggestions(false);
    // Unlock audio engine synchronously inside the click gesture BEFORE awaiting network translation!
    primeAudioEngine();

    setLoading(true);
    try {
      const res = await requestTranslation({ text, direction, characters });
      setResult(res);
      // Auto-read translation aloud with genuine Male voice when autoSpeak is enabled!
      if (autoSpeak && res.simplified) {
        const isZhSource =
          (direction === 'zh-ar' || /[\u4E00-\u9FFF]/.test(text)) &&
          direction !== 'sim-tra' &&
          direction !== 'tra-sim';
        if (isZhSource && res.translated_arabic) {
          nativeSpeak({
            text: res.translated_arabic,
            lang: 'ar-EG',
            rate: speechRate,
            onError: () => {
              // If device lacks a local Male Arabic voice, read the Chinese sentence with Studio Male Mandarin instead of going silent
              nativeSpeak({ text: res.simplified, lang: 'zh-CN', rate: speechRate });
            }
          });
        } else {
          nativeSpeak({ text: res.simplified, lang: 'zh-CN', rate: speechRate });
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء إجراء الترجمة.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleShare = async (res: TranslationResult) => {
    const shareText = `SinoTalk ترجمة:\n${res.original}\n\nالصينية: ${res.simplified}\nبينيين: ${res.pinyin}\nالتقليدية: ${res.traditional}`;
    const shared = await nativeShare('SinoTalk Translation', shareText);
    if (!shared) {
      setCopiedKey('share');
      toast.success('تم نسخ تفاصيل الترجمة لمشاركتها');
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const toggleMic = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const isInputChinese = /[\u4E00-\u9FFF]/.test(inputText) || direction === 'zh-ar';
    const lang = isInputChinese ? 'zh-CN' : 'ar-SA';

    nativeListen({
      lang,
      onStart: () => setIsListening(true),
      onResult: (transcript) => {
        setIsListening(false);
        setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        handleTranslate(transcript);
      },
      onError: (msg) => {
        setIsListening(false);
        toast.error(msg);
      },
      onEnd: () => setIsListening(false)
    });
  };

  const colloquialSamples = [
    { label: 'إزيك عامل إيه', text: 'إزيك عامل إيه' },
    { label: 'تمام الحمد لله', text: 'تمام الحمد لله' },
    { label: 'بكام ده', text: 'بكام ده' },
    { label: 'أنا عايز أروح المطار', text: 'أنا عايز أروح المطار' },
    { label: 'معلش ما تزعلش', text: 'معلش ما تزعلش' },
    { label: 'يلا بينا نمشي', text: 'يلا بينا نمشي' },
    { label: 'فرصة سعيدة جداً', text: 'فرصة سعيدة جداً' },
    { label: 'على عيني وراسي', text: 'على عيني وراسي' }
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header & Direction Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-orange-500/10 text-brand-orange">
            <Languages className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-navy-900 dark:text-white font-arabic">
              المترجم الذكي المتقدم
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ترجمة سياقية واعية باللهجات مع تفكيك نحوي وصوتي متكامل
            </p>
          </div>
        </div>

            {/* Direction Selector + Auto-Speak Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoSpeak((v) => !v)}
            className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors ${
              autoSpeak
                ? 'bg-[#C2410C]/10 text-[#C2410C] dark:text-[#FB923C] border-[#C2410C]/30'
                : 'bg-slate-100 dark:bg-navy-800 text-slate-500 border-transparent'
            }`}
            title="قراءة الترجمة تلقائياً بصوت الرجل فور ظهور النتيجة"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{autoSpeak ? 'نطق تلقائي: مُفعّل' : 'نطق تلقائي: متوقف'}</span>
          </button>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="auto">كشف تلقائي (عربي ⇄ صيني)</option>
            <option value="ar-zh-sim">عربي ➔ صيني مبسط (简体)</option>
            <option value="ar-zh-tra">عربي ➔ صيني تقليدي (繁體)</option>
            <option value="zh-ar">صيني ➔ عربي</option>
            <option value="sim-tra">صيني مبسط ➔ تقليدي (簡 ➔ 繁)</option>
            <option value="tra-sim">صيني تقليدي ➔ مبسط (繁 ➔ 簡)</option>
          </select>
        </div>
      </div>

      {/* Input Box */}
      <div className="relative rounded-3xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm transition-colors">
        {/* Sample Phrase Chips */}
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar text-xs">
          <span className="text-slate-400 whitespace-nowrap font-medium">نماذج دارجة:</span>
          {colloquialSamples.map((s, idx) => (
            <button
              key={idx}
              onClick={() => {
                setInputText(s.text);
                handleTranslate(s.text);
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-orange-500/10 hover:text-brand-orange whitespace-nowrap border border-slate-200 dark:border-slate-700 transition-colors"
            >
              {s.label}
            </button>
          ))}
        </div>

        <textarea
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="اكتب بالعربي، أو بالصيني، أو بالبينيين (مثال: ni hao / بكام ده / 你好) — ستظهر لك اقتراحات فورية..."
          rows={4}
          className="w-full bg-transparent border-0 resize-none text-base sm:text-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none font-arabic"
        />

        {/* Live Tri-Directional Suggestions Dropdown (Arabic <-> Chinese <-> Pinyin) */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="mb-3 rounded-2xl bg-[#F7F6F2] dark:bg-[#090D16] border border-[#E4E0D8] dark:border-slate-800 p-2 space-y-1 max-h-60 overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <span>اقتراحات فورية (اضغط للترجمة):</span>
              <button
                type="button"
                onClick={() => setShowSuggestions(false)}
                className="text-slate-400 hover:text-rose-500"
              >
                إخفاء
              </button>
            </div>
            {suggestions.map((sug, idx) => (
              <button
                key={`${sug.zh}-${idx}`}
                type="button"
                onClick={() => {
                  setInputText(sug.zh);
                  setShowSuggestions(false);
                  handleTranslate(sug.zh);
                }}
                className="w-full px-3 py-2 rounded-xl hover:bg-white dark:hover:bg-[#111827] flex items-center justify-between gap-3 text-start transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl font-bold font-chinese text-navy-900 dark:text-white shrink-0">
                    {sug.zh}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold font-mono text-[#C2410C] dark:text-[#FB923C] truncate">
                      {sug.pinyin}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                      {sug.ar}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-[#C2410C] dark:text-[#FB923C] font-bold shrink-0">
                  {sug.source === 'online-pinyin' ? 'بينيين أونلاين' : 'قاموس'}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Input Bar Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            {/* Microphone Button */}
            <button
              onClick={toggleMic}
              className={`p-2.5 rounded-2xl flex items-center gap-1.5 text-xs font-semibold transition-all ${isListening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-brand-orange'
                }`}
              title="تحدث صوتياً"
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>{isListening ? 'جاري الاستماع...' : 'تحدث'}</span>
            </button>

            {inputText && (
              <button
                onClick={() => {
                  setInputText('');
                  setResult(null);
                }}
                className="p-2.5 rounded-2xl bg-slate-100 dark:bg-navy-800 text-slate-500 hover:text-rose-500 text-xs transition-colors"
                title="مسح النص"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {inputText.length} حرف / {inputText.trim() ? inputText.trim().split(/\s+/).length : 0} كلمة
            </span>
          </div>

          <button
            onClick={() => handleTranslate()}
            disabled={loading || !inputText.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-gradient-to-l from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm shadow-md shadow-orange-500/20 disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>ترجم الآن</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Translation Result Section */}
      {result && (
        <div className="w-full max-w-full overflow-hidden rounded-3xl bg-white dark:bg-navy-900 border border-orange-500/30 p-4 sm:p-6 shadow-lg shadow-orange-500/5 space-y-5 animate-fadeIn">
          {/* Header of Result (strictly wrapped inside frame, zero horizontal overflow!) */}
          <div className="flex flex-col gap-4 pb-4 border-b border-slate-100 dark:border-slate-800 min-w-0 w-full">
            <div className="min-w-0 w-full">
              <span className="inline-block max-w-full text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-500/10 text-brand-orange border border-orange-500/20 break-words">
                {result.source || 'محرك سينوتوك الذكي'}
              </span>

              {/* Main Chinese Output */}
              <div className="text-xl sm:text-2xl font-extrabold text-navy-900 dark:text-white font-chinese mt-2 tracking-wide leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
                {defaultScript === 'traditional' ? result.traditional : result.simplified}
              </div>

              {/* Arabic Translation Output (preserves multi-paragraph stories cleanly inside frame!) */}
              {result.translated_arabic && (
                <div className="flex flex-col items-start gap-2 mt-2 min-w-0 w-full">
                  <div className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-400 font-arabic leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] w-full max-w-full">
                    {result.translated_arabic}
                  </div>
                  <button
                    type="button"
                    onClick={() => nativeSpeak({ text: result.translated_arabic || '', lang: 'ar-EG', rate: speechRate })}
                    className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-300 hover:text-white text-xs font-bold inline-flex items-center gap-1 transition-colors shrink-0"
                    title="استمع للترجمة العربية"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>اسمع بالعربي</span>
                  </button>
                </div>
              )}

              {/* ALL Meanings Card (shows every single sense of a character/word, not just 1-2!) */}
              {result.all_meanings && result.all_meanings.length > 0 && (
                <div className="mt-4 p-4 rounded-2xl bg-[#F7F6F2] dark:bg-[#090D16] border border-[#E4E0D8] dark:border-slate-800 space-y-2.5 min-w-0 w-full">
                  <div className="text-xs font-bold text-[#C2410C] dark:text-[#FB923C]">
                    جميع معاني الرمز / الكلمة الكاملة (كل الاستخدامات):
                  </div>
                  <div className="space-y-2">
                    {result.all_meanings.map((group, gIdx) => (
                      <div key={gIdx} className="space-y-1">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          {group.pos}:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {group.terms.map((term, tIdx) => (
                            <span
                              key={tIdx}
                              className="text-xs px-2.5 py-1 rounded-xl bg-white dark:bg-[#111827] text-navy-900 dark:text-slate-100 border border-[#E4E0D8] dark:border-slate-700 font-medium break-words"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pinyin with tone marks */}
              <div className="flex flex-wrap items-center gap-2 mt-2 min-w-0 w-full">
                <span className="text-sm sm:text-base font-bold text-brand-orange font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
                  {result.pinyin}
                </span>
                {result.phonetic_ar && (
                  <span className="text-xs text-slate-400 bg-slate-100 dark:bg-navy-800 px-2 py-0.5 rounded-md break-words [overflow-wrap:anywhere] max-w-full">
                    نطق تقريبي: {result.phonetic_ar}
                  </span>
                )}
              </div>

              {/* Dual script reference */}
              <div className="flex flex-wrap items-start gap-2 text-xs text-slate-500 dark:text-slate-400 mt-2 min-w-0 w-full">
                <span className="break-words [overflow-wrap:anywhere] max-w-full">المبسط: <strong className="font-chinese text-slate-700 dark:text-slate-200">{result.simplified}</strong></span>
                <span>•</span>
                <span className="break-words [overflow-wrap:anywhere] max-w-full">التقليدي: <strong className="font-chinese text-slate-700 dark:text-slate-200">{result.traditional}</strong></span>
              </div>
            </div>

            {/* Actions Panel */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Playback Speed Control */}
              <div className="flex items-center bg-slate-100 dark:bg-navy-800 rounded-xl p-0.5 text-xs text-slate-600 dark:text-slate-300">
                <button
                  onClick={() => setSpeechRate(0.7)}
                  className={`px-2 py-1 rounded-lg ${speechRate === 0.7 ? 'bg-orange-500 text-white font-bold' : ''}`}
                  title="نطق بطيء 0.7x"
                >
                  0.7x
                </button>
                <button
                  onClick={() => setSpeechRate(1.0)}
                  className={`px-2 py-1 rounded-lg ${speechRate === 1.0 ? 'bg-orange-500 text-white font-bold' : ''}`}
                  title="نطق عادي 1.0x"
                >
                  1.0x
                </button>
                <button
                  onClick={() => setSpeechRate(1.3)}
                  className={`px-2 py-1 rounded-lg ${speechRate === 1.3 ? 'bg-orange-500 text-white font-bold' : ''}`}
                  title="نطق سريع 1.3x"
                >
                  1.3x
                </button>
              </div>

              {/* Audio Play / Stop Button */}
              {isSpeaking ? (
                <button
                  onClick={() => nativeStopSpeak()}
                  className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 text-xs font-bold shadow-sm transition-all"
                  title="إيقاف النطق"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>إيقاف</span>
                </button>
              ) : (
                <button
                  onClick={() => nativeSpeak({ text: result.simplified, lang: 'zh-CN', rate: speechRate })}
                  className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C2410C] text-white hover:bg-[#9A3412] text-xs font-bold shadow-sm transition-all"
                  title="استمع للنطق الصيني بصوت رجل واضح"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>اسمع بالصيني (صوت رجل)</span>
                </button>
              )}

              {/* Copy Translation */}
              <button
                onClick={() => handleCopy(result.simplified, 'sim')}
                className="p-2 rounded-xl bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-brand-orange text-xs transition-colors"
                title="نسخ الترجمة"
              >
                {copiedKey === 'sim' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              </button>

              {/* Copy Pinyin */}
              <button
                onClick={() => handleCopy(result.pinyin, 'py')}
                className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-brand-orange text-xs font-mono transition-colors"
                title="نسخ البينيين"
              >
                {copiedKey === 'py' ? 'تم النسخ!' : 'Pinyin'}
              </button>

              {/* Share */}
              <button
                onClick={() => handleShare(result)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-brand-orange text-xs transition-colors"
                title="مشاركة الترجمة"
                aria-label="مشاركة الترجمة"
              >
                <Share2 className="w-4 h-4" />
              </button>

              {/* Fullscreen Giant Show Card */}
              <button
                onClick={() => setShowFullscreen(true)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-[#C2410C] text-xs transition-colors"
                title="عرض بملء الشاشة بخط ضخم"
                aria-label="عرض بملء الشاشة"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Save PNG Card */}
              <button
                onClick={() => {
                  exportTranslationCardPNG({
                    original: result.original,
                    chinese: defaultScript === 'traditional' ? result.traditional : result.simplified,
                    pinyin: result.pinyin,
                    phoneticAr: result.phonetic_ar
                  });
                  toast.success('تم حفظ بطاقة الترجمة كصورة PNG');
                }}
                className="p-2 rounded-xl bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-[#C2410C] text-xs transition-colors"
                title="حفظ الترجمة كصورة PNG للمشاركة"
                aria-label="حفظ كصورة PNG"
              >
                <ImageDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Context Note (e.g., Egyptian Dialect, Politeness) */}
          {result.context_note && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <Info className="w-4 h-4 text-amber-500" />
                <span>فهم السياق واللهجة الدارجة:</span>
              </div>
              <p className="leading-relaxed">{result.context_note}</p>
            </div>
          )}

          {/* Tabs for Details (Word Breakdown, Grammar, Examples, Alternatives) */}
          <div>
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-bold">
              <button
                onClick={() => setActiveTab('breakdown')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors ${activeTab === 'breakdown'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>تفكيك المفردات ({result.breakdown.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('grammar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors ${activeTab === 'grammar'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>القواعد والبنية</span>
              </button>

              <button
                onClick={() => setActiveTab('examples')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors ${activeTab === 'examples'
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>جمل وأمثلة ({result.examples.length})</span>
              </button>

              {result.alternatives && result.alternatives.length > 0 && (
                <button
                  onClick={() => setActiveTab('alternatives')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors ${activeTab === 'alternatives'
                      ? 'bg-orange-500 text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تعبيرات بديلة</span>
                </button>
              )}
            </div>

            {/* Tab 1: Word-by-Word Breakdown (click any Hanzi to view step-by-step stroke drawing!) */}
            {activeTab === 'breakdown' && (
              <div className="pt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {result.breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-[#F7F6F2] dark:bg-navy-950 border border-[#E4E0D8] dark:border-slate-800 flex flex-col items-center text-center transition-all hover:border-[#C2410C]/50"
                  >
                    <span className="text-2xl font-bold text-navy-900 dark:text-white font-chinese">
                      {item.word}
                    </span>
                    <span className="text-xs font-semibold text-[#C2410C] dark:text-[#FB923C] font-mono mt-0.5">
                      {item.pinyin}
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-tight">
                      {item.meaning_ar}
                    </span>
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        onClick={() => nativeSpeak({ text: item.word, lang: 'zh-CN' })}
                        className="text-slate-500 hover:text-[#C2410C] p-1.5 rounded-lg hover:bg-white dark:hover:bg-navy-800"
                        title="نطق الرمز"
                        aria-label={`نطق ${item.word}`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setStrokeChar(item)}
                        className="text-slate-500 hover:text-[#C2410C] p-1.5 rounded-lg hover:bg-white dark:hover:bg-navy-800 flex items-center gap-0.5 text-[10px] font-bold"
                        title="كيف يُرسم هذا الرمز خطوة بخطوة؟"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                        <span>ارسمه</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 2: Grammar Explanation */}
            {activeTab === 'grammar' && (
              <div className="pt-4 p-4 rounded-2xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-arabic">
                <div className="flex items-center gap-2 font-bold text-brand-orange mb-2">
                  <BookOpen className="w-4 h-4" />
                  <span>الشرح النحوي وتركيب الجملة:</span>
                </div>
                <p>{result.grammar_note || "تعتمد الترجمة على القواعد الأساسية للغة الصينية ومطابقتها مع المعنى العربي."}</p>
              </div>
            )}

            {/* Tab 3: Example Sentences */}
            {activeTab === 'examples' && (
              <div className="pt-4 space-y-3">
                {result.examples.map((ex, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3"
                  >
                    <div>
                      <div className="text-base font-bold text-navy-900 dark:text-white font-chinese">
                        {ex.zh}
                      </div>
                      <div className="text-xs font-semibold text-brand-orange font-mono mt-0.5">
                        {ex.pinyin}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                        {ex.ar}
                      </div>
                    </div>
                    <button
                      onClick={() => nativeSpeak({ text: ex.zh, lang: 'zh-CN' })}
                      className="p-2 rounded-xl bg-white dark:bg-navy-800 text-slate-500 hover:text-brand-orange border border-slate-200 dark:border-slate-700 shrink-0"
                      title="نطق المثال"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 4: Alternatives & Synonyms */}
            {activeTab === 'alternatives' && (
              <div className="pt-4 space-y-2">
                {result.alternatives.map((alt, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between"
                  >
                    <span>{alt}</span>
                    <button
                      onClick={() => nativeSpeak({ text: alt.split(' ')[0], lang: 'zh-CN' })}
                      className="text-slate-400 hover:text-brand-orange p-1"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stroke-Order Modal for any Breakdown Character */}
      {strokeChar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/75 backdrop-blur-sm animate-fadeIn"
          onClick={() => setStrokeChar(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`خطوات رسم الرمز ${strokeChar.word}`}
        >
          <div
            className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-navy-900 dark:text-white">
                  طريقة رسم الرمز: <span className="font-chinese text-lg">{strokeChar.word}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">{strokeChar.meaning_ar}</p>
              </div>
              <button
                onClick={() => setStrokeChar(null)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-navy-800 text-slate-500 hover:text-rose-500"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <HanziStrokeWriter
              character={strokeChar.word}
              pinyin={strokeChar.pinyin}
              size={180}
            />
          </div>
        </div>
      )}
      {/* Fullscreen Show Card */}
      {result && (
        <FullscreenShowCard
          isOpen={showFullscreen}
          onClose={() => setShowFullscreen(false)}
          chinese={defaultScript === 'traditional' ? result.traditional : result.simplified}
          pinyin={result.pinyin}
          original={result.original}
          phoneticAr={result.phonetic_ar}
        />
      )}
    </div>
  );
};
