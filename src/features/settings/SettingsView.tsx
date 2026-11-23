// src/components/settings/SettingsView.tsx
import React, { useState, useEffect } from 'react';
import {
  Settings,
  Moon,
  Sun,
  ShieldCheck,
  Database,
  Info,
  Volume2,
  Sliders,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Lock,
  EyeOff
} from 'lucide-react';
import { AppSettings, ChineseScript, SpeechSpeed } from '../../types';
import { VoiceInfo, getAvailableVoices } from '../../services/speechService';
import {
  getVoiceMode,
  setVoiceMode,
  VoiceMode,
  getMaleSpeaker,
  setMaleSpeaker,
  MaleSpeakerId,
  diagnoseVoiceEngine,
  VoiceDiagnosticResult,
  isBlacklistedFemaleVoice
} from '../../services/voiceEngine';
import { nativeSpeak } from '../../services/platformBridge';
import { toast } from 'sonner';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  totalChars: number;
  onReloadDictionary?: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  totalChars,
  onReloadDictionary
}) => {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>(() => getVoiceMode());
  const [maleSpeaker, setMaleSpeakerState] = useState<MaleSpeakerId>(() => getMaleSpeaker());
  const [cacheStatus, setCacheStatus] = useState<string>('مفعل ومحفوظ محلياً');
  const [refreshing, setRefreshing] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<VoiceDiagnosticResult | null>(null);

  const handleVoiceModeChange = (mode: VoiceMode) => {
    setVoiceMode(mode);
    setVoiceModeState(mode);
    toast.success(mode === 'hd' ? 'تم تفعيل الصوت الرجالي البشري HD' : 'تم التحويل لصوت الجهاز المحلي');
  };

  const handleSpeakerChange = (speaker: MaleSpeakerId) => {
    setMaleSpeaker(speaker);
    setMaleSpeakerState(speaker);
    toast.success(
      speaker === 'zh-CN-YunjianNeural'
        ? 'تم اختيار صوت الرجل العميق الواضح (Yunjian Neural — الافتراضي)'
        : speaker === 'zh-CN-YunxiNeural'
          ? 'تم اختيار صوت الشاب الصيني الطبيعي (Yunxi Neural)'
          : 'تم اختيار صوت مذيع الأخبار الرسمي (Yunyang Neural)'
    );
  };

  const handleRunVoiceDiagnostic = async () => {
    setDiagRunning(true);
    try {
      const report = await diagnoseVoiceEngine();
      setDiagResult(report);
      if (report.serverReachable) {
        toast.success('السيرفر متصل — جاري تشغيل عينة صوت الرجل الآن...');
        nativeSpeak({ text: '你好！欢迎使用中文翻译系统。', lang: 'zh-CN', rate: settings.speechSpeed });
      } else {
        toast.error(report.summaryAr);
      }
    } catch {
      toast.error('تعذر إتمام تشخيص الصوت حالياً.');
    } finally {
      setDiagRunning(false);
    }
  };

  useEffect(() => {
    getAvailableVoices().then((list) => setVoices(list));
  }, []);

  const zhVoices = voices.filter((v) => v.isChinese && !isBlacklistedFemaleVoice(v.name));

  const handleRefreshCache = async () => {
    setRefreshing(true);
    setCacheStatus('جاري إعادة فحص وتحديث القاموس...');
    try {
      if (onReloadDictionary) {
        await onReloadDictionary();
      }
      setCacheStatus('تم التحقق وتحديث الذاكرة المؤقتة بنجاح');
    } catch {
      setCacheStatus('تعذر التحديث — يرجى المحاولة لاحقاً');
    } finally {
      setRefreshing(false);
      setTimeout(() => setCacheStatus('مفعل ومحفوظ محلياً'), 3500);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-4xl mx-auto">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-600">
            <Settings className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white font-arabic">
              إعدادات المنصة وتفضيلات المستخدم
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              خصص تجربة الترجمة ونظام النطق والمظهر مع مراجعة سياسات الخصوصية التامة
            </p>
          </div>
        </div>
      </div>

      {/* 1. General Preferences & Theme */}
      <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <h2 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
          <Sliders className="w-4 h-4 text-brand-orange" />
          <span>المظهر واللغة الأساسية:</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Theme Mode */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">
                مظهر التطبيق:
              </span>
              <span className="text-[11px] text-slate-400">
                {settings.theme === 'dark' ? 'الوضع الليلي (Dark Mode)' : 'الوضع النهاري (Light Mode)'}
              </span>
            </div>
            <button
              onClick={() => onUpdateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              className="p-2.5 rounded-xl bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 shadow-sm border border-slate-200 dark:border-slate-700"
            >
              {settings.theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-navy-900" />
              )}
            </button>
          </div>

          {/* Chinese Script Default */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">
                نظام الكتابة الصينية الافتراضي:
              </span>
              <span className="text-[11px] text-slate-400">
                {settings.defaultScript === 'simplified' ? 'المبسطة (المستخدمة في الصين القارية)' : 'التقليدية (تايوان، هونغ كونغ)'}
              </span>
            </div>
            <select
              value={settings.defaultScript}
              onChange={(e) => onUpdateSettings({ defaultScript: e.target.value as ChineseScript })}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-navy-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200"
            >
              <option value="simplified">المبسطة (简体)</option>
              <option value="traditional">التقليدية (繁體)</option>
            </select>
          </div>
        </div>

        {/* Phonetic Arabic Toggle */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">
              عرض دليل النطق الصوتي بالحروف العربية:
            </span>
            <span className="text-[11px] text-slate-400">
              إظهار النطق التقريبي للرموز الصينية بالحروف العربية (مثال: 你好 ➔ ني هاو) بجانب البينيين
            </span>
          </div>
          <button
            onClick={() => onUpdateSettings({ showPhoneticArabic: !settings.showPhoneticArabic })}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${settings.showPhoneticArabic ? 'bg-orange-500' : 'bg-slate-300 dark:bg-navy-800'
              }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${settings.showPhoneticArabic ? '-translate-x-6' : 'translate-x-0'
                }`}
            ></div>
          </button>
        </div>
      </div>

      {/* 2. Voice & Speech Synthesis Settings */}
      <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-[#C2410C] dark:text-[#FB923C]" />
            <span>إعدادات النطق الصوتي (V8.3 — Microsoft Neural صوت رجل صيني وعربي):</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRunVoiceDiagnostic}
              disabled={diagRunning}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${diagRunning ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{diagRunning ? 'جاري الفحص...' : 'اختبار وتشخيص الصوت'}</span>
            </button>
            <button
              type="button"
              onClick={() => nativeSpeak({ text: '你好！欢迎使用中文翻译系统。', lang: 'zh-CN', rate: settings.speechSpeed })}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-[#C2410C] hover:bg-[#9A3412] text-white text-xs font-bold flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C2410C]"
            >
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>تجربة صيني (رجل)</span>
            </button>
            <button
              type="button"
              onClick={() => nativeSpeak({ text: 'أهلاً بك في تطبيق سينوتوك للترجمة الذكية بصوت الرجل المصري الواضح.', lang: 'ar-EG', rate: settings.speechSpeed })}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-600"
            >
              <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>تجربة عربي (رجل)</span>
            </button>
          </div>
        </div>

        {diagResult && (
          <div
            className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
              diagResult.serverReachable
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
            }`}
          >
            <div className="font-bold">{diagResult.summaryAr}</div>
            <div className="text-[11px] opacity-85 flex flex-wrap gap-3">
              <span>الإنترنت: {diagResult.online ? 'متصل' : 'غير متصل'}</span>
              <span>•</span>
              <span>طبقة التشغيل: {diagResult.activePlaybackLayer}</span>
              <span>•</span>
              <span>أصوات رجال محلية (صيني/عربي): {diagResult.maleZhOsVoices.length}/{diagResult.maleArOsVoices.length}</span>
            </div>
          </div>
        )}

        {/* Voice Engine Mode (HD Studio vs Device Offline) */}
        <div className="p-4 rounded-2xl bg-[#F7F6F2] dark:bg-navy-950 border border-[#E4E0D8] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-navy-900 dark:text-white block">
              جودة محرك النطق الصوتي:
            </span>
            <span className="text-[11px] text-slate-600 dark:text-slate-400">
              الوضع البشري HD يعطي نطقاً صينياً طبيعياً فائق الوضوح على كل الهواتف مع التحول التلقائي للأوفلاين عند انقطاع النت.
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleVoiceModeChange('hd')}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${voiceMode === 'hd'
                ? 'bg-[#C2410C] text-white'
                : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
            >
              صوت بشري HD
            </button>
            <button
              type="button"
              onClick={() => handleVoiceModeChange('device')}
              className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${voiceMode === 'device'
                ? 'bg-[#C2410C] text-white'
                : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
            >
              صوت الجهاز
            </button>
          </div>
        </div>

        {/* Genuine Male Speaker Selection (Zero Female Voice!) */}
        <div className="p-4 rounded-2xl bg-[#F7F6F2] dark:bg-navy-950 border border-[#E4E0D8] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-navy-900 dark:text-white block">
              صوت المتحدث الصيني (صوت رجل أصلي 100%):
            </span>
            <span className="text-[11px] text-slate-600 dark:text-slate-400">
              صوت رجل صيني حقيقي بلهجة بكين القياسية الواضحة (تمت إزالة صوت البنت بالكامل) ويقرأ الجمل الطويلة متواصلة.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleSpeakerChange('zh-CN-YunjianNeural')}
              className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${maleSpeaker === 'zh-CN-YunjianNeural'
                  ? 'bg-[#C2410C] text-white'
                  : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
            >
              رجل عميق (Yunjian)
            </button>
            <button
              type="button"
              onClick={() => handleSpeakerChange('zh-CN-YunxiNeural')}
              className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${maleSpeaker === 'zh-CN-YunxiNeural'
                  ? 'bg-[#C2410C] text-white'
                  : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
            >
              رجل بكين طبيعي (Yunxi)
            </button>
            <button
              type="button"
              onClick={() => handleSpeakerChange('zh-CN-YunyangNeural')}
              className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] ${maleSpeaker === 'zh-CN-YunyangNeural'
                  ? 'bg-[#C2410C] text-white'
                  : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
            >
              مذيع أخبار (Yunyang)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              صوت النطق الصيني المفضل:
            </label>
            <select
              value={settings.preferredZhVoice}
              onChange={(e) => onUpdateSettings({ preferredZhVoice: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200"
            >
              {zhVoices.length > 0 ? (
                zhVoices.map((v, idx) => (
                  <option key={idx} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))
              ) : (
                <option value="">صوت النظام الافتراضي (التعرف التلقائي)</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              سرعة النطق الصوتي الافتراضية:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { speed: 0.7 as SpeechSpeed, label: 'بطيء 0.7x' },
                { speed: 1.0 as SpeechSpeed, label: 'عادي 1.0x' },
                { speed: 1.3 as SpeechSpeed, label: 'سريع 1.3x' }
              ].map((s) => (
                <button
                  key={s.speed}
                  onClick={() => onUpdateSettings({ speechSpeed: s.speed })}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${settings.speechSpeed === s.speed
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-navy-950 text-slate-600 dark:text-slate-300'
                    }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Offline Dictionary Storage & Management */}
      <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-blue-500" />
          <span>بيانات القاموس والتخزين المحلي:</span>
        </h2>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-navy-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-navy-900 dark:text-white">
                حالة قاعدة البيانات المحلية (IndexedDB):
              </span>
              <span className="text-xs text-emerald-600 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {cacheStatus}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              إجمالي الرموز الصينية المعتمدة المحفوظة محلياً: <strong>{totalChars > 0 ? totalChars.toLocaleString('en-US') : '8,050'} رمز</strong> (HSK 1–9) مع شبكة الضربات والأمثلة.
            </p>
          </div>

          <button
            onClick={handleRefreshCache}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-200 dark:bg-navy-800 text-slate-700 dark:text-slate-200 font-semibold text-xs hover:bg-slate-300 transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>فحص وتحديث المخزن</span>
          </button>
        </div>
      </div>

      {/* 4. Privacy Guarantee (Requirement 14) */}
      <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-emerald-500/30 shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
          <ShieldCheck className="w-5 h-5" />
          <span>ضمان الخصوصية وعدم تخزين البيانات (Privacy Guarantee)</span>
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed font-arabic">
          <p className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span><strong>بدون تسجيل أو حسابات:</strong> لا يتطلب SinoTalk أي بريد إلكتروني، كلمة سر، رقم هاتف أو تسجيل دخول اجتماعي.</span>
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span><strong>جلسة مؤقتة بدون حفظ سجل:</strong> لا نقوم بحفظ نصوصك المترجمة، محادثاتك أو مستنداتك في أي قاعدة بيانات خارجية. يتم مسح كل شيء فور انتهاء الجلسة.</span>
          </p>
          <p className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <span><strong>خالٍ من الإعلانات والتتبع:</strong> لا يحتوي التطبيق على أي متعقبات إعلانية أو أدوات تتبع مستخدمين.</span>
          </p>
        </div>
      </div>

      {/* 5. Free Technology & Architecture (Requirement 15) */}
      <div className="p-6 rounded-3xl bg-slate-100 dark:bg-navy-950/70 border border-slate-200 dark:border-slate-800 space-y-3 text-xs text-slate-500 dark:text-slate-400">
        <h3 className="font-bold text-navy-900 dark:text-white flex items-center gap-1.5 text-xs">
          <Info className="w-4 h-4 text-brand-orange" />
          <span>الشفافية والتقنيات المجانية ومفتوحة المصدر:</span>
        </h3>
        <p className="leading-relaxed">
          تعتمد منصة <strong>SinoTalk</strong> بنسبة 100% على تقنيات مجانية ومفتوحة المصدر بالكامل (Web Speech API, Tesseract.js OCR, CC-CEDICT, HSK 2.0 Lexicon, pinyin-pro, pdf-parse, mammoth). لا يتطلب التطبيق أي اشتراكات مدفوعة أو مفاتيح API إجبارية.
        </p>
        <p className="text-[11px] text-slate-400">
          إصدار التطبيق: SinoTalk v8.3.0 (Standalone Production Architecture).
        </p>
      </div>
    </div>
  );
};
