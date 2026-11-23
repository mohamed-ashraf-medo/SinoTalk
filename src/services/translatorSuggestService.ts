// src/services/translatorSuggestService.ts
// Tri-Directional Live Suggestions (Arabic <-> Chinese <-> Pinyin)
// Combines instant 0ms local matches (8,050-char dictionary + Egyptian phrases + Trade phrasebook)
// with live online Pinyin-to-Chinese IME suggestions (Google Input Tools zh-t-i0-pinyin).

import { DictionaryCharacter } from '../types';
import { TRADE_TRAVEL_PHRASES } from '../data/tradeTravelPhrases';
import { normalizeArabic } from './clientLinguistics';

export interface TranslatorSuggestion {
  zh: string;
  pinyin: string;
  ar: string;
  source: 'local' | 'online-pinyin';
}

export function isPinyinInput(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  const hasArabic = /[\u0600-\u06FF]/.test(clean);
  const hasChinese = /[\u4E00-\u9FFF]/.test(clean);
  const hasLatin = /[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(clean);
  return hasLatin && !hasArabic && !hasChinese;
}

function stripToneMarks(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export async function fetchOnlinePinyinCandidates(pinyinQuery: string): Promise<string[]> {
  const cleaned = stripToneMarks(pinyinQuery);
  if (!cleaned || cleaned.length < 2) return [];
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(cleaned)}&itc=zh-t-i0-pinyin&num=8&cp=0&cs=1&ie=utf-8&oe=utf-8`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data) && data[0] === 'SUCCESS' && Array.isArray(data[1]?.[0]?.[1])) {
      return (data[1][0][1] as string[]).filter((s) => /[\u4E00-\u9FFF]/.test(s)).slice(0, 6);
    }
    return [];
  } catch {
    return [];
  }
}

export function getLocalSuggestions(
  query: string,
  characters: DictionaryCharacter[]
): TranslatorSuggestion[] {
  const q = query.trim();
  if (!q) return [];
  const results: TranslatorSuggestion[] = [];
  const seenZh = new Set<string>();
  const pushUnique = (item: TranslatorSuggestion) => {
    if (!item.zh || seenZh.has(item.zh)) return;
    seenZh.add(item.zh);
    results.push(item);
  };
  const qLower = q.toLowerCase();
  const qNormAr = normalizeArabic(q);
  const qNormPy = stripToneMarks(q);
  const isPy = isPinyinInput(q);
  const isZh = /[\u4E00-\u9FFF]/.test(q);

  for (const p of TRADE_TRAVEL_PHRASES) {
    if (results.length >= 4) break;
    const match = isZh
      ? p.zh_sim.includes(q)
      : isPy
        ? stripToneMarks(p.pinyin).includes(qNormPy)
        : normalizeArabic(p.ar).includes(qNormAr) || (p.ar_egyptian && normalizeArabic(p.ar_egyptian).includes(qNormAr));
    if (match) pushUnique({ zh: p.zh_sim, pinyin: p.pinyin, ar: p.ar, source: 'local' });
  }

  for (const c of characters) {
    if (results.length >= 8) break;
    const match = isZh
      ? c.simplified.includes(q) || c.traditional.includes(q)
      : isPy
        ? stripToneMarks(c.pinyin) === qNormPy || stripToneMarks(c.pinyin).startsWith(qNormPy)
        : c.meaning_ar.toLowerCase().includes(qLower);
    if (match) pushUnique({ zh: c.simplified, pinyin: c.pinyin, ar: c.meaning_ar, source: 'local' });
  }

  return results.slice(0, 8);
}

export async function resolvePinyinToChinese(
  pinyinInput: string,
  characters: DictionaryCharacter[] = []
): Promise<string | null> {
  const norm = stripToneMarks(pinyinInput);
  if (!norm) return null;
  const phraseHit = TRADE_TRAVEL_PHRASES.find((p) => stripToneMarks(p.pinyin) === norm);
  if (phraseHit) return phraseHit.zh_sim;
  const onlineCandidates = await fetchOnlinePinyinCandidates(pinyinInput);
  if (onlineCandidates.length > 0) return onlineCandidates[0];
  const syllables = pinyinInput.trim().split(/\s+/).filter(Boolean);
  if (characters.length > 0 && syllables.length > 0) {
    const assembled = syllables
      .map((syl) => {
        const cleanSyl = stripToneMarks(syl);
        const found = characters.find((c) => stripToneMarks(c.pinyin) === cleanSyl);
        return found ? found.simplified : '';
      })
      .join('');
    if (assembled) return assembled;
  }
  return null;
}