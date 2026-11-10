import type { DictionaryEntry, Transcript, Word } from './types';
import type { Range } from './timeline';
import { normalizeWord, splitAffixes } from './text';

/** Sounds that are (almost) always fillers. Pre-selected for removal. */
const STRONG_FILLERS = new Set([
  'אה', 'אהה', 'אההה', 'אהההה', 'אמ', 'אממ', 'אמממ', 'אממממ', 'הממ', 'המממ', 'ממ', 'מממ', 'אהם', 'אמה',
  'eh', 'uh', 'uhm', 'um', 'umm', 'hmm', 'erm',
]);
/** Words that are fillers only in some contexts. Shown, but not pre-selected. */
const SOFT_FILLERS = new Set(['כאילו', 'כזה', 'כזאת', 'יעני', 'בקיצור', 'נגיד', 'בעצם', 'סתם', 'נו', 'like']);

export type FillerKind = 'filler' | 'possible-filler' | 'repetition';

export interface FillerCandidate {
  wordId: string;
  text: string;
  start: number;
  end: number;
  kind: FillerKind;
  /** Pre-selected in the UI */
  suggested: boolean;
}

export function detectFillers(words: Word[]): FillerCandidate[] {
  const spoken = words.filter((w) => w.kind === 'word');
  const out: FillerCandidate[] = [];
  for (let i = 0; i < spoken.length; i++) {
    const w = spoken[i];
    const n = normalizeWord(w.text);
    if (!n) continue;
    const isStrong = STRONG_FILLERS.has(n) || /^(א+ה+|א+מ+|ה+מ+|מ{2,})$/.test(n);
    if (isStrong) {
      out.push({ wordId: w.id, text: w.text, start: w.start, end: w.end, kind: 'filler', suggested: true });
      continue;
    }
    if (SOFT_FILLERS.has(n)) {
      out.push({ wordId: w.id, text: w.text, start: w.start, end: w.end, kind: 'possible-filler', suggested: false });
      continue;
    }
    const next = spoken[i + 1];
    if (next && normalizeWord(next.text) === n && next.start - w.end < 1.0) {
      out.push({ wordId: w.id, text: w.text, start: w.start, end: w.end, kind: 'repetition', suggested: true });
    }
  }
  return out;
}

/** Marks fillers / repetitions as hidden for the "clean" transcript mode (does not touch the video). */
export function applyLocalClean(t: Transcript): Transcript {
  const hidden = new Set(detectFillers(t.words).filter((c) => c.suggested).map((c) => c.wordId));
  return {
    ...t,
    revision: t.revision + 1,
    words: t.words.map((w) => ({ ...w, cleanHidden: hidden.has(w.id) })),
  };
}

export interface SilenceCandidate {
  id: string;
  /** The full gap without speech */
  gapStart: number;
  gapEnd: number;
  /** The range that would be removed (gap minus padding) */
  cutStart: number;
  cutEnd: number;
  duration: number;
}

export function detectSilences(
  words: Word[],
  range: Range,
  opts: { minGap?: number; padding?: number } = {},
): SilenceCandidate[] {
  const minGap = opts.minGap ?? 0.8;
  const padding = opts.padding ?? 0.15;
  const spoken = words
    .filter((w) => w.kind === 'word' && w.end > range.start && w.start < range.end)
    .sort((a, b) => a.start - b.start);
  const gaps: { s: number; e: number }[] = [];
  let cursor = range.start;
  let first = true;
  for (const w of spoken) {
    if (w.start > cursor) gaps.push({ s: cursor, e: w.start });
    cursor = Math.max(cursor, w.end);
    first = false;
  }
  if (!first && range.end > cursor) gaps.push({ s: cursor, e: range.end });
  if (first) gaps.push({ s: range.start, e: range.end });

  return gaps
    .filter((g) => g.e - g.s >= minGap)
    .map((g) => {
      const atStart = g.s <= range.start + 0.001;
      const atEnd = g.e >= range.end - 0.001;
      const cutStart = atStart ? g.s : g.s + padding;
      const cutEnd = atEnd ? g.e : g.e - padding;
      return {
        id: `sil_${Math.round(g.s * 1000)}`,
        gapStart: g.s,
        gapEnd: g.e,
        cutStart,
        cutEnd,
        duration: cutEnd - cutStart,
      };
    })
    .filter((c) => c.duration > 0.1);
}

/** Apply personal-dictionary replacements to engine output, keeping punctuation around words. */
export function applyDictionary(words: Word[], dict: DictionaryEntry[]): Word[] {
  const map = new Map<string, string>();
  for (const d of dict) {
    const key = normalizeWord(d.from);
    if (key && !key.includes(' ')) map.set(key, d.to);
  }
  if (!map.size) return words;
  return words.map((w) => {
    if (w.kind !== 'word') return w;
    const { pre, core, post } = splitAffixes(w.text);
    const repl = map.get(normalizeWord(core));
    return repl ? { ...w, text: pre + repl + post } : w;
  });
}

export function dictionaryKeyterms(dict: DictionaryEntry[]): string[] {
  const out = new Set<string>();
  for (const d of dict) {
    if (!d.keyterm) continue;
    const t = d.to.replace(/[<>{}\[\]\\]/g, '').trim();
    if (t && t.length <= 50 && t.split(/\s+/).length <= 5) out.add(t);
  }
  return [...out].slice(0, 1000);
}
