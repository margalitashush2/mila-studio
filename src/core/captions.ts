import type { CaptionStyle, Cut, Transcript, TranscriptMode, Word } from './types';
import { stripPunctuation } from './text';

export interface CueWord {
  id: string;
  text: string;
  start: number;
  end: number;
  emphasis: boolean;
}

export interface Cue {
  id: string;
  start: number;
  end: number;
  lines: CueWord[][];
}

const SENTENCE_END = /[.?!…:]["'״׳)\]]*$/;
const SOFT_BREAK = /[,;–—-]["'״׳)\]]*$/;
const PAUSE_BREAK = 0.7;
const MAX_CUE_DURATION = 6;
const MIN_CUE_DURATION = 0.6;

/** Words that should appear in captions / clean views given the mode and cuts. */
export function visibleWords(transcript: Transcript, mode: TranscriptMode, cuts: Cut[]): Word[] {
  return transcript.words.filter((w) => {
    if (w.kind !== 'word') return false;
    if (!w.text.trim()) return false;
    if (mode === 'clean' && w.cleanHidden) return false;
    const mid = (w.start + w.end) / 2;
    return !cuts.some((c) => mid >= c.start && mid < c.end);
  });
}

function displayText(w: Word, mode: TranscriptMode): string {
  return mode === 'verbatim' ? stripPunctuation(w.text) || w.text : w.text;
}

/** Split words into phrases on sentence ends, long pauses and speaker changes. */
export function splitPhrases(words: Word[], mode: TranscriptMode): Word[][] {
  const phrases: Word[][] = [];
  let cur: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = cur[cur.length - 1];
    if (prev) {
      const pause = w.start - prev.end;
      const speakerChange = !!w.speakerId && !!prev.speakerId && w.speakerId !== prev.speakerId;
      const sentenceEnd = mode !== 'verbatim' && SENTENCE_END.test(prev.text);
      if (pause > PAUSE_BREAK || speakerChange || sentenceEnd) {
        phrases.push(cur);
        cur = [];
      }
    }
    cur.push(w);
  }
  if (cur.length) phrases.push(cur);
  return phrases;
}

function lineLength(words: { text: string }[]): number {
  return words.reduce((n, w, i) => n + w.text.length + (i ? 1 : 0), 0);
}

function toCueWord(w: Word, mode: TranscriptMode): CueWord {
  return { id: w.id, text: displayText(w, mode), start: w.start, end: w.end, emphasis: !!w.emphasis };
}

/** Greedy line packing that prefers breaking after commas once a line is reasonably full. */
function packLines(words: CueWord[], maxChars: number): CueWord[][] {
  const lines: CueWord[][] = [];
  let line: CueWord[] = [];
  for (const w of words) {
    const candidate = [...line, w];
    if (line.length && lineLength(candidate) > maxChars) {
      lines.push(line);
      line = [w];
    } else {
      line = candidate;
      if (SOFT_BREAK.test(w.text) && lineLength(line) >= maxChars * 0.6) {
        lines.push(line);
        line = [];
      }
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Build caption cues from the transcript. Pure & deterministic: re-run after every edit. */
export function buildCues(
  transcript: Transcript | null,
  style: Pick<CaptionStyle, 'display' | 'maxCharsPerLine' | 'maxLines' | 'chunkWords'>,
  mode: TranscriptMode,
  cuts: Cut[],
): Cue[] {
  if (!transcript) return [];
  const words = visibleWords(transcript, mode, cuts);
  const phrases = splitPhrases(words, mode);
  const groups: CueWord[][][] = []; // cue -> lines -> words

  for (const phrase of phrases) {
    const cw = phrase.map((w) => toCueWord(w, mode));
    if (style.display === 'single') {
      cw.forEach((w) => groups.push([[w]]));
      continue;
    }
    if (style.display === 'chunks') {
      const n = Math.max(1, style.chunkWords);
      for (let i = 0; i < cw.length; ) {
        let chunk: CueWord[] = [];
        while (i < cw.length && chunk.length < n) {
          const next = [...chunk, cw[i]];
          if (chunk.length && lineLength(next) > style.maxCharsPerLine) break;
          chunk = next;
          i++;
        }
        groups.push([chunk]);
      }
      continue;
    }
    // lines / karaoke
    const lines = packLines(cw, Math.max(8, style.maxCharsPerLine));
    let cue: CueWord[][] = [];
    for (const line of lines) {
      const cueStart = cue[0]?.[0]?.start ?? line[0].start;
      const tooLong = line[line.length - 1].end - cueStart > MAX_CUE_DURATION;
      if (cue.length >= style.maxLines || (cue.length && tooLong)) {
        groups.push(cue);
        cue = [];
      }
      cue.push(line);
    }
    if (cue.length) groups.push(cue);
  }

  // Balance two-line cues so the second line isn't a lonely word.
  for (const g of groups) {
    if (g.length !== 2) continue;
    const flat = g.flat();
    let best = g[0].length;
    let bestScore = Infinity;
    for (let k = 1; k < flat.length; k++) {
      const a = lineLength(flat.slice(0, k));
      const b = lineLength(flat.slice(k));
      if (a > style.maxCharsPerLine || b > style.maxCharsPerLine) continue;
      const score = Math.max(a, b) - (SOFT_BREAK.test(flat[k - 1].text) ? 3 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    g.splice(0, 2, flat.slice(0, best), flat.slice(best));
  }

  const cues: Cue[] = groups
    .filter((g) => g.length && g[0].length)
    .map((lines) => {
      const flat = lines.flat();
      return { id: flat[0].id, start: flat[0].start, end: flat[flat.length - 1].end, lines };
    });

  // Smooth timing: extend short cues / close small gaps so captions don't flicker.
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const next = cues[i + 1];
    const limit = next ? next.start : c.end + 1;
    let end = c.end;
    if (next && next.start - c.end < 0.35) end = next.start;
    else end = Math.min(limit, c.end + 0.25);
    if (end - c.start < MIN_CUE_DURATION) end = Math.min(limit, c.start + MIN_CUE_DURATION);
    c.end = Math.max(end, c.end);
  }
  return cues;
}

/** Binary search for the cue visible at time t. */
export function cueAt(cues: Cue[], t: number): Cue | null {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c;
  }
  return null;
}

/** The "currently spoken" word inside a cue (sticky across small gaps between words). */
export function activeWordId(cue: Cue, t: number): string | null {
  const flat = cue.lines.flat();
  let active: string | null = null;
  for (const w of flat) {
    if (t >= w.start) active = w.id;
    else break;
  }
  return active;
}

export function cueText(cue: Cue): string {
  return cue.lines.map((l) => l.map((w) => w.text).join(' ')).join('\n');
}
