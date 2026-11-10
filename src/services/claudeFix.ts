/**
 * "Smart correction": Claude (on the viewer's own Claude account, through the page's `sample`
 * capability) rewrites each segment of the on-device transcript into what was most likely said:
 * correct Hebrew spelling, words that fit the context, and punctuation. Timings are preserved by
 * re-aligning each corrected segment onto the original words.
 */
import type { DictionaryEntry, Transcript } from '../core/types';
import { replaceWordsText, sentences } from '../core/transcript';

type SampleOptions = { modelTier?: 'quick' | 'default' | 'complex'; signal?: AbortSignal; cache?: boolean };
type SampleFn = { json<T>(input: string, opts?: SampleOptions): Promise<T> };
type ClaudeWin = Window & { claude?: { use(name: string): Promise<unknown> } };

let samplePromise: Promise<SampleFn | null> | null = null;
export function getSample(): Promise<SampleFn | null> {
  const w = window as ClaudeWin;
  if (!w.claude?.use) return Promise.resolve(null);
  samplePromise ??= w.claude.use('sample').then((s) => (s as SampleFn) ?? null).catch(() => null);
  return samplePromise;
}
void getSample();

export class FixError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const MAX_SEGMENTS_PER_CALL = 160;

function buildPrompt(segments: string[], terms: string[]): string {
  return [
    'You are correcting an automatic Hebrew speech-recognition transcript of a short video.',
    'The recognizer is weak: it often writes words that SOUND similar to what was said but are wrong, misspells Hebrew,',
    'splits or merges words, and adds no punctuation.',
    '',
    'For each numbered segment, write what the speaker most likely actually said:',
    '- correct modern Hebrew spelling (ktiv male, no niqqud);',
    '- replace sound-alike mistakes with the words that fit the context of the whole video;',
    '- add natural punctuation (. , ? ! and quotes where needed);',
    "- keep the speaker's own wording, slang and word order; do NOT summarize, translate, shorten or add content;",
    '- brand names / English words: write them as they would normally be written in a Hebrew post.',
    'If a segment is unintelligible, keep it as is.',
    terms.length ? `Names and terms that appear in this person's videos: ${terms.join(', ')}` : '',
    '',
    `Reply with ONLY JSON: {"segments": [ ... ]} containing exactly ${segments.length} strings, one per input segment, same order.`,
    '',
    'Segments:',
    ...segments.map((s, i) => `${i + 1}. ${s}`),
  ]
    .filter((x) => x !== '')
    .join('\n');
}

export async function correctTranscript(
  t: Transcript,
  dictionary: DictionaryEntry[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Transcript> {
  const sample = await getSample();
  if (!sample) throw new FixError('התיקון החכם זמין רק כשהאפליקציה פתוחה בתוך Claude.', 'unavailable');
  const segs = sentences(t);
  if (!segs.length) return t;
  const terms = [...new Set(dictionary.map((d) => d.to).filter(Boolean))].slice(0, 80);
  let out = t;
  const batches = Math.ceil(segs.length / MAX_SEGMENTS_PER_CALL);
  for (let b = 0; b < batches; b++) {
    const part = segs.slice(b * MAX_SEGMENTS_PER_CALL, (b + 1) * MAX_SEGMENTS_PER_CALL);
    onProgress?.(b, batches);
    let res: { segments?: unknown };
    try {
      res = await sample.json<{ segments?: unknown }>(buildPrompt(part.map((s) => s.words.map((w) => w.text).join(' ')), terms), {
        modelTier: 'default',
        signal,
      });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'not_granted') throw new FixError('צריך לאשר ל-Claude לעזור באפליקציה כדי להשתמש בתיקון החכם.', code);
      if (code === 'rate_limited') throw new FixError('הגעת למגבלת השימוש ב-Claude כרגע. נסי שוב מאוחר יותר.', code);
      if (code === 'cancelled') throw new FixError('התיקון בוטל.', code);
      throw new FixError('התיקון החכם נכשל. אפשר לנסות שוב מכפתור "תיקון חכם" בתמלול.', code);
    }
    const fixed = Array.isArray(res?.segments) ? res.segments.map((x) => String(x ?? '')) : null;
    if (!fixed || fixed.length !== part.length) throw new FixError('Claude החזיר תשובה לא שלמה. נסי שוב.', 'shape');
    part.forEach((s, i) => {
      const text = fixed[i].trim();
      if (!text) return;
      const ids = s.words.map((w) => w.id);
      const current = out.words.filter((w) => ids.includes(w.id)).map((w) => w.text).join(' ');
      if (text !== current) out = replaceWordsText(out, ids, text);
    });
  }
  onProgress?.(batches, batches);
  return { ...out, polished: true };
}
