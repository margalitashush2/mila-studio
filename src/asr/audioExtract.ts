/**
 * Getting 16 kHz mono speech audio out of a video, robustly:
 *  1. fast path: decodeAudioData on the file (works for most MP4s),
 *  2. fallback: play the video silently in real time through Web Audio and record the samples.
 *     This works for any video the phone can play (e.g. iPhone MOV/HEVC files inside in-app browsers).
 *
 * `AudioCapture` must be created synchronously inside a tap, so iOS lets it play sound later.
 */
import { aacToAdts } from './aac';

const RATE = 16000;

type AC = typeof AudioContext;
const getAC = (): AC => window.AudioContext ?? (window as unknown as { webkitAudioContext: AC }).webkitAudioContext;

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export class AudioCapture {
  readonly ctx: AudioContext;
  readonly video: HTMLVideoElement;
  private cancelled = false;

  constructor() {
    const Ctor = getAC();
    this.ctx = new Ctor();
    void this.ctx.resume();
    const v = document.createElement('video');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    Object.assign(v.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
    document.body.appendChild(v);
    // Unmuted play of a silent clip inside the tap: iOS then allows playback with sound later.
    v.muted = false;
    v.src = SILENT_WAV;
    void v.play().then(() => v.pause()).catch(() => undefined);
    this.video = v;
  }

  cancel() {
    this.cancelled = true;
  }

  /** Real-time capture. onProgress gets 0..1. */
  async record(url: string, onProgress: (f: number) => void): Promise<Float32Array> {
    const v = this.video;
    const ctx = this.ctx;
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    v.src = url;
    v.load();
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error(`הסרטון לא נטען (${v.error?.code ?? '?'} ${v.error?.message ?? ''})`));
    });
    const duration = v.duration;
    const source = ctx.createMediaElementSource(v);
    const proc = ctx.createScriptProcessor(4096, 2, 1);
    const chunks: Float32Array[] = [];
    let frames = 0;
    proc.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      out.fill(0); // stay silent
      if (v.paused || v.ended) return;
      const inp = e.inputBuffer;
      const a = inp.getChannelData(0);
      const b = inp.numberOfChannels > 1 ? inp.getChannelData(1) : a;
      const mono = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) mono[i] = (a[i] + b[i]) * 0.5;
      chunks.push(mono);
      frames += mono.length;
    };
    source.connect(proc);
    proc.connect(ctx.destination);
    v.muted = false;
    v.volume = 1;
    v.currentTime = 0;
    try {
      await v.play();
    } catch {
      throw new Error('הדפדפן לא איפשר לנגן את הסרטון כדי לקרוא את השמע. לחצי שוב על "תמלול".');
    }
    await new Promise<void>((res, rej) => {
      let last = -1;
      let stalledSince = Date.now();
      const tick = () => {
        if (this.cancelled || v.ended || v.currentTime >= duration - 0.05) return res();
        if (v.currentTime !== last) {
          last = v.currentTime;
          stalledSince = Date.now();
        } else if (Date.now() - stalledSince > 4000) {
          void v.play().catch(() => undefined); // nudge a stalled player
          if (Date.now() - stalledSince > 20000) return rej(new Error('הניגון נתקע'));
        }
        onProgress(Math.min(1, v.currentTime / Math.max(0.1, duration)));
        setTimeout(tick, 250);
      };
      v.onended = () => res();
      tick();
    });
    v.pause();
    source.disconnect();
    proc.disconnect();
    if (this.cancelled) throw new Error('התמלול בוטל.');
    if (frames < ctx.sampleRate * 0.2) throw new Error('לא נקלט שמע מהסרטון. ייתכן שאין בו שמע.');
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let o = 0;
    for (const c of chunks) {
      data.set(c, o);
      o += c.length;
    }
    return resample(buf);
  }

  close() {
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
    } catch {
      /* ignore */
    }
    void this.ctx.close().catch(() => undefined);
  }
}

async function resample(buf: AudioBuffer): Promise<Float32Array> {
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * RATE)), RATE);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

/** For tests: set to true to skip the file-decoding paths. */
export const audioDebug = { forceRealtime: false };

function offline(): BaseAudioContext {
  return new OfflineAudioContext(1, 1, 44100);
}

/**
 * Decode a video file's audio to 16 kHz mono without playing it:
 * 1) the browser's own decoder, 2) AAC pulled out of the MP4/MOV container and rewrapped as ADTS.
 */
export async function decodeFileTo16k(file: Blob): Promise<Float32Array> {
  if (audioDebug.forceRealtime) throw new Error('forced');
  const errors: string[] = [];
  const Ctor = getAC();
  const ctxs: [string, () => BaseAudioContext][] = [
    ['offline', () => offline()],
    ['live', () => new Ctor()],
  ];
  // 1) the browser's own decoder on the whole file
  for (const [name, make] of ctxs) {
    const ctx = make();
    try {
      return await resample(await ctx.decodeAudioData(await file.arrayBuffer()));
    } catch (e) {
      errors.push(`${name}: ${(e as Error)?.message ?? e}`);
    } finally {
      if (ctx instanceof AudioContext) void ctx.close().catch(() => undefined);
    }
  }
  // 2) AAC pulled out of the MP4/MOV container, rewrapped as ADTS
  let adts: Uint8Array | null = null;
  try {
    adts = aacToAdts(await file.arrayBuffer());
    if (!adts) errors.push('adts: no AAC track');
  } catch (e) {
    errors.push(`adts: ${(e as Error)?.message ?? e}`);
  }
  if (adts) {
    for (const [name, make] of ctxs) {
      const ctx = make();
      try {
        return await resample(await ctx.decodeAudioData(adts.slice().buffer as ArrayBuffer));
      } catch (e) {
        errors.push(`adts-${name}: ${(e as Error)?.message ?? e}`);
      } finally {
        if (ctx instanceof AudioContext) void ctx.close().catch(() => undefined);
      }
    }
  }
  throw new Error(errors.join(' / '));
}

export function toInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(-1, Math.min(1, f[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

export function fromInt16(i16: Int16Array): Float32Array {
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 0x8000;
  return out;
}

/** Last resort: play the video silently in real time and record its audio. */
export async function extractSpeech16k(
  _file: Blob | null,
  url: string,
  capture: AudioCapture,
  onProgress: (f: number | undefined) => void,
): Promise<Float32Array> {
  try {
    return await capture.record(url, onProgress);
  } catch (e) {
    throw new Error(`לא הצלחנו לקרוא את השמע מהסרטון. ${(e as Error)?.message ?? e}`);
  }
}
