// src/features/dashboard/Dashboard.tsx
// V8.3 Smart Quick Search & Editorial Dashboard
// - Quick Search matches Smart Translator + 8,050-char Dictionary power:
//   * Tri-directional live suggestions (Arabic <-> Chinese <-> Pinyin)
//   * Full Character Dossier (Simplified, Traditional, Pinyin, Arabic Phonetic, HSK, Strokes, Tone, Category, Compounds, HanziStrokeWriter)
//   * ALL Meanings (all_meanings from Neural GTX + CC-CEDICT — zero truncation!)
//   * Studio Male Voice (Chinese + Egyptian Arabic) with 0.7x/1.0x/1.3x speed & Stop button
//   * Breakdown / Grammar / Examples / Alternatives tabs right inside Quick Search
//   * Full WCAG AA accessibility (native <button> cards, 44px touch targets, focus-visible rings, tabular-nums)

import React, { useState, useEffect, useMemo } from 'react';
import {
  Languages,
  BookOpen,
  Mic,
  MessagesSquare,
  Camera,
  FileText,
  Sparkles,
  CheckCircle2,
  Volume2,
  Square,
  Copy,
  ChevronLeft,
  Briefcase,
  GraduationCap,
  BookMarked,
  Pencil,
  PenTool,
  Music2,
  Blocks,
  Award,
  HelpCircle,
  Layers,
  Info,
  X
} from 'lucide-react';
import { TabType, TranslationResult, DictionaryCharacter } from '../../types';
import { requestTranslation } from '../../services/translationService';
import { nativeSpeak, nativeStopSpeak, primeAudioEngine } from '../../services/platformBridge';
import { onSpeakingChange } from '../../services/voiceEngine';
import {
  TranslatorSuggestion,
  getLocalSuggestions,
  fetchOnlinePinyinCandidates,
  isPinyinInput
} from '../../services/translatorSuggestService';
import { HanziStrokeWriter } from '../../components/ui/HanziStrokeWriter';
import { toast } from 'sonner';

interface DashboardProps {
  onSelectTab: (tab: TabType) => void;
  totalChars: number;
  characters?: DictionaryCharacter[];
  onQuickTranslate: (text: string) => void;
  onOpenWriting?: (char: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onSelectTab,
  totalChars,
  characters = [],
  onQuickTranslate,
  onOpenWriting
}) => {
  const [quickInput, setQuickInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [quickResult, setQuickResult] = useState<TranslationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [activeTab, setActiveTab] = useState<'breakdown' | 'grammar' | 'examples' | 'alternatives'>('breakdown');
  const [suggestions, setSuggestions] = useState<TranslatorSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [strokeChar, setStrokeChar] = useState<{ word: string; pinyin: string; meaning_ar: string } | null>(null);

  useEffect(() => {
    return onSpeakingChange(setIsSpeaking);
  }, []);

  // Live Tri-Directional Suggestions (Arabic <-> Chinese <-> Pinyin) — Local 0ms + Online Pinyin IME
  useEffect(() => {
    const q = quickInput.trim();
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
          ar: hit?.meaning_ar || 'اقتراح بينيين أونلاين — اضغط للعرض الكامل',
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
  }, [quickInput, characters]);

  // Match exact dictionary character dossier whenever user searches a Hanzi or gets a 1-char result
  const matchedDictChar = useMemo<DictionaryCharacter | null>(() => {
    if (!quickResult || characters.length === 0) return null;
    const sim = (quickResult.simplified || '').trim();
    const orig = (quickResult.original || '').trim();
    const candidate = sim.length === 1 ? sim : orig.length === 1 ? orig : '';
    if (!candidate) return null;
    return (
      characters.find((c) => c.simplified === candidate || c.traditional === candidate) || null
    );
  }, [quickResult, characters]);

  // Merge all dictionary + neural examples cleanly without duplicates
  const combinedExamples = useMemo(() => {
    const list: Array<{ zh: string; pinyin: string; ar: string }> = [];
    const seen = new Set<string>();
    const pushItem = (ex: { zh: string; pinyin: string; ar: string }) => {
      if (ex?.zh && !seen.has(ex.zh)) {
        seen.add(ex.zh);
        list.push(ex);
      }
    };
    if (matchedDictChar?.examples) {
      matchedDictChar.examples.forEach(pushItem);
    }
    if (quickResult?.examples) {
      quickResult.examples.forEach(pushItem);
    }
    return list;
  }, [matchedDictChar, quickResult]);

  const sampleChips = [
    { label: '爱 (حب)', text: '爱' },
    { label: 'إزيك عامل إيه؟ (مصري)', text: 'إزيك عامل إيه؟' },
    { label: 'بكام ده؟ (تسوق)', text: 'بكام ده؟' },
    { label: '打 (رمز متعدد المعاني)', text: '打' },
    { label: 'شكراً جزيلاً', text: 'شكراً جزيلاً' },
    { label: 'أهلاً وسهلاً بك في مصر', text: 'أهلاً وسهلاً بك في مصر' }
  ];

  const handleTranslate = async (textToTranslate?: string) => {
    const text = (textToTranslate !== undefined ? textToTranslate : quickInput).trim();
    if (!text) return;
    setShowSuggestions(false);
    // Unlock audio engine synchronously inside the click gesture BEFORE awaiting network translation
    primeAudioEngine();

    setLoading(true);
    try {
      const res = await requestTranslation({ text, direction: 'auto', characters });
      setQuickResult(res);
      setActiveTab('breakdown');
      if (autoSpeak && res.simplified) {
        const isZhSource = /[\u4E00-\u9FFF]/.test(text);
        if (isZhSource && res.translated_arabic) {
          nativeSpeak({ text: res.translated_arabic, lang: 'ar-EG', rate: speechRate });
        } else {
          nativeSpeak({ text: res.simplified, lang: 'zh-CN', rate: speechRate });
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'حدث خطأ أثناء إجراء البحث والترجمة.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const featureCards = [
    {
      tab: 'translator' as TabType,
      title: 'المترجم الذكي',
      subtitle: 'Smart Translator',
      desc: 'ترجمة فورية سياقية للقصص الكاملة واللهجة المصرية، مع جميع معاني الرموز ونطق رجل استوديو واضح.',
      icon: Languages,
      color: 'bg-[#C2410C] text-white',
      badge: 'فوري وسياقي'
    },
    {
      tab: 'dictionary' as TabType,
      title: 'القاموس الصيني ورسم الرموز',
      subtitle: 'Dictionary & Stroke Order',
      desc: '8,050 رمزاً معتمداً (HSK 1–9) مع حركة رسم الضربات خطوة بخطوة وجميع المعاني والأمثلة العربية.',
      icon: BookOpen,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: `${totalChars > 0 ? totalChars.toLocaleString('en-US') : '8,050'} رمز`
    },
    {
      tab: 'books' as TabType,
      title: 'مكتبة القصص الصينية (6 كتب)',
      subtitle: '6 Story Books • 900 Pages + Mic',
      desc: '6 كتب قصص متدرجة (150 صفحة لكل كتاب) مع ميكروفون يقرأ معك ويُلوّن الكلمات الغلط بالأحمر لتسمع تصحيحها فوراً!',
      icon: BookMarked,
      color: 'bg-[#C2410C] text-white',
      badge: '900 صفحة'
    },
    {
      tab: 'handwriting' as TabType,
      title: 'ارسم الرمز لتعرف معناه فوراً',
      subtitle: 'Draw Any Hanzi Lookup',
      desc: 'ارسم أي رمز صيني بإصبعك أو الماوس على لوحة واسعة بأحجام قلم متعددة لتظهر كل معانيه ونطقه فوراً.',
      icon: Pencil,
      color: 'bg-[#C2410C] text-white',
      badge: 'لوحة واسعة'
    },
    {
      tab: 'writing' as TabType,
      title: 'أكاديمية الكتابة والرسم الصيني',
      subtitle: 'Hanzi Writing Studio',
      desc: 'تدرّب على كتابة أي كلمة صينية بالترتيب الصحيح مع لوحة حبر حر والقواعد الذهبية السبعة للخط الصيني.',
      icon: PenTool,
      color: 'bg-[#C2410C] text-white',
      badge: 'تفاعلي'
    },
    {
      tab: 'tones' as TabType,
      title: 'مختبر النغمات الصينية الخمس',
      subtitle: '5-Tones Pitch Lab',
      desc: 'أتقن النغمات الأربع والنغمة المحايدة وتعديل النغمة الثالثة بمنحنيات بصرية ونطق رجل واضح.',
      icon: Music2,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: '5 نغمات'
    },
    {
      tab: 'radicals' as TabType,
      title: 'دليل الجذور الصينية الأساسية',
      subtitle: 'Top 50 Chinese Radicals',
      desc: 'تعرّف على أهم 50 جذراً (部首) لفهم معنى آلاف الرموز الصينية من نظرة واحدة مع رابط مباشر للرسم.',
      icon: Blocks,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: '50 جذراً'
    },
    {
      tab: 'quiz' as TabType,
      title: 'اختبار تحديد مستوى HSK',
      subtitle: 'Quick Placement Quiz',
      desc: 'اختبار سريع من 10 أسئلة متدرجة لتحديد مستواك الحالي في اللغة الصينية فوراً بدون تسجيل.',
      icon: Award,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: '10 أسئلة'
    },
    {
      tab: 'phrasebook' as TabType,
      title: 'دليل التجارة والسفر ومحول الأسعار',
      subtitle: 'Trade Phrasebook & RMB Helper',
      desc: 'أهم عبارات التفاوض والمصانع والشحن والمطاعم الحلال + محول أسعار اليوان إلى نطق صيني فوري يعمل 100% أوفلاين.',
      icon: Briefcase,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: 'أوفلاين'
    },
    {
      tab: 'flashcards' as TabType,
      title: 'بطاقات مراجعة HSK الذكية',
      subtitle: 'Interactive HSK Flashcards',
      desc: 'تدرّب على حفظ الـ 8,050 رمز صيني ونطقها الصحيح ببطاقات تفاعلية مصنفة حسب مستويات HSK 1 إلى HSK 9.',
      icon: GraduationCap,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: 'HSK 1–9'
    },
    {
      tab: 'voice' as TabType,
      title: 'الترجمة الصوتية والنطق HD',
      subtitle: 'Natural Voice & Pronunciation',
      desc: 'نطق صيني وعربي بصوت رجل استوديو واضح بـ 3 سرعات مع إدخال صوتي فوري.',
      icon: Mic,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: 'صوت رجل HD'
    },
    {
      tab: 'conversation' as TabType,
      title: 'المحادثة المباشرة',
      subtitle: 'Live Conversation',
      desc: 'حوار مباشر متناوب ثنائي الاتجاه (عربي ⇄ صيني) مع تشغيل صوتي تلقائي للطرفين للاجتماعات والسفر.',
      icon: MessagesSquare,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: 'ثنائي الاتجاه'
    },
    {
      tab: 'camera' as TabType,
      title: 'ترجمة الكاميرا والصور',
      subtitle: 'Camera & Image OCR',
      desc: 'التقاط صور فورية أو رفع لافتات وقوائم طعام بالصينية والعربية واستخراج النصوص وترجمتها فورياً.',
      icon: Camera,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: 'مسح OCR'
    },
    {
      tab: 'documents' as TabType,
      title: 'ترجمة ملفات PDF و Word',
      subtitle: 'PDF & Word Translation',
      desc: 'رفع المستندات والتقارير بصيغتي PDF و DOCX واستخراج الفقرات محلياً وترجمتها وتنزيلها بدون سيرفر.',
      icon: FileText,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: 'بدون سيرفر'
    },
    {
      tab: 'guide' as TabType,
      title: 'دليل الاستخدام المفصّل',
      subtitle: 'Complete Arabic User Guide',
      desc: 'شرح تفصيلي لكل أقسام SinoTalk V8، اختصارات الكيبورد، ونصائح العمل أوفلاين على الأندرويد والويندوز.',
      icon: HelpCircle,
      color: 'bg-[#0F172A] dark:bg-[#1E293B] text-[#FB923C]',
      badge: 'شرح شامل'
    }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-navy-900 via-navy-800 to-slate-900 text-white p-6 sm:p-10 shadow-xl border border-navy-700">
        <div className="absolute top-0 left-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>
        <div className="absolute -bottom-10 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true"></div>

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 text-xs font-semibold mb-4 border border-orange-500/30">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>منصة الترجمة الذكية الاحترافية العربية – الصينية</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight mb-3 font-arabic">
            أهلاً بك في <span className="text-brand-orange">SinoTalk</span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg leading-relaxed mb-6 font-arabic">
            جسرك اللغوي الذكي للتواصل بين العالمين العربي والصيني. ترجمة دقيقة، جميع معاني الرموز، نطق استوديو بصوت رجل صيني وعربي واضح، وقاموس يضم 8,050 رمزاً معتمداً (HSK 1–9).
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectTab('translator')}
              className="min-h-[44px] flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#C2410C] hover:bg-[#9A3412] text-white font-bold text-sm shadow-lg shadow-orange-500/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>بدء الترجمة الآن</span>
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('dictionary')}
              className="min-h-[44px] flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm backdrop-blur-md border border-white/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <BookOpen className="w-4 h-4 text-orange-300" aria-hidden="true" />
              <span>تصفح القاموس الصيني</span>
            </button>
          </div>
        </div>
      </div>

      {/* Upgraded Smart Quick Search & Full Character Dossier Card */}
      <section
        aria-labelledby="quick-search-heading"
        className="rounded-3xl bg-white dark:bg-[#111827] p-5 sm:p-8 shadow-sm border border-[#E4E0D8] dark:border-slate-800 transition-colors"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#C2410C]/10 text-[#C2410C] dark:text-[#FB923C]">
              <Languages className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h2 id="quick-search-heading" className="text-lg sm:text-xl font-bold text-navy-900 dark:text-white font-arabic">
                البحث والترجمة السريعة الذكية
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                اكتب أي رمز صيني أو كلمة عربية أو بينيين ليظهر لك كل ما يخصه: جميع المعاني، الرسم، المركبات، القواعد، والنطق بصوت الرجل!
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoSpeak((v) => !v)}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${
                autoSpeak
                  ? 'bg-[#C2410C]/10 text-[#C2410C] dark:text-[#FB923C] border-[#C2410C]/30'
                  : 'bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 border-transparent'
              }`}
              aria-pressed={autoSpeak}
            >
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{autoSpeak ? 'نطق تلقائي: مُفعّل' : 'نطق تلقائي: متوقف'}</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('translator')}
              className="min-h-[40px] px-2.5 text-xs font-bold text-[#C2410C] dark:text-[#FB923C] hover:underline flex items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
            >
              <span>المترجم المتقدم</span>
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Sample Phrase & Character Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {sampleChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuickInput(chip.text);
                handleTranslate(chip.text);
              }}
              className="min-h-[38px] text-xs px-3 py-1.5 rounded-xl bg-[#F7F6F2] dark:bg-navy-800 text-slate-700 dark:text-slate-200 hover:bg-[#C2410C]/10 hover:text-[#C2410C] dark:hover:text-[#FB923C] border border-[#E4E0D8] dark:border-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Accessible Input & Primary Submit CTA */}
        <div className="space-y-2">
          <label htmlFor="quick-search-input" className="sr-only">
            ابحث عن رمز صيني أو كلمة عربية أو بينيين للترجمة الفورية وعرض كل المعاني
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                id="quick-search-input"
                type="text"
                value={quickInput}
                onChange={(e) => {
                  setQuickInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => e.key === 'Enter' && handleTranslate()}
                placeholder="مثال: 爱 / 打 / ni hao / بكام ده / إزيك عامل إيه..."
                className="w-full min-h-[48px] px-4 py-3 pl-16 rounded-2xl bg-[#FAF9F5] dark:bg-navy-950 border border-[#E4E0D8] dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C2410C] text-base font-arabic"
              />
              {quickInput && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickInput('');
                    setQuickResult(null);
                    setSuggestions([]);
                  }}
                  aria-label="مسح نص البحث"
                  className="absolute left-2 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-rose-600 text-xs font-bold rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleTranslate()}
              disabled={loading || !quickInput.trim()}
              className="min-h-[48px] px-6 py-3 rounded-2xl bg-[#C2410C] hover:bg-[#9A3412] text-white font-bold text-sm shadow-md shadow-orange-500/20 disabled:opacity-50 transition-colors shrink-0 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C2410C]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-label="جاري البحث والترجمة"></div>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  <span>ابحث وترجم الآن</span>
                </>
              )}
            </button>
          </div>

          {/* Live Tri-Directional Suggestions Dropdown (Arabic <-> Chinese <-> Pinyin) */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="rounded-2xl bg-[#F7F6F2] dark:bg-[#090D16] border border-[#E4E0D8] dark:border-slate-800 p-2 space-y-1 max-h-64 overflow-y-auto animate-fadeIn">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                <span>اقتراحات فورية من القاموس (اضغط لعرض كل المعاني):</span>
                <button
                  type="button"
                  onClick={() => setShowSuggestions(false)}
                  className="px-2 py-1 text-slate-500 hover:text-rose-600 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                >
                  إخفاء
                </button>
              </div>
              {suggestions.map((sug, idx) => (
                <button
                  key={`${sug.zh}-${idx}`}
                  type="button"
                  onClick={() => {
                    setQuickInput(sug.zh);
                    setShowSuggestions(false);
                    handleTranslate(sug.zh);
                  }}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white dark:hover:bg-[#111827] flex items-center justify-between gap-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl font-bold font-chinese text-navy-900 dark:text-white shrink-0">
                      {sug.zh}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold font-mono text-[#C2410C] dark:text-[#FB923C] truncate">
                        {sug.pinyin}
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 truncate">
                        {sug.ar}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#C2410C]/10 text-[#C2410C] dark:text-[#FB923C] font-bold shrink-0">
                    {sug.source === 'online-pinyin' ? 'بينيين أونلاين' : 'قاموس 8,050'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Full Smart Quick Search Result Card (Complete Character Dossier + ALL Meanings + Audio + Tabs!) */}
        {quickResult && (
          <div className="mt-5 p-4 sm:p-6 rounded-3xl bg-[#FAF9F5] dark:bg-navy-950/80 border border-[#C2410C]/30 animate-fadeIn overflow-hidden w-full max-w-full space-y-5">
            {/* Header Result Block */}
            <div className="flex flex-col gap-4 pb-4 border-b border-[#E4E0D8] dark:border-slate-800 min-w-0 w-full">
              <div className="min-w-0 w-full">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-block max-w-full text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#C2410C]/10 text-[#C2410C] dark:text-[#FB923C] border border-[#C2410C]/20 break-words">
                    {quickResult.source || 'محرك سينوتوك الذكي'}
                  </span>
                  {matchedDictChar && (
                    <>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 border border-emerald-600/20 tabular-nums">
                        HSK {matchedDictChar.hsk}
                      </span>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-navy-800 text-slate-700 dark:text-slate-200 tabular-nums">
                        {matchedDictChar.strokes} ضربة
                      </span>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 tabular-nums">
                        النغمة {matchedDictChar.tone}
                      </span>
                      {matchedDictChar.category && (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300">
                          {matchedDictChar.category}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Main Chinese Output */}
                <div className="text-2xl sm:text-3xl font-extrabold text-navy-900 dark:text-white font-chinese mt-2.5 tracking-wide leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
                  {quickResult.simplified}
                </div>

                {/* Arabic Translation Output + Male Egyptian Arabic Voice Button */}
                {quickResult.translated_arabic && (
                  <div className="flex flex-col items-start gap-2 mt-2 min-w-0 w-full">
                    <div className="text-base sm:text-lg font-bold text-emerald-800 dark:text-emerald-400 font-arabic leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] w-full max-w-full">
                      {quickResult.translated_arabic}
                    </div>
                    <button
                      type="button"
                      onClick={() => nativeSpeak({ text: quickResult.translated_arabic || '', lang: 'ar-EG', rate: speechRate })}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-700 text-emerald-800 dark:text-emerald-300 hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                    >
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                      <span>اسمع بالعربي (صوت رجل)</span>
                    </button>
                  </div>
                )}

                {/* Pinyin & Arabic Phonetic */}
                <div className="flex flex-wrap items-center gap-2 mt-2.5 min-w-0 w-full">
                  <span className="text-sm sm:text-base font-bold text-[#C2410C] dark:text-[#FB923C] font-mono whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
                    {quickResult.pinyin}
                  </span>
                  {quickResult.phonetic_ar && (
                    <span className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-navy-800 border border-[#E4E0D8] dark:border-slate-700 px-2.5 py-0.5 rounded-lg break-words [overflow-wrap:anywhere] max-w-full">
                      نطق تقريبي: {quickResult.phonetic_ar}
                    </span>
                  )}
                </div>

                {/* Simplified & Traditional Reference */}
                <div className="flex flex-wrap items-start gap-2 text-xs text-slate-600 dark:text-slate-400 mt-2 min-w-0 w-full">
                  <span className="break-words [overflow-wrap:anywhere] max-w-full">
                    المبسط: <strong className="font-chinese text-slate-800 dark:text-slate-200">{quickResult.simplified}</strong>
                  </span>
                  <span aria-hidden="true">•</span>
                  <span className="break-words [overflow-wrap:anywhere] max-w-full">
                    التقليدي: <strong className="font-chinese text-slate-800 dark:text-slate-200">{quickResult.traditional}</strong>
                  </span>
                </div>
              </div>

              {/* Audio Speed, Male Play/Stop, Copy, Stroke & Open Full Translator Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-white dark:bg-navy-800 border border-[#E4E0D8] dark:border-slate-700 rounded-xl p-0.5 text-xs text-slate-700 dark:text-slate-200 tabular-nums">
                  {[0.7, 1.0, 1.3].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setSpeechRate(spd)}
                      className={`min-h-[38px] px-2.5 py-1 rounded-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${
                        speechRate === spd ? 'bg-[#C2410C] text-white' : 'hover:bg-slate-100 dark:hover:bg-navy-700'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                {isSpeaking ? (
                  <button
                    type="button"
                    onClick={() => nativeStopSpeak()}
                    className="min-h-[44px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                  >
                    <Square className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>إيقاف الصوت</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => nativeSpeak({ text: quickResult.simplified, lang: 'zh-CN', rate: speechRate })}
                    className="min-h-[44px] flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                  >
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                    <span>اسمع بالصيني (صوت رجل)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleCopy(quickResult.simplified)}
                  aria-label="نسخ النص الصيني"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 hover:text-[#C2410C] border border-[#E4E0D8] dark:border-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                </button>

                {matchedDictChar && (
                  <button
                    type="button"
                    onClick={() =>
                      setStrokeChar({
                        word: matchedDictChar.simplified,
                        pinyin: matchedDictChar.pinyin,
                        meaning_ar: matchedDictChar.meaning_ar
                      })
                    }
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-navy-800 text-slate-800 dark:text-slate-100 hover:border-[#C2410C] border border-[#E4E0D8] dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                  >
                    <PenTool className="w-4 h-4 text-[#C2410C] dark:text-[#FB923C]" aria-hidden="true" />
                    <span>ارسم الرمز خطوة بخطوة</span>
                  </button>
                )}

                {matchedDictChar && onOpenWriting && (
                  <button
                    type="button"
                    onClick={() => onOpenWriting(matchedDictChar.simplified)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-navy-900 dark:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-navy-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                  >
                    <span>أكاديمية الكتابة</span>
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* ALL Meanings Card (Every single sense of the character / word — ZERO truncation!) */}
            {quickResult.all_meanings && quickResult.all_meanings.length > 0 && (
              <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 space-y-2.5 min-w-0 w-full">
                <div className="text-xs font-bold text-[#C2410C] dark:text-[#FB923C]">
                  جميع معاني الرمز / الكلمة الكاملة (كل الاستخدامات):
                </div>
                <div className="space-y-2.5">
                  {quickResult.all_meanings.map((group, gIdx) => (
                    <div key={gIdx} className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        {group.pos}:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {group.terms.map((term, tIdx) => (
                          <span
                            key={tIdx}
                            className="text-xs px-2.5 py-1 rounded-xl bg-[#F7F6F2] dark:bg-navy-900 text-navy-900 dark:text-slate-100 border border-[#E4E0D8] dark:border-slate-700 font-medium break-words"
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

            {/* Common Compound Words for Single Hanzi */}
            {matchedDictChar?.compounds && matchedDictChar.compounds.length > 0 && (
              <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-navy-900 dark:text-white">
                  كلمات مركّبة شائعة تحتوي على الرمز «{matchedDictChar.simplified}»:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {matchedDictChar.compounds.slice(0, 6).map((cmp, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#FAF9F5] dark:bg-navy-900 border border-[#E4E0D8] dark:border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-base font-bold font-chinese text-navy-900 dark:text-white">{cmp.zh}</div>
                        <div className="text-[11px] font-mono font-bold text-[#C2410C] dark:text-[#FB923C]">{cmp.pinyin}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300 break-words">{cmp.ar}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => nativeSpeak({ text: cmp.zh, lang: 'zh-CN', rate: speechRate })}
                        aria-label={`نطق ${cmp.zh}`}
                        className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-[#C2410C] border border-[#E4E0D8] dark:border-slate-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                      >
                        <Volume2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Context Note */}
            {quickResult.context_note && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-950 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-bold mb-1">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span>فهم السياق واللهجة:</span>
                </div>
                <p className="leading-relaxed">{quickResult.context_note}</p>
              </div>
            )}

            {/* Interactive Detail Tabs (Breakdown / Grammar / Examples / Alternatives) */}
            <div>
              <div className="flex flex-wrap items-center gap-2 border-b border-[#E4E0D8] dark:border-slate-800 pb-2 text-xs font-bold" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'breakdown'}
                  onClick={() => setActiveTab('breakdown')}
                  className={`min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${
                    activeTab === 'breakdown'
                      ? 'bg-[#C2410C] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-navy-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="tabular-nums">تفكيك الرموز ({quickResult.breakdown.length})</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'grammar'}
                  onClick={() => setActiveTab('grammar')}
                  className={`min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${
                    activeTab === 'grammar'
                      ? 'bg-[#C2410C] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-navy-800'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>القواعد والبنية</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'examples'}
                  onClick={() => setActiveTab('examples')}
                  className={`min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${
                    activeTab === 'examples'
                      ? 'bg-[#C2410C] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-navy-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="tabular-nums">أمثلة وجمل ({combinedExamples.length})</span>
                </button>
                {quickResult.alternatives && quickResult.alternatives.length > 0 && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'alternatives'}
                    onClick={() => setActiveTab('alternatives')}
                    className={`min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${
                      activeTab === 'alternatives'
                        ? 'bg-[#C2410C] text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-navy-800'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>تعبيرات بديلة</span>
                  </button>
                )}
              </div>

              {activeTab === 'breakdown' && (
                <div className="pt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {quickResult.breakdown.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 flex flex-col items-center text-center"
                    >
                      <span className="text-2xl font-bold text-navy-900 dark:text-white font-chinese">{item.word}</span>
                      <span className="text-xs font-semibold text-[#C2410C] dark:text-[#FB923C] font-mono mt-0.5">{item.pinyin}</span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-tight">{item.meaning_ar}</span>
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          type="button"
                          onClick={() => nativeSpeak({ text: item.word, lang: 'zh-CN', rate: speechRate })}
                          aria-label={`نطق الرمز ${item.word}`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#C2410C] hover:bg-[#F7F6F2] dark:hover:bg-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                        >
                          <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setStrokeChar(item)}
                          className="min-h-[36px] px-2 flex items-center gap-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#C2410C] hover:bg-[#F7F6F2] dark:hover:bg-navy-800 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                        >
                          <PenTool className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>ارسمه</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'grammar' && (
                <div className="pt-4 p-4 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {quickResult.grammar_note || 'تعتمد الترجمة على القواعد الأساسية للغة الصينية ومطابقتها مع المعنى العربي.'}
                </div>
              )}

              {activeTab === 'examples' && (
                <div className="pt-4 space-y-2.5">
                  {combinedExamples.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">لا توجد أمثلة إضافية لهذا النص.</p>
                  ) : (
                    combinedExamples.map((ex, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-base font-bold text-navy-900 dark:text-white font-chinese break-words">{ex.zh}</div>
                          <div className="text-xs font-semibold text-[#C2410C] dark:text-[#FB923C] font-mono mt-0.5 break-words">{ex.pinyin}</div>
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 break-words">{ex.ar}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => nativeSpeak({ text: ex.zh, lang: 'zh-CN', rate: speechRate })}
                          aria-label={`نطق المثال ${ex.zh}`}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#FAF9F5] dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-[#C2410C] border border-[#E4E0D8] dark:border-slate-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                        >
                          <Volume2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'alternatives' && (
                <div className="pt-4 flex flex-wrap gap-2">
                  {quickResult.alternatives.map((alt, idx) => (
                    <span
                      key={idx}
                      className="text-xs px-3 py-1.5 rounded-xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium"
                    >
                      {alt}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => onQuickTranslate(quickResult.original)}
                className="min-h-[40px] px-3 text-xs text-[#C2410C] dark:text-[#FB923C] font-bold hover:underline flex items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
              >
                <span>فتح في المترجم الكامل مع بطاقة PNG وملء الشاشة</span>
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Feature Cards Grid (Semantic Accessible <button> Cards) */}
      <section aria-labelledby="services-grid-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="services-grid-heading" className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white font-arabic">
            خدمات منصة سينوتوك
          </h2>
          <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            15 قسماً احترافياً متكاملاً
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {featureCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectTab(card.tab)}
                className="group relative flex flex-col justify-between text-start p-6 rounded-3xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 shadow-sm hover:shadow-xl hover:shadow-orange-500/5 hover:border-[#C2410C]/50 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
              >
                <div className="w-full">
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-2xl ${card.color} flex items-center justify-center border border-slate-200/20`}
                    >
                      <Icon className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#F7F6F2] dark:bg-navy-800 text-slate-700 dark:text-slate-300 border border-[#E4E0D8] dark:border-slate-700 tabular-nums">
                      {card.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-navy-900 dark:text-white mb-1 group-hover:text-[#C2410C] dark:group-hover:text-[#FB923C] transition-colors">
                    {card.title}
                  </h3>
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-mono mb-2">
                    {card.subtitle}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                    {card.desc}
                  </p>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-[#C2410C] dark:text-[#FB923C]">
                  <span>فتح القسم</span>
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Stroke-Order Modal for Quick Search Characters */}
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
                <p className="text-xs text-slate-600 dark:text-slate-400">{strokeChar.meaning_ar}</p>
              </div>
              <button
                type="button"
                onClick={() => setStrokeChar(null)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                aria-label="إغلاق نافذة رسم الرمز"
              >
                <X className="w-5 h-5" aria-hidden="true" />
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
    </div>
  );
};
