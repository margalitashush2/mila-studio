/**
 * Video export on the device: plays the kept segments through a hidden <video>, draws each
 * frame (video + logo + captions) to a canvas with the same renderer as the preview, and records
 * canvas + audio with MediaRecorder. Export runs in real time (a 1-minute video takes ~1 minute).
 */
import type { Cue } from '../core/captions';
import { cueAt } from '../core/captions';
import type { Range } from '../core/timeline';
import { totalDuration } from '../core/timeline';
import type { CaptionStyle, FrameFit, LogoPlacement } from '../core/types';
import { renderFrame } from './renderer';

export interface ExportJob {
  videoUrl: string;
  segments: Range[];
  width: number;
  height: number;
  fit: FrameFit;
  background: string;
  cues: Cue[] | null;
  style: CaptionStyle;
  fontFamily: string;
  logo: { image: HTMLImageElement; placement: LogoPlacement } | null;
  audioOnly?: boolean;
  fps?: number;
  onProgress: (fraction: number) => void;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
}

const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const VIDEO_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];
const AUDIO_TYPES = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm'];

function pickType(list: string[]): string {
  if (typeof MediaRecorder === 'undefined') throw new Error('הדפדפן לא תומך בייצוא וידאו.');
  return list.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export function exportSupported(): boolean {
  try {
    return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && !!pickType(VIDEO_TYPES);
  } catch {
    return false;
  }
}

export class Exporter {
  private video: HTMLVideoElement;
  private audioCtx: AudioContext;
  private cancelled = false;
  private wakeLock: { release(): Promise<void> } | null = null;

  /** Must be constructed synchronously inside a tap handler (unlocks audio + playback on iOS). */
  constructor() {
    const v = document.createElement('video');
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('playsinline', '');
    Object.assign(v.style, { position: 'fixed', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
    document.body.appendChild(v);
    this.video = v;
    const AC: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioCtx = new AC();
    void this.audioCtx.resume();
    // Unlock playback within the gesture (a tiny silent WAV keeps the element "user-activated").
    v.muted = true;
    v.src = SILENT_WAV;
    void v.play().then(() => v.pause()).catch(() => undefined);
  }

  cancel() {
    this.cancelled = true;
  }

  private async seek(t: number) {
    const v = this.video;
    if (Math.abs(v.currentTime - t) < 0.01) return;
    await new Promise<void>((res) => {
      const done = () => {
        v.removeEventListener('seeked', done);
        res();
      };
      v.addEventListener('seeked', done);
      v.currentTime = t;
    });
  }

  async run(job: ExportJob): Promise<ExportResult> {
    const v = this.video;
    v.src = job.videoUrl;
    v.load();
    try {
      this.wakeLock = (await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')) ?? null;
    } catch {
      /* optional */
    }
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error('לא ניתן לטעון את הסרטון לייצוא.'));
    });

    const source = this.audioCtx.createMediaElementSource(v);
    const dest = this.audioCtx.createMediaStreamDestination();
    source.connect(dest);
    v.muted = false;
    v.volume = 1;

    const canvas = document.createElement('canvas');
    canvas.width = job.width;
    canvas.height = job.height;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    let stream: MediaStream;
    let mimeType: string;
    if (job.audioOnly) {
      stream = new MediaStream(dest.stream.getAudioTracks());
      mimeType = pickType(AUDIO_TYPES);
    } else {
      const canvasStream = canvas.captureStream(job.fps ?? 30);
      stream = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      mimeType = pickType(VIDEO_TYPES);
    }
    const px = job.width * job.height;
    const recorder = new MediaRecorder(stream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: job.audioOnly ? undefined : Math.round(Math.min(40e6, Math.max(4e6, px * 30 * 0.17))),
      audioBitsPerSecond: 192000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));

    const draw = () => {
      if (job.audioOnly) return;
      const t = v.currentTime;
      renderFrame(ctx, job.width, job.height, {
        video: { image: v, width: v.videoWidth, height: v.videoHeight },
        fit: job.fit,
        background: job.background,
        cue: job.cues ? cueAt(job.cues, t) : null,
        time: t,
        style: job.style,
        fontFamily: job.fontFamily,
        logo: job.logo
          ? { image: job.logo.image, width: job.logo.image.naturalWidth, height: job.logo.image.naturalHeight, placement: job.logo.placement }
          : null,
      });
    };

    const total = Math.max(0.001, totalDuration(job.segments));
    let done = 0;
    let started = false;
    const canPause = typeof recorder.pause === 'function';

    for (const seg of job.segments) {
      if (this.cancelled) break;
      await this.seek(seg.start);
      draw();
      if (!started) {
        recorder.start(1000);
        started = true;
      } else if (canPause && recorder.state === 'paused') recorder.resume();

      await new Promise<void>((resolve, reject) => {
        let raf = 0;
        const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.bind(v);
        const tick = () => {
          if (this.cancelled) return finish();
          draw();
          job.onProgress(Math.min(1, (done + Math.max(0, v.currentTime - seg.start)) / total));
          if (v.currentTime >= seg.end - 0.01 || v.ended) return finish();
          raf = rvfc ? rvfc(tick) : requestAnimationFrame(tick);
        };
        const finish = () => {
          v.pause();
          cancelAnimationFrame(raf);
          v.removeEventListener('timeupdate', onTime);
          v.removeEventListener('ended', finish);
          resolve();
        };
        // timeupdate is a safety net when frame callbacks are throttled
        const onTime = () => {
          if (v.currentTime >= seg.end - 0.01) finish();
        };
        v.addEventListener('timeupdate', onTime);
        v.addEventListener('ended', finish);
        v.play().then(() => {
          raf = rvfc ? rvfc(tick) : requestAnimationFrame(tick);
        }, () => reject(new Error('הדפדפן חסם את הניגון. השאירי את המסך פתוח ונסי שוב.')));
      });
      done += seg.end - seg.start;
      if (canPause && recorder.state === 'recording' && seg !== job.segments[job.segments.length - 1]) recorder.pause();
    }

    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    this.cleanup();
    if (this.cancelled) throw new Error('הייצוא בוטל.');
    job.onProgress(1);
    const type = (mimeType || chunks[0]?.type || 'video/mp4').split(';')[0];
    return { blob: new Blob(chunks, { type }), mimeType: type };
  }

  cleanup() {
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
    } catch {
      /* ignore */
    }
    void this.audioCtx.close().catch(() => undefined);
    void this.wakeLock?.release().catch(() => undefined);
  }
}
