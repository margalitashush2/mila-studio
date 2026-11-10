/**
 * Accurate Hebrew transcription in the cloud with ElevenLabs Scribe v2 (word timestamps,
 * punctuation, speaker separation). The API key belongs to the user and stays on the phone.
 * Only the speech audio (16 kHz mono WAV, ~2 MB per minute) is sent.
 */
import { parseScribe, type ScribeResponse } from '../core/transcript';
import type { Transcript } from '../core/types';

const ENDPOINT = 'https://api.elevenlabs.io/v1/speech-to-text';
export const SCRIBE_MODEL = 'scribe_v2';

export function encodeWav(samples: Float32Array, rate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function errorMessage(status: number, body: string): string {
  let detail = '';
  try {
    const j = JSON.parse(body);
    detail = typeof j.detail === 'string' ? j.detail : (j.detail?.message ?? j.message ?? '');
  } catch {
    detail = body.slice(0, 200);
  }
  if (status === 401) return 'המפתח של ElevenLabs שגוי או לא פעיל. בדקי שהעתקת אותו במלואו (מסך ההגדרות).';
  if (status === 403) return 'למפתח של ElevenLabs אין הרשאה לתמלול. צרי מפתח חדש עם הרשאת Speech to Text.';
  if (status === 402 || /quota|credit|limit/i.test(detail)) return 'נגמרה מכסת התמלול בחשבון ElevenLabs לחודש הזה.';
  if (status === 429) return 'יותר מדי בקשות בבת אחת. נסי שוב בעוד דקה.';
  return `התמלול נכשל (${status})${detail ? ': ' + detail : ''}`;
}

export function transcribeCloud(
  audio16k: Float32Array,
  apiKey: string,
  keyterms: string[],
  onUpload?: (fraction: number) => void,
): Promise<Transcript> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('model_id', SCRIBE_MODEL);
    form.append('file', encodeWav(audio16k), 'audio.wav');
    form.append('language_code', 'heb');
    form.append('timestamps_granularity', 'word');
    form.append('diarize', 'true');
    form.append('tag_audio_events', 'false');
    for (const k of keyterms) form.append('keyterms', k);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', ENDPOINT);
    xhr.setRequestHeader('xi-api-key', apiKey.trim());
    xhr.upload.onprogress = (e) => e.lengthComputable && onUpload?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const t = parseScribe(JSON.parse(xhr.responseText) as ScribeResponse, SCRIBE_MODEL);
          if (!t.words.length) reject(new Error('לא זוהה דיבור בסרטון.'));
          else resolve(t);
        } catch {
          reject(new Error('התקבלה תשובה לא תקינה משירות התמלול.'));
        }
      } else reject(new Error(errorMessage(xhr.status, xhr.responseText)));
    };
    xhr.onerror = () => reject(new Error('אין חיבור לשירות התמלול. בדקי את האינטרנט ונסי שוב.'));
    xhr.send(form);
  });
}
