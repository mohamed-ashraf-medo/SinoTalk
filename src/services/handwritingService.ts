// src/services/handwritingService.ts
// Free, zero-API-key Chinese Handwriting Recognition & Any-Character Instant Lookup
// Tier 1: Google Input Tools Handwriting API (20,000+ CJK chars, ~98% accuracy)
// Tier 2: Live translation + pinyin-pro fallback for rare characters outside local dictionary

import { pinyin } from 'pinyin-pro';
import { DictionaryCharacter, TranslationResult } from '../types';
import { requestTranslation } from './translationService';

export interface StrokeTrace {
  xs: number[];
  ys: number[];
  ts: number[];
}

export interface AnyCharLookupResult {
  char: string;
  traditional: string;
  pinyin: string;
  tone: number;
  meaning_ar: string;
  phonetic_ar?: string;
  strokes?: number;
  hsk?: number;
  source: 'local-dictionary' | 'live-translation';
  dictionaryMatch?: DictionaryCharacter;
  translationResult?: TranslationResult;
}

export async function recognizeHandwritingStrokes(
  traces: StrokeTrace[],
  canvasWidth = 320,
  canvasHeight = 320
): Promise<string[]> {
  if (!traces.length) return [];
  const ink = traces.map((t) => [t.xs, t.ys, t.ts]);
  try {
    const response = await fetch(
      'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          options: 'enable_pre_space',
          requests: [
            {
              writing_guide: { writing_area_width: canvasWidth, writing_area_height: canvasHeight },
              ink,
              language: 'zh_CN'
            }
          ]
        })
      }
    );
    if (!response.ok) return [];
    const data = await response.json();
    if (Array.isArray(data) && data[0] === 'SUCCESS' && Array.isArray(data[1]?.[0]?.[1])) {
      const rawCandidates: string[] = data[1][0][1];
      const uniqueHanzi: string[] = [];
      for (const item of rawCandidates) {
        const clean = item.trim();
        if (/[\u4E00-\u9FFF]/.test(clean) && !uniqueHanzi.includes(clean)) {
          uniqueHanzi.push(clean);
        }
        if (uniqueHanzi.length >= 10) break;
      }
      return uniqueHanzi;
    }
    return [];
  } catch {
    return [];
  }
}

export async function lookupAnyChineseCharacter(
  input: string,
  dictionary: DictionaryCharacter[]
): Promise<AnyCharLookupResult> {
  const clean = input.trim();
  const localMatch = dictionary.find((c) => c.simplified === clean || c.traditional === clean);
  if (localMatch) {
    return {
      char: localMatch.simplified,
      traditional: localMatch.traditional,
      pinyin: localMatch.pinyin,
      tone: localMatch.tone,
      meaning_ar: localMatch.meaning_ar,
      phonetic_ar: localMatch.phonetic_ar,
      strokes: localMatch.strokes,
      hsk: localMatch.hsk,
      source: 'local-dictionary',
      dictionaryMatch: localMatch
    };
  }
  const py = pinyin(clean, { toneType: 'symbol' }) || '';
  const pyNum = pinyin(clean, { toneType: 'num' }) || '';
  const toneMatch = pyNum.match(/[1-5]/);
  const tone = toneMatch ? Number(toneMatch[0]) : 5;
  const translationResult = await requestTranslation({ text: clean, direction: 'zh-ar' });
  return {
    char: clean,
    traditional: translationResult.traditional || clean,
    pinyin: translationResult.pinyin || py,
    tone,
    meaning_ar: translationResult.translated_arabic || 'معنى سياقي متاح في المترجم',
    phonetic_ar: translationResult.phonetic_ar,
    source: 'live-translation',
    translationResult
  };
}