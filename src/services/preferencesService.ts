// src/services/preferencesService.ts
// Persists UI-only preferences (Dark/Light theme, speech speed, script) in localStorage.
// Zero translation history, zero personal data, zero accounts.

import { AppSettings } from '../types';

export const UI_PREFS_STORAGE_KEY = 'sinotalk_ui_prefs_v1';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'light',
  defaultScript: 'simplified',
  speechSpeed: 1.0,
  showPhoneticArabic: true,
  preferredZhVoice: '',
  preferredArVoice: '',
  defaultDirection: 'auto'
};

export function loadSavedPreferences(): AppSettings {
  try {
    const raw = localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      defaultScript: parsed.defaultScript === 'traditional' ? 'traditional' : 'simplified',
      speechSpeed: parsed.speechSpeed === 0.7 || parsed.speechSpeed === 1.3 ? parsed.speechSpeed : 1.0,
      showPhoneticArabic: typeof parsed.showPhoneticArabic === 'boolean' ? parsed.showPhoneticArabic : true
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function savePreferences(settings: AppSettings): void {
  try {
    localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors in restricted WebViews
  }
}