/**
 * Pulls the AAC audio out of an MP4/MOV container (iPhone videos) and rewraps it as an ADTS
 * stream, which every browser's decodeAudioData understands, unlike QuickTime .mov files.
 */
import { createFile, MP4BoxBuffer } from 'mp4box';

const FREQS = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

export function adtsHeader(frameLen: number, objectType: number, freqIndex: number, channels: number): Uint8Array {
  const len = frameLen + 7;
  const h = new Uint8Array(7);
  h[0] = 0xff;
  h[1] = 0xf1; // MPEG-4, no CRC
  h[2] = (((objectType - 1) & 3) << 6) | ((freqIndex & 15) << 2) | ((channels >> 2) & 1);
  h[3] = ((channels & 3) << 6) | ((len >> 11) & 3);
  h[4] = (len >> 3) & 0xff;
  h[5] = ((len & 7) << 5) | 0x1f;
  h[6] = 0xfc;
  return h;
}

export function aacToAdts(buf: ArrayBuffer): Uint8Array | null {
  const file = createFile();
  type T = { id: number; codec: string; nb_samples: number; audio?: { sample_rate: number; channel_count: number } };
  const found: { track: T | null } = { track: null };
  const frames: Uint8Array[] = [];
  file.onReady = (info) => {
    const t = info.audioTracks?.[0];
    if (!t || !t.codec.startsWith('mp4a')) return;
    found.track = t as T;
    file.setExtractionOptions(t.id, null, { nbSamples: t.nb_samples });
    file.start();
  };
  file.onSamples = (_id, _user, samples) => {
    for (const s of samples) if (s.data) frames.push(new Uint8Array(s.data));
  };
  try {
    file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buf, 0), true);
    file.flush();
  } catch {
    return null;
  }
  const t = found.track;
  if (!t || !frames.length || !t.audio) return null;
  const objectType = Number(t.codec.split('.')[2]) === 5 ? 2 : Number(t.codec.split('.')[2]) || 2;
  let freqIndex = FREQS.indexOf(t.audio.sample_rate);
  if (freqIndex < 0) freqIndex = 4;
  const channels = Math.min(7, Math.max(1, t.audio.channel_count));
  let size = 0;
  for (const f of frames) size += f.length + 7;
  const out = new Uint8Array(size);
  let o = 0;
  for (const f of frames) {
    out.set(adtsHeader(f.length, objectType, freqIndex, channels), o);
    out.set(f, o + 7);
    o += f.length + 7;
  }
  return out;
}
