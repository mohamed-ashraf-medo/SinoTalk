// src/components/ui/LoadingState.tsx
// Unified, WCAG-AA compliant Loading Indicators, Top Progress Bar & Skeletons for SinoTalk V3

import React from 'react';
import { Loader2 } from 'lucide-react';

export const TopLoadingBar: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <div
      className="fixed top-0 inset-x-0 z-50 h-1 bg-orange-500/15 overflow-hidden pointer-events-none"
      role="progressbar"
      aria-label="جاري التحميل"
      aria-busy="true"
    >
      <div className="h-full w-1/3 bg-gradient-to-l from-[#C2410C] via-[#EA580C] to-[#FB923C] animate-[pulse_1s_ease-in-out_infinite] rounded-full" />
    </div>
  );
};

export const AppBootLoader: React.FC<{ message?: string }> = ({
  message = 'جاري تحميل القاموس الصيني (4,050 رمز)...'
}) => (
  <div
    className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#090D16]/95 backdrop-blur-md text-white p-6 text-center animate-fadeIn"
    role="status"
    aria-live="polite"
  >
    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-navy-900 border-2 border-[#EA580C]/45 shadow-xl shadow-orange-500/20">
      <img src="./logo.svg" alt="SinoTalk" className="w-full h-full object-cover" />
    </div>
    <div className="space-y-1.5">
      <div className="flex items-center justify-center gap-2">
        <span className="text-2xl font-black tracking-tight">
          Sino<span className="text-[#FB923C]">Talk</span>
        </span>
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-orange-500/20 text-[#FB923C] border border-orange-500/30">
          V3
        </span>
      </div>
      <p className="text-xs sm:text-sm text-slate-300 font-arabic">{message}</p>
    </div>
    <div className="flex items-center gap-2 text-xs text-[#FB923C] font-semibold">
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      <span>لحظة واحدة...</span>
    </div>
  </div>
);

export const SectionLoader: React.FC<{ label?: string; cards?: number }> = ({
  label = 'جاري تجهيز البيانات...',
  cards = 4
}) => (
  <div className="space-y-5 animate-fadeIn" role="status" aria-live="polite">
    <div className="p-6 rounded-3xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 flex items-center justify-center gap-3 text-sm font-bold text-[#C2410C] dark:text-[#FB923C]">
      <Loader2 className="w-5 h-5 animate-spin shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="h-28 rounded-3xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 p-5 space-y-3 animate-pulse"
        >
          <div className="h-4 w-1/3 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-2/3 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
          <div className="h-3 w-1/2 rounded-lg bg-slate-100 dark:bg-slate-800/50" />
        </div>
      ))}
    </div>
  </div>
);

export const InlineSpinner: React.FC<{ label?: string; className?: string }> = ({
  label,
  className = ''
}) => (
  <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
    <Loader2 className="w-4 h-4 animate-spin text-[#C2410C] dark:text-[#FB923C]" aria-hidden="true" />
    {label && <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</span>}
  </span>
);