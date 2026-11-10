/** Text helpers with Hebrew / RTL awareness. */

const PUNCT = /[.,?!…:;"'״׳()\[\]–—-]/g;

export function stripPunctuation(s: string): string {
  return s.replace(PUNCT, '').trim();
}

/** Normalized form used for matching (no punctuation, no niqqud, lowercase latin). */
export function normalizeWord(s: string): string {
  return stripPunctuation(s)
    .replace(/[֑-ׇ]/g, '') // niqqud & cantillation
    .toLowerCase();
}

/** Splits a word into leading punctuation, core, trailing punctuation. */
export function splitAffixes(s: string): { pre: string; core: string; post: string } {
  const m = s.match(/^([("'״׳\[]*)(.*?)([.,?!…:;"'״׳)\]]*)$/s);
  if (!m) return { pre: '', core: s, post: '' };
  return { pre: m[1], core: m[2], post: m[3] };
}

const RLM = '‏';
const HEBREW = /[֐-׿]/;

export function hasHebrew(s: string): boolean {
  return HEBREW.test(s);
}

/**
 * Prepare a caption line for players that don't apply RTL paragraph direction (SRT viewers).
 * Wrapping with RLM marks keeps trailing punctuation and numbers at the correct side
 * without changing the logical text order (no visual reversal hacks).
 */
export function rtlSafeLine(line: string): string {
  if (!hasHebrew(line)) return line;
  return RLM + line + RLM;
}

export function formatTime(sec: number, withMs = false): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const base = `${h ? h + ':' : ''}${h ? String(m).padStart(2, '0') : m}:${String(ss).padStart(2, '0')}`;
  return withMs ? `${base}.${String(Math.floor((s % 1) * 10))}` : base;
}
