// src/services/readingEvaluator.ts
// Pinyin-aware Longest Common Subsequence (LCS) Speech Reading Evaluator
// Compares target Chinese story text against user's spoken transcript (zh-CN),
// highlighting mispronounced/skipped words in RED and allowing tap-to-hear correction.

import { pinyin } from 'pinyin-pro';

export interface EvaluatedCharToken {
  char: string;
  isHanzi: boolean;
  pinyin: string;
  status: 'correct' | 'wrong' | 'punctuation';
}

export interface ReadingEvaluationResult {
  tokens: EvaluatedCharToken[];
  spokenTranscript: string;
  totalHanzi: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
  wrongChars: Array<{ char: string; pinyin: string }>;
}

const HANZI_REGEX = /[\u4E00-\u9FFF]/;

function getNormalizedSyllable(char: string): string {
  const py = pinyin(char, { toneType: 'none' }) || '';
  return py.trim().toLowerCase();
}

function getTonePinyin(char: string): string {
  return (pinyin(char, { toneType: 'symbol' }) || '').trim();
}

function charsMatch(targetChar: string, spokenChar: string): boolean {
  if (targetChar === spokenChar) return true;
  const tPy = getNormalizedSyllable(targetChar);
  const sPy = getNormalizedSyllable(spokenChar);
  return Boolean(tPy && sPy && tPy === sPy);
}

export function evaluateChineseReading(
  targetText: string,
  spokenTranscript: string
): ReadingEvaluationResult {
  const targetChars = Array.from(targetText);
  const targetHanziIndices: number[] = [];
  const targetHanzi: string[] = [];

  targetChars.forEach((ch, idx) => {
    if (HANZI_REGEX.test(ch)) {
      targetHanziIndices.push(idx);
      targetHanzi.push(ch);
    }
  });

  const spokenHanzi = Array.from(spokenTranscript || '').filter((ch) => HANZI_REGEX.test(ch));

  const m = targetHanzi.length;
  const n = spokenHanzi.length;

  const dp: Uint16Array[] = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (charsMatch(targetHanzi[i - 1], spokenHanzi[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }

  const matchedSet = new Set<number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (charsMatch(targetHanzi[i - 1], spokenHanzi[j - 1])) {
      matchedSet.add(targetHanziIndices[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  let correctCount = 0;
  let wrongCount = 0;
  const wrongSeen = new Set<string>();
  const wrongChars: Array<{ char: string; pinyin: string }> = [];

  const tokens: EvaluatedCharToken[] = targetChars.map((ch, idx) => {
    if (!HANZI_REGEX.test(ch)) {
      return { char: ch, isHanzi: false, pinyin: '', status: 'punctuation' };
    }
    const py = getTonePinyin(ch);
    if (matchedSet.has(idx)) {
      correctCount++;
      return { char: ch, isHanzi: true, pinyin: py, status: 'correct' };
    } else {
      wrongCount++;
      if (!wrongSeen.has(ch)) {
        wrongSeen.add(ch);
        wrongChars.push({ char: ch, pinyin: py });
      }
      return { char: ch, isHanzi: true, pinyin: py, status: 'wrong' };
    }
  });

  const totalHanzi = targetHanzi.length;
  const accuracy = totalHanzi > 0 ? Math.round((correctCount / totalHanzi) * 100) : 100;

  return {
    tokens,
    spokenTranscript,
    totalHanzi,
    correctCount,
    wrongCount,
    accuracy,
    wrongChars
  };
}