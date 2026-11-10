import type { Cut, Speaker, Transcript, Word } from './types';
import { splitPhrases } from './captions';

const SPEAKER_COLORS = ['#7C5CFF', '#3DF2A0', '#FF5DA2', '#FFB020', '#4CC9F0', '#F72585', '#B5E48C', '#FF6B6B'];

/** Raw ElevenLabs Scribe response (snake_case wire format). */
export interface ScribeResponse {
  language_code: string;
  language_probability: number;
  text: string;
  words: {
    text: string;
    start?: number;
    end?: number;
    type: 'word' | 'spacing' | 'audio_event';
    speaker_id?: string;
    logprob?: number;
  }[];
  transcription_id?: string;
}

export function parseScribe(res: ScribeResponse, model: string): Transcript {
  const words: Word[] = [];
  const speakerIds: string[] = [];
  let i = 0;
  for (const w of res.words ?? []) {
    if (w.type === 'spacing') continue;
    const text = (w.text ?? '').trim();
    if (!text) continue;
    if (w.start == null || w.end == null) continue;
    if (w.speaker_id && !speakerIds.includes(w.speaker_id)) speakerIds.push(w.speaker_id);
    words.push({
      id: `w${i++}`,
      text,
      originalText: text,
      start: w.start,
      end: Math.max(w.end, w.start + 0.01),
      kind: w.type === 'audio_event' ? 'event' : 'word',
      speakerId: w.speaker_id,
      logprob: w.logprob,
    });
  }
  const speakers: Speaker[] = speakerIds.map((id, idx) => ({
    id,
    name: `דובר ${idx + 1}`,
    color: SPEAKER_COLORS[idx % SPEAKER_COLORS.length],
  }));
  return {
    provider: 'elevenlabs-scribe',
    model,
    languageCode: res.language_code,
    languageProbability: res.language_probability,
    words,
    speakers,
    createdAt: Date.now(),
    revision: 0,
  };
}

export function updateWord(t: Transcript, wordId: string, patch: Partial<Pick<Word, 'text' | 'emphasis' | 'cleanHidden'>>): Transcript {
  return {
    ...t,
    revision: t.revision + 1,
    words: t.words.map((w) => (w.id === wordId ? { ...w, ...patch } : w)),
  };
}

export function renameSpeaker(t: Transcript, speakerId: string, name: string): Transcript {
  return { ...t, revision: t.revision + 1, speakers: t.speakers.map((s) => (s.id === speakerId ? { ...s, name } : s)) };
}

export interface Sentence {
  id: string;
  speakerId?: string;
  start: number;
  end: number;
  words: Word[];
}

/** Sentences used by the transcript editor ("organized" grouping, includes all spoken words). */
export function sentences(t: Transcript): Sentence[] {
  const spoken = t.words.filter((w) => w.kind === 'word');
  return splitPhrases(spoken, 'organized').map((ws) => ({
    id: ws[0].id,
    speakerId: ws[0].speakerId,
    start: ws[0].start,
    end: ws[ws.length - 1].end,
    words: ws,
  }));
}

let cutCounter = 0;
export function newCutId(): string {
  cutCounter = (cutCounter + 1) % 100000;
  return `cut_${Date.now().toString(36)}_${cutCounter}`;
}

/**
 * A cut that removes the given words from the video. The cut extends into the silence
 * around the words (up to `pad`) without touching neighbouring words.
 */
export function cutForWords(all: Word[], selected: Word[], reason: Cut['reason'], pad = 0.08): Cut | null {
  if (!selected.length) return null;
  const sorted = [...selected].sort((a, b) => a.start - b.start);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spoken = all.filter((w) => w.kind === 'word').sort((a, b) => a.start - b.start);
  const prev = [...spoken].reverse().find((w) => w.end <= first.start + 0.001 && w.id !== first.id);
  const next = spoken.find((w) => w.start >= last.end - 0.001 && w.id !== last.id);
  const start = Math.max(prev ? prev.end : 0, first.start - pad);
  const end = next ? Math.min(next.start, last.end + pad) : last.end + pad;
  return { id: newCutId(), start, end, reason };
}

export function wordAtTime(t: Transcript, time: number): Word | null {
  let best: Word | null = null;
  for (const w of t.words) {
    if (w.kind !== 'word') continue;
    if (w.start <= time) best = w;
    else break;
  }
  return best && time <= best.end + 0.5 ? best : null;
}

export function plainText(t: Transcript, opts: { speakers?: boolean; mode?: 'organized' | 'clean' } = {}): string {
  const sp = new Map(t.speakers.map((s) => [s.id, s.name]));
  const multi = t.speakers.length > 1 && opts.speakers !== false;
  const out: string[] = [];
  let lastSpeaker: string | undefined;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(para.join(' '));
    para = [];
  };
  for (const s of sentences(t)) {
    const words = s.words.filter((w) => !(opts.mode === 'clean' && w.cleanHidden));
    if (!words.length) continue;
    if (multi && s.speakerId !== lastSpeaker) {
      flush();
      out.push(`${sp.get(s.speakerId ?? '') ?? 'דובר'}:`);
      lastSpeaker = s.speakerId;
    }
    para.push(words.map((w) => w.text).join(' '));
  }
  flush();
  return out.join('\n');
}

/**
 * Replace the text of a run of words (a sentence) with new text typed by the user or a corrector.
 * Same word count: each word keeps its own timing. Different count: the new words are spread over
 * the original time span in proportion to their length, so captions stay in sync.
 */
export function replaceWordsText(t: Transcript, wordIds: string[], newText: string): Transcript {
  const ids = new Set(wordIds);
  const olds = t.words.filter((w) => ids.has(w.id));
  if (!olds.length) return t;
  const tokens = newText.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const firstIdx = t.words.findIndex((w) => w.id === olds[0].id);
  let fresh: Word[];
  if (tokens.length === olds.length) {
    fresh = olds.map((w, i) => (w.text === tokens[i] ? w : { ...w, text: tokens[i] }));
  } else if (!tokens.length) {
    fresh = [];
  } else {
    const start = olds[0].start;
    const end = olds[olds.length - 1].end;
    const weights = tokens.map((x) => Math.max(1, x.replace(/[^\p{L}\p{N}]/gu, '').length) + 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = start;
    const base = olds[0];
    fresh = tokens.map((text, i) => {
      const dur = ((end - start) * weights[i]) / total;
      const w: Word = {
        id: `${base.id}_${t.revision + 1}_${i}`,
        text,
        originalText: olds[Math.min(olds.length - 1, Math.floor((i * olds.length) / tokens.length))].originalText,
        start: acc,
        end: acc + dur,
        kind: 'word',
        speakerId: base.speakerId,
      };
      acc += dur;
      return w;
    });
  }
  const rest = t.words.filter((w) => !ids.has(w.id));
  const before = rest.filter((w) => t.words.indexOf(w) < firstIdx);
  const after = rest.filter((w) => t.words.indexOf(w) > firstIdx);
  return { ...t, revision: t.revision + 1, words: [...before, ...fresh, ...after] };
}
