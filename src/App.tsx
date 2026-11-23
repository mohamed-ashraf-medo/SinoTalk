// src/App.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { X, LayoutGrid } from 'lucide-react';
import { TabType, AppSettings, DictionaryCharacter } from './types';
import { loadDictionary, reloadDictionary } from './services/dictionaryService';
import { loadSavedPreferences, savePreferences } from './services/preferencesService';

// Layout & Shared UI
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { MoreDrawer } from './components/layout/MoreDrawer';
import { CommandPalette } from './components/ui/CommandPalette';
import { AppBootLoader, TopLoadingBar } from './components/ui/LoadingState';

// V3 Clean Feature Modules
import { Dashboard } from './features/dashboard/Dashboard';
import { SmartTranslator } from './features/translator/SmartTranslator';
import { ChineseDictionary } from './features/dictionary/ChineseDictionary';
import { StoryLibrary } from './features/books/StoryLibrary';
import { HandwritingLookup } from './features/writing/HandwritingLookup';
import { WritingAcademy } from './features/writing/WritingAcademy';
import { TonesLab } from './features/learning/TonesLab';
import { RadicalsGuide } from './features/learning/RadicalsGuide';
import { HskFlashcards } from './features/learning/HskFlashcards';
import { HskPlacementQuiz } from './features/learning/HskPlacementQuiz';
import { TradePhrasebook } from './features/phrasebook/TradePhrasebook';
import { VoiceTranslation } from './features/voice/VoiceTranslation';
import { LiveConversation } from './features/voice/LiveConversation';
import { CameraTranslation } from './features/media/CameraTranslation';
import { DocumentTranslation } from './features/media/DocumentTranslation';
import { UserGuide } from './features/guide/UserGuide';
import { SettingsView } from './features/settings/SettingsView';

const PRIMARY_TABS: TabType[] = ['dashboard', 'translator', 'dictionary', 'conversation'];

const SECONDARY_TAB_TITLES: Partial<Record<TabType, string>> = {
  books: 'مكتبة القصص الصينية (6 كتب)',
  handwriting: 'ارسم أي رمز لتعرف معناه',
  writing: 'أكاديمية الكتابة والرسم الصيني',
  tones: 'مختبر النغمات الصينية (5 نغمات)',
  radicals: 'دليل الجذور الصينية (50 جذراً)',
  quiz: 'اختبار تحديد المستوى (HSK)',
  phrasebook: 'دليل التجارة والسفر ومحول الأسعار',
  flashcards: 'بطاقات مراجعة HSK الذكية',
  voice: 'الترجمة الصوتية والنطق HD',
  camera: 'ترجمة الكاميرا والصور (OCR)',
  documents: 'ترجمة ملفات PDF و Word',
  guide: 'كتالوج شرح كل قسم',
  settings: 'الإعدادات والوضع الليلي الدائم'
};

export function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const previousPrimaryRef = useRef<TabType>('dashboard');
  const [characters, setCharacters] = useState<DictionaryCharacter[]>([]);
  const [loadingDict, setLoadingDict] = useState(true);
  const [initialBooting, setInitialBooting] = useState(true);
  const [translatorInitialText, setTranslatorInitialText] = useState('');
  const [writingInitialChar, setWritingInitialChar] = useState('爱');
  const [commandOpen, setCommandOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const navigateToTab = useCallback((nextTab: TabType) => {
    setCurrentTab((prev) => {
      if (PRIMARY_TABS.includes(prev)) {
        previousPrimaryRef.current = prev;
      }
      if (nextTab !== prev && typeof window !== 'undefined' && window.history?.pushState) {
        try {
          window.history.pushState({ sinoTab: nextTab }, '');
        } catch {
          // ignore file:// history restrictions
        }
      }
      return nextTab;
    });
  }, []);

  const handleCloseSecondaryView = useCallback(() => {
    const target = previousPrimaryRef.current || 'dashboard';
    setCurrentTab(target);
  }, []);

  // Handle Android Hardware/Gesture Back Button gracefully (never exit app unexpectedly from a secondary view)
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      if (commandOpen) {
        setCommandOpen(false);
        return;
      }
      if (moreOpen) {
        setMoreOpen(false);
        return;
      }
      const stateTab = (e.state as { sinoTab?: TabType } | null)?.sinoTab;
      if (stateTab) {
        setCurrentTab(stateTab);
      } else {
        setCurrentTab((prev) => (prev !== 'dashboard' ? previousPrimaryRef.current || 'dashboard' : 'dashboard'));
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [commandOpen, moreOpen]);

  const [settings, setSettings] = useState<AppSettings>(() => loadSavedPreferences());

  useEffect(() => {
    savePreferences(settings);
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (window.sinoElectron?.onQuickTranslate) {
      return window.sinoElectron.onQuickTranslate((clipboardText: string) => {
        if (clipboardText && clipboardText.trim()) {
          setTranslatorInitialText(clipboardText.trim());
          setCurrentTab('translator');
          toast.info('تم استلام النص المنسوخ للترجمة الفورية');
        } else {
          setCurrentTab('translator');
        }
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    const minSplashTimer = setTimeout(() => {
      if (active) setInitialBooting(false);
    }, 450);

    loadDictionary()
      .then((data) => {
        if (!active) return;
        setCharacters(data);
        setLoadingDict(false);
        setInitialBooting(false);
      })
      .catch((err) => {
        console.error('Failed to load dictionary dataset:', err);
        if (!active) return;
        toast.error('تعذر تحميل ملف القاموس المحلي');
        setLoadingDict(false);
        setInitialBooting(false);
      });

    return () => {
      active = false;
      clearTimeout(minSplashTimer);
    };
  }, []);

  const handleReloadDictionary = async () => {
    setLoadingDict(true);
    try {
      const fresh = await reloadDictionary();
      setCharacters(fresh);
      toast.success(`تم تحديث القاموس بنجاح (${fresh.length.toLocaleString('en-US')} رمز صيني معتمد)`);
    } catch {
      toast.error('تعذر تحديث الذاكرة المحلية للقاموس');
    } finally {
      setLoadingDict(false);
    }
  };

  const handleToggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark'
    }));
  };

  const handleUpdateSettings = (updated: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updated }));
  };

  const handleQuickTranslate = (text: string) => {
    setTranslatorInitialText(text);
    navigateToTab('translator');
  };

  const handleOpenWriting = (char: string) => {
    setWritingInitialChar(char);
    navigateToTab('writing');
  };

  const isSecondaryView = !PRIMARY_TABS.includes(currentTab);

  return (
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#F7F6F2] dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex flex-col font-arabic transition-colors duration-200">
      <Toaster position="top-center" dir="rtl" richColors />
      <TopLoadingBar visible={loadingDict} />
      {initialBooting && loadingDict && <AppBootLoader />}

      <Navbar
        currentTab={currentTab}
        onSelectTab={navigateToTab}
        isDark={settings.theme === 'dark'}
        onToggleTheme={handleToggleTheme}
        totalChars={characters.length}
        onOpenCommandPalette={() => setCommandOpen(true)}
      />

      <div className="flex-1 flex max-w-7xl w-full mx-auto pb-24 lg:pb-8">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={navigateToTab}
          totalChars={characters.length}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
          {/* Sticky Close (X) Header Bar for any section opened from "المزيد" */}
          {isSecondaryView && (
            <div className="mb-4 px-4 py-2.5 rounded-2xl bg-white dark:bg-[#111827] border border-[#E4E0D8] dark:border-slate-800 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className="lg:hidden min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#F7F6F2] dark:bg-[#1A2333] text-slate-600 dark:text-slate-300 hover:text-[#C2410C] text-xs font-bold flex items-center gap-1.5 shrink-0"
                  aria-label="العودة لقائمة المزيد"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>المزيد</span>
                </button>
                <span className="text-xs sm:text-sm font-bold text-navy-900 dark:text-white truncate">
                  {SECONDARY_TAB_TITLES[currentTab] || 'أداة SinoTalk'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCloseSecondaryView}
                className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-rose-500/10 hover:bg-rose-600 text-rose-600 dark:text-rose-400 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0"
                aria-label="إغلاق القسم والعودة"
                title="إغلاق القسم والعودة"
              >
                <X className="w-5 h-5" />
                <span className="hidden sm:inline">إغلاق</span>
              </button>
            </div>
          )}

          {currentTab === 'dashboard' && (
            <Dashboard
              onSelectTab={navigateToTab}
              totalChars={characters.length}
              characters={characters}
              onQuickTranslate={handleQuickTranslate}
              onOpenWriting={handleOpenWriting}
            />
          )}

          {currentTab === 'translator' && (
            <SmartTranslator
              initialText={translatorInitialText}
              defaultScript={settings.defaultScript}
              characters={characters}
              onClearInitialText={() => setTranslatorInitialText('')}
            />
          )}

          {currentTab === 'dictionary' && (
            <ChineseDictionary
              characters={characters}
              loading={loadingDict}
              onOpenTranslatorWithText={handleQuickTranslate}
            />
          )}

          {currentTab === 'books' && (
            <StoryLibrary characters={characters} onOpenWriting={handleOpenWriting} />
          )}

          {currentTab === 'handwriting' && (
            <HandwritingLookup
              characters={characters}
              onOpenTranslatorWithText={handleQuickTranslate}
              onOpenWriting={handleOpenWriting}
            />
          )}

          {currentTab === 'writing' && <WritingAcademy initialChar={writingInitialChar} />}

          {currentTab === 'tones' && <TonesLab />}

          {currentTab === 'radicals' && <RadicalsGuide onOpenWriting={handleOpenWriting} />}

          {currentTab === 'quiz' && <HskPlacementQuiz characters={characters} />}

          {currentTab === 'phrasebook' && <TradePhrasebook />}

          {currentTab === 'flashcards' && <HskFlashcards characters={characters} />}

          {currentTab === 'voice' && <VoiceTranslation />}

          {currentTab === 'conversation' && <LiveConversation />}

          {currentTab === 'camera' && <CameraTranslation />}

          {currentTab === 'documents' && <DocumentTranslation />}

          {currentTab === 'guide' && <UserGuide onSelectTab={navigateToTab} />}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              totalChars={characters.length}
              onReloadDictionary={handleReloadDictionary}
            />
          )}
        </main>
      </div>

      <BottomNav
        currentTab={currentTab}
        onSelectTab={navigateToTab}
        onOpenMore={() => setMoreOpen(true)}
      />

      <MoreDrawer
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        currentTab={currentTab}
        onSelectTab={navigateToTab}
      />

      <CommandPalette
        isOpen={commandOpen}
        onClose={() => setCommandOpen(false)}
        characters={characters}
        onSelectTab={navigateToTab}
        onQuickTranslate={handleQuickTranslate}
      />
    </div>
  );
}

export default App;