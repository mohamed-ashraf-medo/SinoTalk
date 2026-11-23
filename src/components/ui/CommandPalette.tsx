// src/components/ui/CommandPalette.tsx
// Raycast-inspired Ctrl+K Command Palette for instant character (with ALL meanings & metadata), phrase, and section navigation

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Languages,
  BookOpen,
  Mic,
  MessagesSquare,
  Camera,
  FileText,
  Briefcase,
  GraduationCap,
  Settings,
  Volume2,
  CornerDownLeft,
  BookMarked,
  Pencil,
  PenTool,
  Music2,
  Blocks,
  Award,
  HelpCircle
} from 'lucide-react';
import { DictionaryCharacter, TabType } from '../../types';
import { nativeSpeak } from '../../services/platformBridge';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  characters: DictionaryCharacter[];
  onSelectTab: (tab: TabType) => void;
  onQuickTranslate: (text: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  characters,
  onSelectTab,
  onQuickTranslate
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const actions = useMemo(
    () => [
      { id: 'translator' as TabType, label: 'المترجم الذكي المتقدم', icon: Languages, hint: 'ترجمة سياقية' },
      { id: 'dictionary' as TabType, label: 'القاموس الصيني (8,050 رمز)', icon: BookOpen, hint: 'HSK 1–9' },
      { id: 'books' as TabType, label: 'مكتبة القصص الصينية (6 كتب • 900 صفحة)', icon: BookMarked, hint: 'قراءة + ميكروفون' },
      { id: 'handwriting' as TabType, label: 'ارسم أي رمز لتعرف معناه فوراً', icon: Pencil, hint: 'رسم حر' },
      { id: 'writing' as TabType, label: 'أكاديمية الكتابة ورسم الرموز', icon: PenTool, hint: 'خطوة بخطوة' },
      { id: 'tones' as TabType, label: 'مختبر النغمات الصينية (5 نغمات)', icon: Music2, hint: '5 نغمات' },
      { id: 'radicals' as TabType, label: 'دليل الجذور الصينية (50 جذر)', icon: Blocks, hint: '部首' },
      { id: 'quiz' as TabType, label: 'اختبار تحديد مستوى HSK', icon: Award, hint: '10 أسئلة' },
      { id: 'phrasebook' as TabType, label: 'دليل التجارة والسفر + محول الأسعار', icon: Briefcase, hint: 'أوفلاين' },
      { id: 'flashcards' as TabType, label: 'بطاقات مراجعة HSK التفاعلية', icon: GraduationCap, hint: 'HSK 1–9' },
      { id: 'conversation' as TabType, label: 'المحادثة المباشرة', icon: MessagesSquare, hint: 'ثنائي الاتجاه' },
      { id: 'voice' as TabType, label: 'الترجمة الصوتية والنطق HD', icon: Mic, hint: 'TTS / STT' },
      { id: 'camera' as TabType, label: 'ترجمة الكاميرا والصور', icon: Camera, hint: 'OCR' },
      { id: 'documents' as TabType, label: 'ترجمة مستندات PDF و Word', icon: FileText, hint: 'بدون سيرفر' },
      { id: 'guide' as TabType, label: 'دليل الاستخدام المفصّل', icon: HelpCircle, hint: 'شرح شامل' },
      { id: 'settings' as TabType, label: 'الإعدادات والمظهر', icon: Settings, hint: 'تخصيص' }
    ],
    []
  );

  const matchedActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q));
  }, [query, actions]);

  const matchedChars = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const cleanQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return characters
      .filter((c) => {
        const cleanPy = c.pinyin.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const allM = (c.all_meanings || []).join(' ').toLowerCase();
        return (
          c.simplified.includes(q) ||
          c.traditional.includes(q) ||
          c.meaning_ar.toLowerCase().includes(q) ||
          allM.includes(q) ||
          cleanPy.includes(cleanQ)
        );
      })
      .slice(0, 8);
  }, [query, characters]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-navy-950/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="البحث السريع والأوامر"
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700/80 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-[#C2410C] dark:text-[#FB923C] shrink-0" aria-hidden="true" />
          <label htmlFor="cmd-palette-input" className="sr-only">
            ابحث عن رمز صيني أو كلمة عربية أو بينيين أو قسم
          </label>
          <input
            id="cmd-palette-input"
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                onQuickTranslate(query.trim());
                onClose();
              }
            }}
            placeholder="مثال: 爱 / 打 / ni hao / مرحبا (Enter للترجمة وكل المعاني)"
            className="flex-1 min-h-[40px] bg-transparent text-base text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
            aria-label="إغلاق البحث السريع"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[65vh] overflow-y-auto p-2 space-y-3">
          {query.trim() && (
            <button
              type="button"
              onClick={() => {
                onQuickTranslate(query.trim());
                onClose();
              }}
              className="w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#C2410C]/10 text-[#C2410C] dark:text-[#FB923C] hover:bg-[#C2410C]/20 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Languages className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">ترجمة وعرض كل المعاني لـ «{query.trim()}»</span>
              </span>
              <span className="flex items-center gap-1 text-[10px] opacity-85 shrink-0">
                <span>Enter</span>
                <CornerDownLeft className="w-3 h-3" aria-hidden="true" />
              </span>
            </button>
          )}

          {matchedChars.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                نتائج فورية من القاموس الشامل (8,050 رمز — جميع المعاني)
              </div>
              <div className="space-y-1.5">
                {matchedChars.map((c) => {
                  const fullSenses = Array.from(
                    new Set([c.meaning_ar, ...(c.all_meanings || [])].filter(Boolean))
                  );
                  return (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#FAF9F5] dark:bg-navy-900/70 hover:bg-slate-100 dark:hover:bg-navy-800 border border-[#E4E0D8]/70 dark:border-slate-800 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onQuickTranslate(c.simplified);
                          onClose();
                        }}
                        className="flex-1 flex items-start gap-3 text-start min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] rounded-lg"
                      >
                        <span className="text-2xl font-bold font-chinese text-navy-900 dark:text-white w-9 text-center shrink-0">
                          {c.simplified}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-[#C2410C] dark:text-[#FB923C] font-mono">
                              {c.pinyin}
                            </span>
                            {c.traditional && c.traditional !== c.simplified && (
                              <span className="text-xs font-chinese text-slate-500">({c.traditional})</span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 font-bold tabular-nums">
                              HSK {c.hsk}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-navy-800 text-slate-600 dark:text-slate-300 font-semibold tabular-nums">
                              {c.strokes} ضربة
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {fullSenses.map((sense, sIdx) => (
                              <span
                                key={sIdx}
                                className="text-[11px] px-2 py-0.5 rounded-md bg-white dark:bg-navy-950 text-slate-700 dark:text-slate-200 border border-[#E4E0D8] dark:border-slate-700"
                              >
                                {sense}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => nativeSpeak({ text: c.simplified, lang: 'zh-CN' })}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-[#C2410C] hover:bg-white dark:hover:bg-navy-900 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                        aria-label={`نطق ${c.simplified}`}
                      >
                        <Volume2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="px-3 py-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              الأقسام والأدوات
            </div>
            <div className="space-y-1">
              {matchedActions.map((act) => {
                const Icon = act.icon;
                return (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(act.id);
                      onClose();
                    }}
                    className="w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-800 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C]"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />
                      <span>{act.label}</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-navy-950 text-slate-500 dark:text-slate-400">
                      {act.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Keycaps */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-navy-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>اختصار البحث السريع: Ctrl + K</span>
          <span>Esc للإغلاق</span>
        </div>
      </div>
    </div>
  );
};
