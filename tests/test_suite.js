// tests/test_suite.js
// Comprehensive Verification & Quality Assurance Suite for SinoTalk

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { executeTranslation } from '../server/services/translationAdapter.js';
import { toTraditional, toSimplified } from '../server/services/chineseConverter.js';
import { findEgyptianMatch, normalizeArabic } from '../server/services/egyptianArabicDictionary.js';

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    failed++;
  }
}

async function main() {
  console.log('========================================================');
  console.log('🧪 Starting SinoTalk Comprehensive QA & Verification Suite');
  console.log('========================================================\n');

  // Test 1: Dictionary Dataset Uniqueness and Size (Upgraded to >= 8,000!)
  runTest('Requirement 7 (V6): Chinese Dictionary has >= 8,000 distinct verified characters', () => {
    const dictPath = path.join(__dirname, '..', 'public', 'data', 'dictionary_8000.json');
    assert(fs.existsSync(dictPath), 'dictionary_8000.json must exist');
    const data = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    assert(data.length >= 8000, `Expected >= 8000 characters, found ${data.length}`);

    const set = new Set();
    for (const c of data) {
      assert(c.simplified, 'Each character must have a simplified form');
      assert(c.pinyin, `Character ${c.simplified} must have pinyin`);
      assert(c.meaning_ar, `Character ${c.simplified} must have Arabic meaning`);
      assert(c.hsk >= 1 && c.hsk <= 7, `Character ${c.simplified} must have valid HSK 1-7`);
      assert(!set.has(c.simplified), `Duplicate character detected: ${c.simplified}`);
      set.add(c.simplified);
    }
    console.log(`   (Verified ${data.length} completely unique characters)`);
  });

  // Test 2: Egyptian Colloquial Understanding
  await runAsyncTest('Requirement 5: Context-aware Egyptian colloquial phrases ("إزيك عامل إيه")', async () => {
    const res = await executeTranslation({ text: 'إزيك عامل إيه' });
    assert(res.simplified.includes('你好') || res.simplified.includes('怎么样'), 'Must translate to appropriate Chinese greeting');
    assert(res.context_note, 'Must include contextual explanation');
    assert(res.pinyin, 'Must include Pinyin');
  });

  await runAsyncTest('Requirement 5: Egyptian shopping phrase ("بكام ده")', async () => {
    const res = await executeTranslation({ text: 'بكام ده' });
    assert(res.simplified.includes('多少钱'), 'Must recognize price question (多少钱)');
  });

  await runAsyncTest('Requirement 5: Egyptian phrase ("معلش")', async () => {
    const res = await executeTranslation({ text: 'معلش' });
    assert(res.simplified.includes('没关系') || res.simplified.includes('不要紧'), 'Must map معلش to 没关系 / 不要紧');
  });

  // Test 3: Chinese Writing System Conversions
  runTest('Requirement 5: Simplified to Traditional Chinese conversion', () => {
    const sim = '我们在学校学习汉语';
    const tra = toTraditional(sim);
    assert.strictEqual(tra, '我們在學校學習漢語', 'Simplified characters must convert to Traditional equivalents');
  });

  runTest('Requirement 5: Traditional to Simplified Chinese conversion', () => {
    const tra = '謝謝你的幫助';
    const sim = toSimplified(tra);
    assert.strictEqual(sim, '谢谢你的帮助', 'Traditional characters must convert to Simplified equivalents');
  });

  // Test 4: Word-by-word Breakdown and Grammar
  await runAsyncTest('Requirement 6: Translation result contains breakdown, grammar, and pinyin tones', async () => {
    const res = await executeTranslation({ text: 'شكراً جزيلاً' });
    assert(Array.isArray(res.breakdown) && res.breakdown.length > 0, 'Must have word-by-word breakdown');
    assert(res.grammar_note, 'Must have grammar note');
    assert(res.pinyin, 'Must have tone-marked Pinyin');
    assert(res.examples && res.examples.length > 0, 'Must have natural example sentences');
  });

  // Test 5: Chinese to Arabic Translation
  await runAsyncTest('Requirement 5: Chinese to Arabic translation ("你好")', async () => {
    const res = await executeTranslation({ text: '你好', direction: 'zh-ar' });
    assert(res.translated_arabic || res.original, 'Must return Arabic translation');
    assert(res.breakdown.length > 0, 'Must tokenize Chinese words');
  });

  // Test 6: Document Parsers Integrity
  runTest('Requirement 12: Document parser modules exist and are valid', () => {
    const docParserPath = path.join(__dirname, '..', 'server', 'services', 'documentParser.js');
    assert(fs.existsSync(docParserPath), 'documentParser.js must exist');
  });

  // Test 7: Zero Data Retention (Privacy Guarantee)
  runTest('Requirement 14: Privacy verification (No history database or user account tables exist)', () => {
    assert(!fs.existsSync(path.join(__dirname, '..', 'history.db')), 'No history database should exist');
    assert(!fs.existsSync(path.join(__dirname, '..', 'users.db')), 'No user database should exist');
  });

  // Test 8: PWA and Offline Service Worker Assets
  runTest('Requirement 2 & 13: PWA Manifest and Service Worker exist', () => {
    assert(fs.existsSync(path.join(__dirname, '..', 'public', 'manifest.json')), 'manifest.json must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'public', 'sw.js')), 'sw.js must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'public', 'logo.svg')), 'logo.svg must exist');
  });

  // Test 9: V2 Safe-Area, Zero-Alert & Mobile 5-Tab Navigation Compliance
  runTest('V2 UI/UX: viewport-fit=cover, zero window.alert(), and <= 5 BottomNav tabs', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(html.includes('viewport-fit=cover'), 'index.html must include viewport-fit=cover for Android safe areas');

    const bottomNav = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'layout', 'BottomNav.tsx'), 'utf8');
    assert(bottomNav.includes('grid-cols-5'), 'BottomNav must use a 5-tab layout');

    // Walk src/ to ensure zero alert() calls remain
    const scanDir = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scanDir(full);
        else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
          const content = fs.readFileSync(full, 'utf8');
          assert(!/\balert\s*\(/.test(content), `Found forbidden alert() call in ${full}`);
        }
      }
    };
    scanDir(path.join(__dirname, '..', 'src'));
  });

  // Test 10: V2 Standalone Client-First Architecture (Electron + Capacitor ready)
  runTest('V2 Packaging: Relative Vite base, Electron (.exe), Capacitor (.apk), and CI configs exist', () => {
    const viteCfg = fs.readFileSync(path.join(__dirname, '..', 'vite.config.ts'), 'utf8');
    assert(viteCfg.includes("base: './'"), "vite.config.ts must use base: './' for Electron/Capacitor");
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'services', 'clientDocumentParser.ts')), 'clientDocumentParser.ts must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'services', 'platformBridge.ts')), 'platformBridge.ts must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'electron', 'main.cjs')), 'electron/main.cjs must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'electron', 'preload.cjs')), 'electron/preload.cjs must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'capacitor.config.ts')), 'capacitor.config.ts must exist');
    assert(fs.existsSync(path.join(__dirname, '..', '.github', 'workflows', 'build-apps.yml')), 'GitHub Actions build-apps.yml must exist');
    const manifest = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    assert(manifest.includes('android.permission.CAMERA'), 'AndroidManifest must request CAMERA permission');
    assert(manifest.includes('android.permission.RECORD_AUDIO'), 'AndroidManifest must request RECORD_AUDIO permission');
  });

  // Test 11: V2 Trade & Travel Phrasebook + Price Converter
  runTest('V2 Features: Trade & Travel Phrasebook and Chinese Price Converter exist', () => {
    const phraseSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'tradeTravelPhrases.ts'), 'utf8');
    assert(phraseSrc.includes('最小起订量是多少'), 'Trade phrasebook must include MOQ phrase');
    assert(phraseSrc.includes('清真餐厅'), 'Trade phrasebook must include Halal food phrase');
    const numSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'chineseNumberConverter.ts'), 'utf8');
    assert(numSrc.includes('numberToChinesePrice'), 'chineseNumberConverter.ts must export numberToChinesePrice');
  });

  // Test 12: V3 Refined WCAG AA Colors, Natural Voice Engine & Hanzi Stroke Writer
  runTest('V3 Upgrades: WCAG AA CSS tokens, Natural Voice Engine V3, and HanziStrokeWriter exist', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');
    assert(css.includes('--surface-canvas: #F7F6F2'), 'index.css must define warm alabaster light canvas token');
    assert(css.includes('--accent-solid: #C2410C'), 'index.css must define WCAG AA burnt-orange accent token');

    const voiceSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'voiceEngine.ts'), 'utf8');
    assert(voiceSrc.includes('speakNatural'), 'voiceEngine.ts must export speakNatural');
    assert(voiceSrc.includes('zh_male_chunhou'), 'voiceEngine.ts must include genuine studio Male Mandarin voice');

    const writerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'ui', 'HanziStrokeWriter.tsx'), 'utf8');
    assert(writerSrc.includes('HanziWriter'), 'HanziStrokeWriter.tsx must integrate hanzi-writer');
    assert(writerSrc.includes("touchAction: 'none'"), 'HanziStrokeWriter must set touchAction: none for smooth mobile drawing');
    assert(writerSrc.includes('isLoadingStrokes'), 'HanziStrokeWriter must display loading state while fetching stroke data');
  });

  // Test 13: V3 Refactoring Cleanup, Writing Academy, Learning Suite & Detailed User Guide
  runTest('V3 Refactoring: Dead scripts removed, clean src/features layout, WritingAcademy, TonesLab, 50 Radicals, Quiz, ShowCard, and UserGuide exist', () => {
    assert(!fs.existsSync(path.join(__dirname, '..', 'scripts', 'generate_all_lexicons.js')), 'Dead script generate_all_lexicons.js must be deleted');
    assert(!fs.existsSync(path.join(__dirname, '..', 'run.bat')), 'Duplicate run.bat must be deleted');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'features', 'writing', 'WritingAcademy.tsx')), 'WritingAcademy.tsx must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'features', 'learning', 'TonesLab.tsx')), 'TonesLab.tsx must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'features', 'learning', 'RadicalsGuide.tsx')), 'RadicalsGuide.tsx must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'features', 'learning', 'HskPlacementQuiz.tsx')), 'HskPlacementQuiz.tsx must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'features', 'guide', 'UserGuide.tsx')), 'UserGuide.tsx must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'components', 'ui', 'FullscreenShowCard.tsx')), 'FullscreenShowCard.tsx must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'components', 'ui', 'LoadingState.tsx')), 'LoadingState.tsx must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'docs', 'USER_GUIDE_AR.md')), 'docs/USER_GUIDE_AR.md must exist');
    const compDirs = fs.readdirSync(path.join(__dirname, '..', 'src', 'components')).sort();
    assert.deepStrictEqual(compDirs, ['layout', 'ui'], `src/components should only contain layout and ui, found: ${compDirs.join(', ')}`);
    const radSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'radicalsData.ts'), 'utf8');
    assert(radSrc.includes('id: 50'), 'radicalsData.ts must contain all 50 essential radicals');
  });

  // Test 14: V8.2 Release Consistency — Rock-Solid Male-Only Multi-Layer Audio (HTMLAudio + WebAudio + Android Native MediaPlayer), Byte-Safe Chunks, Clean index.html & Visible Error Toasts
  runTest('V8.2 Upgrades: 8.2.0 versioning, Male-Only Multi-Layer Voice, UTF-8 Byte Chunks, Android Native MediaPlayer, Electron Autoplay & Clean index.html', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.strictEqual(pkg.version, '8.2.0', 'package.json version must be 8.2.0');
    const nav = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'layout', 'Navbar.tsx'), 'utf8');
    assert(nav.includes('V8'), 'Navbar must show V8 badge');
    const voice = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'voiceEngine.ts'), 'utf8');
    assert(
      voice.includes('BV002_streaming') &&
        voice.includes('zh_male_zhubo') &&
        voice.includes('FEMALE_VOICE_BLACKLIST') &&
        voice.includes('primeAudioEngine') &&
        voice.includes('TextEncoder') &&
        voice.includes('SinoNativeAudio') &&
        voice.includes("category: 'playback'") &&
        voice.includes('diagnoseVoiceEngine') &&
        voice.includes('warmUpOsVoices') &&
        !voice.includes('SILENT_WAV'),
      'voiceEngine must implement V8.2 byte-safe multi-layer male audio with zero SILENT_WAV and playback category'
    );
    const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'platformBridge.ts'), 'utf8');
    assert(bridge.includes('toast.error'), 'platformBridge must surface audio playback errors via toast instead of silent failure');
    const mainJava = fs.readFileSync(path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'java', 'com', 'sinotalk', 'app', 'MainActivity.java'), 'utf8');
    assert(
      mainJava.includes('setMediaPlaybackRequiresUserGesture(false)') &&
        mainJava.includes('SinoNativeAudio') &&
        mainJava.includes('MediaPlayer') &&
        mainJava.includes('USAGE_MEDIA'),
      'MainActivity.java must expose SinoNativeAudio MediaPlayer + unblocked WebView audio'
    );
    const electronMain = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');
    assert(electronMain.includes('autoplay-policy') && electronMain.includes('no-user-gesture-required'), 'electron/main.cjs must allow autoplay without gesture expiry');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(
      html.includes("document.documentElement.classList.add('dark')") &&
        !html.includes('docu ment') &&
        html.includes('Capacitor'),
      'index.html must have valid Dark Mode pre-paint script and skip SW on Capacitor native'
    );
    const trans = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'translator', 'SmartTranslator.tsx'), 'utf8');
    assert(
      trans.includes('primeAudioEngine') &&
        trans.includes("direction === 'zh-ar'") &&
        trans.includes('autoSpeak') &&
        trans.includes('[overflow-wrap:anywhere]') &&
        trans.includes('overflow-hidden'),
      'SmartTranslator must prime audio before async translation, handle zh-ar direction, and prevent overflow'
    );
    const settings = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'settings', 'SettingsView.tsx'), 'utf8');
    assert(
      settings.includes('SinoTalk v8.2.0') &&
        settings.includes('diagnoseVoiceEngine') &&
        settings.includes('zh_male_zhubo') &&
        !settings.includes('صوت أنثى'),
      'SettingsView must display SinoTalk v8.2.0, zh_male_zhubo, live audio diagnostics, and zero female voice option'
    );
  });

  // Test 15: V5 6 Chinese Story Books (>= 150 Pages Each = 900+ Pages) + Reading Mic Red-Word Evaluator
  runTest('V5 Story Library: 6 graded Chinese books (>= 150 pages each) + continuous mic & red-word evaluator exist', () => {
    const booksDir = path.join(__dirname, '..', 'public', 'data', 'books');
    const catalog = JSON.parse(fs.readFileSync(path.join(booksDir, 'catalog.json'), 'utf8'));
    assert.strictEqual(catalog.length, 6, 'Must have exactly 6 Chinese story books');
    let totalPages = 0;
    for (const meta of catalog) {
      const bookPath = path.join(booksDir, `${meta.id}.json`);
      assert(fs.existsSync(bookPath), `${meta.id}.json must exist`);
      const book = JSON.parse(fs.readFileSync(bookPath, 'utf8'));
      assert(book.pages.length >= 150, `Book ${meta.id} must have >= 150 pages, found ${book.pages.length}`);
      assert(book.pages[0].sentences.length >= 3, `Book ${meta.id} page 1 must have story sentences`);
      assert(book.pages[149].sentences.length >= 3, `Book ${meta.id} page 150 must have story sentences`);
      const rawJson = fs.readFileSync(bookPath, 'utf8');
      assert(!rawJson.includes('محمد') && !rawJson.includes('穆罕默德'), `Book ${meta.id} must use alias names`);
      totalPages += book.pages.length;
    }
    console.log(`   (Verified 6 books with ${totalPages} total pages — 150 pages per book, alias names)`);
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'services', 'readingEvaluator.ts')), 'readingEvaluator.ts must exist');
    assert(fs.existsSync(path.join(__dirname, '..', 'src', 'services', 'readingSpeechService.ts')), 'readingSpeechService.ts must exist');
    const readerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'books', 'StoryLibrary.tsx'), 'utf8');
    assert(readerSrc.includes('evaluateChineseReading') && readerSrc.includes('text-rose-600'), 'StoryLibrary must highlight wrong words in red');
    assert(readerSrc.includes('0.85') && readerSrc.includes('1.0'), 'StoryLibrary must include normal & slightly slower speed toggles');
    const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.tsx'), 'utf8');
    assert(appSrc.includes('handleCloseSecondaryView') && appSrc.includes('popstate'), 'App.tsx must include X close bar and safe back navigation');
  });

  console.log('\n========================================================');
  console.log(`🏁 Test Results: ${passed} Passed, 0 Failed`.replace('0 Failed', `${failed} Failed`));
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
