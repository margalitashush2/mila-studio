/**
 * Minimal visual ordering for caption lines in a right-to-left paragraph.
 * We draw word by word (needed for per-word highlight), so we must order words visually
 * ourselves. Rules (a practical subset of the Unicode Bidi Algorithm at word level):
 *  - Hebrew words are RTL.
 *  - Words with Latin letters (and no Hebrew) are LTR.
 *  - Neutral words (numbers, symbols) join an LTR run when they sit between LTR words,
 *    otherwise they behave as RTL items (each is drawn with its own internal LTR order).
 * Runs are placed right-to-left; words inside an LTR run are placed left-to-right.
 */

export type Dir = 'rtl' | 'ltr' | 'neutral';

const HEB = /[֐-׿יִ-ﭏ]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

export function wordDir(text: string): Dir {
  if (HEB.test(text)) return 'rtl';
  if (LATIN.test(text)) return 'ltr';
  return 'neutral';
}

/** Direction to draw a single word with (internal glyph order). */
export function drawDir(text: string): 'rtl' | 'ltr' {
  return wordDir(text) === 'rtl' ? 'rtl' : 'ltr';
}

export interface VisualItem {
  /** index of the source word */
  index: number;
  /** text to draw for this item (a word may be split off its trailing punctuation) */
  text: string;
  dir: 'rtl' | 'ltr';
}

const DIGIT = /[0-9]/;
const TRAIL = /^(.*?[^.,?!…:;"')\]])([.,?!…:;"')\]]+)$/;

/**
 * Visual items of a line from RIGHT to LEFT for an RTL paragraph.
 */
export function visualOrderRtl(words: string[]): VisualItem[] {
  const dirs = words.map(wordDir);
  const resolved: ('rtl' | 'ltr')[] = dirs.map((d, i) => {
    if (d !== 'neutral') return d;
    let l: Dir | undefined;
    for (let j = i - 1; j >= 0; j--) if (dirs[j] !== 'neutral') { l = dirs[j]; break; }
    let r: Dir | undefined;
    for (let j = i + 1; j < dirs.length; j++) if (dirs[j] !== 'neutral') { r = dirs[j]; break; }
    // European numbers following Latin text take its direction (UBA rule W7).
    if (l === 'ltr' && DIGIT.test(words[i])) return 'ltr';
    return l === 'ltr' && r === 'ltr' ? 'ltr' : 'rtl';
  });
  const out: VisualItem[] = [];
  let i = 0;
  while (i < words.length) {
    if (resolved[i] === 'ltr') {
      const run: number[] = [];
      while (i < words.length && resolved[i] === 'ltr') run.push(i++);
      const items: VisualItem[] = run.map((k) => ({ index: k, text: words[k], dir: 'ltr' }));
      // Trailing punctuation of an LTR run belongs to the RTL paragraph: it shows on the run's left.
      const last = items[items.length - 1];
      const m = last.text.match(TRAIL);
      let punct: VisualItem | null = null;
      if (m) {
        last.text = m[1];
        punct = { index: last.index, text: m[2], dir: 'rtl' };
      }
      out.push(...items.reverse());
      if (punct) out.push(punct);
    } else {
      out.push({ index: i, text: words[i], dir: 'rtl' });
      i++;
    }
  }
  return out;
}
