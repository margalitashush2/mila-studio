import { describe, expect, it } from 'vitest';
import { keepSegments, mergeRanges, outputToSource, rangeToOutput, sourceToOutput, nextPlayableTime } from './timeline';
import { buildCues, cueAt, activeWordId } from './captions';
import { buildSrt, srtTimestamp } from './srt';
import { detectFillers, detectSilences, applyDictionary, dictionaryKeyterms } from './cleanup';
import { parseScribe, cutForWords, sentences, plainText } from './transcript';
import { DEFAULT_CAPTION_STYLE } from './presets';
import type { Transcript } from './types';

function mk(words: [string, number, number, string?][]): Transcript {
  return parseScribe(
    {
      language_code: 'heb',
      language_probability: 0.99,
      text: '',
      words: words.flatMap(([text, start, end, sp], i) => [
        ...(i ? [{ text: ' ', start, end: start, type: 'spacing' as const }] : []),
        { text, start, end, type: 'word' as const, speaker_id: sp ?? 'speaker_0', logprob: -0.1 },
      ]),
    },
    'scribe_v2',
  );
}

describe('timeline', () => {
  it('merges ranges', () => {
    expect(mergeRanges([{ start: 5, end: 6 }, { start: 1, end: 2 }, { start: 1.5, end: 3 }])).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 6 },
    ]);
  });
  it('computes keep segments and remaps time', () => {
    const segs = keepSegments(0, 10, [{ start: 2, end: 3 }, { start: 6, end: 7 }]);
    expect(segs).toEqual([{ start: 0, end: 2 }, { start: 3, end: 6 }, { start: 7, end: 10 }]);
    expect(sourceToOutput(4, segs)).toBe(3);
    expect(sourceToOutput(2.5, segs)).toBeNull();
    expect(outputToSource(3, segs)).toBe(4);
    expect(rangeToOutput({ start: 1, end: 8 }, segs)).toEqual([
      { start: 1, end: 2 },
      { start: 2, end: 5 },
      { start: 5, end: 6 },
    ]);
    expect(nextPlayableTime(2.5, segs)).toBe(3);
    expect(nextPlayableTime(4, segs)).toBeNull();
  });
});

describe('scribe parsing', () => {
  it('drops spacing, maps speakers', () => {
    const t = mk([['שלום', 0, 0.4], ['לכולם.', 0.5, 0.9], ['היי', 1.2, 1.5, 'speaker_1']]);
    expect(t.words.map((w) => w.text)).toEqual(['שלום', 'לכולם.', 'היי']);
    expect(t.speakers).toHaveLength(2);
    expect(t.speakers[1].name).toBe('דובר 2');
  });
});

describe('captions', () => {
  const t = mk([
    ['היום', 0, 0.3], ['אני', 0.35, 0.5], ['רוצה', 0.55, 0.8], ['לדבר', 0.85, 1.1], ['על', 1.15, 1.25],
    ['iPhone', 1.3, 1.7], ['16.', 1.75, 2.1], ['מה', 3.5, 3.7], ['דעתכם?', 3.75, 4.2],
  ]);
  it('splits on sentence end and long pauses', () => {
    const cues = buildCues(t, DEFAULT_CAPTION_STYLE, 'organized', []);
    expect(cues).toHaveLength(2);
    expect(cues[0].lines.flat().map((w) => w.text).join(' ')).toBe('היום אני רוצה לדבר על iPhone 16.');
  });
  it('respects line length', () => {
    const cues = buildCues(t, { ...DEFAULT_CAPTION_STYLE, maxCharsPerLine: 12, maxLines: 1 }, 'organized', []);
    for (const c of cues) for (const l of c.lines) expect(l.map((w) => w.text).join(' ').length).toBeLessThanOrEqual(12);
  });
  it('single word display and active word', () => {
    const cues = buildCues(t, { ...DEFAULT_CAPTION_STYLE, display: 'single' }, 'organized', []);
    expect(cues).toHaveLength(9);
    const c = cueAt(cues, 0.6)!;
    expect(c.lines[0][0].text).toBe('רוצה');
    const k = buildCues(t, { ...DEFAULT_CAPTION_STYLE, display: 'karaoke' }, 'organized', []);
    expect(activeWordId(k[0], 0.9)).toBe(t.words[3].id);
  });
  it('removes cut words and verbatim strips punctuation', () => {
    const cues = buildCues(t, DEFAULT_CAPTION_STYLE, 'verbatim', [{ id: 'c', start: 1.28, end: 2.2, reason: 'manual' }]);
    const text = cues.map((c) => c.lines.flat().map((w) => w.text).join(' '));
    expect(text[0]).toBe('היום אני רוצה לדבר על');
    expect(text[1]).toBe('מה דעתכם');
  });
  it('no flicker: cues never shorter than minimum when room exists', () => {
    const cues = buildCues(t, { ...DEFAULT_CAPTION_STYLE, display: 'single' }, 'organized', []);
    const last = cues[cues.length - 1];
    expect(last.end - last.start).toBeGreaterThanOrEqual(0.6);
  });
});

describe('srt', () => {
  it('formats timestamps', () => {
    expect(srtTimestamp(3661.5)).toBe('01:01:01,500');
  });
  it('builds srt remapped to output timeline with RTL marks', () => {
    const t = mk([['שלום', 5, 5.5], ['עולם.', 5.6, 6]]);
    const cues = buildCues(t, DEFAULT_CAPTION_STYLE, 'organized', []);
    const srt = buildSrt(cues, [{ start: 4, end: 10 }]);
    expect(srt).toContain('00:00:01,000 --> ');
    expect(srt).toContain('‏שלום עולם.‏');
  });
});

describe('cleanup', () => {
  const t = mk([['אממ', 0, 0.3], ['אני', 0.4, 0.6], ['אני', 0.65, 0.8], ['כאילו', 0.9, 1.2], ['חושבת.', 1.3, 1.8], ['טוב', 4, 4.3]]);
  it('detects fillers and repetitions', () => {
    const f = detectFillers(t.words);
    expect(f.map((x) => [x.text, x.kind, x.suggested])).toEqual([
      ['אממ', 'filler', true],
      ['אני', 'repetition', true],
      ['כאילו', 'possible-filler', false],
    ]);
  });
  it('detects silences with padding', () => {
    const s = detectSilences(t.words, { start: 0, end: 6 });
    expect(s).toHaveLength(2);
    expect(s[0].cutStart).toBeCloseTo(1.95);
    expect(s[0].cutEnd).toBeCloseTo(3.85);
    expect(s[1].cutEnd).toBe(6); // trailing silence fully removed
  });
  it('applies dictionary keeping punctuation', () => {
    const w = applyDictionary(t.words, [{ id: '1', from: 'חושבת', to: 'חושֶבֶת', keyterm: false }]);
    expect(w[4].text).toBe('חושֶבֶת.');
    expect(dictionaryKeyterms([{ id: '1', from: '', to: 'מילה סטודיו', keyterm: true }])).toEqual(['מילה סטודיו']);
  });
  it('cuts for words stay inside neighbours', () => {
    const c = cutForWords(t.words, [t.words[3]], 'filler')!;
    expect(c.start).toBeGreaterThanOrEqual(0.8);
    expect(c.end).toBeLessThanOrEqual(1.3);
  });
  it('sentences and plain text', () => {
    expect(sentences(t)).toHaveLength(2);
    expect(plainText(t)).toBe('אממ אני אני כאילו חושבת. טוב');
  });
});

import { visualOrderRtl } from './bidi';
describe('bidi visual order', () => {
  const vis = (ws: string[]) => visualOrderRtl(ws).map((v) => v.text);
  it('pure hebrew stays logical right-to-left', () => {
    expect(vis(['שלום', 'לכולם,', 'מה', 'נשמע?'])).toEqual(['שלום', 'לכולם,', 'מה', 'נשמע?']);
  });
  it('english run keeps LTR order, number joins it, trailing punctuation goes to the left', () => {
    // logical: "קניתי New York 2024." -> visual right-to-left: קניתי | New York 2024 | .
    // so items right->left: קניתי, 2024, York, New, "."
    expect(vis(['קניתי', 'New', 'York', '2024.'])).toEqual(['קניתי', '2024', 'York', 'New', '.']);
  });
  it('numbers between hebrew words stay in place', () => {
    expect(vis(['יש', '3', 'דברים'])).toEqual(['יש', '3', 'דברים']);
  });
  it('parentheses with hebrew are untouched', () => {
    expect(vis(['(בערך)', 'עשר'])).toEqual(['(בערך)', 'עשר']);
  });
});

import { z85Decode, z85Encode } from '../asr/z85';
describe('z85', () => {
  it('round-trips arbitrary bytes', () => {
    const b = new Uint8Array(1003).map((_, i) => (i * 37 + 11) & 255);
    expect(Array.from(z85Decode(z85Encode(b), b.length))).toEqual(Array.from(b));
  });
});

import { replaceWordsText } from './transcript';
describe('sentence editing', () => {
  const t = mk([['שלם', 0, 0.5], ['עולם', 0.6, 1], ['טוב', 2, 2.4]]);
  it('same count keeps timings', () => {
    const r = replaceWordsText(t, [t.words[0].id, t.words[1].id], 'שלום עולם.');
    expect(r.words.map((w) => [w.text, w.start])).toEqual([['שלום', 0], ['עולם.', 0.6], ['טוב', 2]]);
  });
  it('different count spreads over the span', () => {
    const r = replaceWordsText(t, [t.words[0].id, t.words[1].id], 'שלום לכל העולם');
    expect(r.words).toHaveLength(4);
    expect(r.words[0].start).toBe(0);
    expect(r.words[2].end).toBeCloseTo(1);
    expect(r.words[3].text).toBe('טוב');
  });
});
