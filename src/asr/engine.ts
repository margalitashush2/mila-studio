/**
 * Main-thread side of on-device transcription:
 *  1. downloads the model once (in pieces) and keeps it on the phone (IndexedDB),
 *  2. decodes the video's audio to 16 kHz mono,
 *  3. splits it into <=28 s windows at quiet points and runs the worker.
 */
import { del, get, set, createStore } from 'idb-keyval';
import type { Transcript, Word } from '../core/types';
import { z85Decode } from './z85';

const modelStore = createStore('mila-model', 'files');

export interface ModelManifest {
  version: string;
  /** shown in settings */
  label: string;
  /** source model id (for the transcript record) */
  model: string;
  dtype: Record<string, string>;
  /** whether the model writes punctuation */
  punctuation: boolean;
  /** false: never try WebGPU (CPU-only runtime build) */
  gpu?: boolean;
  /** model file path -> ordered list of part URLs */
  files: Record<string, string[]>;
  /** onnxruntime wasm binary parts */
  wasm: string[];
  totalBytes: number;
}

export type EngineStage =
  | { stage: 'download'; loaded: number; total: number }
  | { stage: 'loading' }
  | { stage: 'audio'; progress?: number }
  | { stage: 'transcribe'; done: number; total: number; text?: string };

let worker: Worker | null = null;
let loadedDevice: string | null = null;
let manifestPromise: Promise<ModelManifest> | null = null;

export type EngineChoice = 'quality' | 'light';
const MANIFEST_FILE: Record<EngineChoice, string> = { quality: 'model-manifest.json', light: 'model-manifest-light.json' };
let choice: EngineChoice = 'quality';

/** Switch between the high-quality and the light model (takes effect on the next transcription). */
export function setEngineChoice(c: EngineChoice) {
  if (c === choice) return;
  choice = c;
  manifestPromise = null;
  worker?.terminate();
  worker = null;
  loadedDevice = null;
}

export function getManifest(): Promise<ModelManifest> {
  manifestPromise ??= fetch(new URL(MANIFEST_FILE[choice], document.baseURI).toString()).then((res) => {
    if (!res.ok) throw new Error('קובץ מנוע התמלול חסר.');
    return res.json();
  });
  manifestPromise.catch(() => (manifestPromise = null));
  return manifestPromise;
}

export async function modelIsDownloaded(): Promise<boolean> {
  try {
    const m = await getManifest();
    return (await get<string>('version-ab', modelStore)) === m.version || (await get<string>('version', modelStore)) === m.version;
  } catch {
    return false;
  }
}

async function fetchParts(urls: string[], onBytes: (n: number) => void): Promise<Blob> {
  const parts: Blob[] = [];
  for (const u of urls) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      let got = 0;
      try {
        const res = await fetch(new URL(u, document.baseURI).toString());
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        if (u.endsWith('.z85.json')) {
          // Model piece packed as text: {"n": byteLength, "d": "<z85>"}
          const j = (await res.json()) as { n: number; d: string };
          const bytes = z85Decode(j.d, j.n);
          parts.push(new Blob([bytes as BlobPart]));
          got = bytes.length;
          onBytes(bytes.length);
          lastErr = null;
          break;
        }
        // Stream so the progress bar moves during big files.
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          got += value.length;
          onBytes(value.length);
        }
        parts.push(new Blob(chunks as BlobPart[]));
        lastErr = null;
        break;
      } catch (e) {
        onBytes(-got); // don't count a failed attempt twice
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    if (lastErr) throw new Error('ההורדה של מנוע התמלול נקטעה. בדקי את החיבור ונסי שוב — מה שכבר ירד נשמר.');
  }
  return new Blob(parts);
}

/**
 * Reads a cached model file. Files are stored as ArrayBuffers: on iOS, Blobs kept in IndexedDB
 * can become unreadable after the app is reopened ("The object can not be found here").
 */
async function readCached(version: string, name: string): Promise<Blob | null> {
  const key = `ab:${version}:${name}`;
  try {
    const ab = await get<ArrayBuffer>(key, modelStore);
    if (ab instanceof ArrayBuffer && ab.byteLength) return new Blob([ab]);
  } catch {
    /* fall through */
  }
  // Older versions stored Blobs: migrate if still readable, otherwise drop and download again.
  try {
    const old = await get<Blob>(`${version}:${name}`, modelStore);
    if (old) {
      const ab = await old.arrayBuffer();
      await set(key, ab, modelStore);
      await del(`${version}:${name}`, modelStore);
      return new Blob([ab]);
    }
  } catch {
    await del(`${version}:${name}`, modelStore).catch(() => undefined);
  }
  return null;
}

/** Download (or read from the phone) every model file. Each finished file is stored, so an interrupted download resumes. */
async function ensureModelFiles(onStage: (s: EngineStage) => void): Promise<{ files: Record<string, Blob>; wasm: Blob; m: ModelManifest }> {
  const m = await getManifest();
  const entries: [string, string[]][] = [...Object.entries(m.files), ['__ort.wasm', m.wasm]];
  const files: Record<string, Blob> = {};
  let loaded = 0;
  for (const [name] of entries) {
    const b = await readCached(m.version, name);
    if (b) {
      files[name] = b;
      loaded += b.size;
    }
  }
  onStage({ stage: 'download', loaded, total: m.totalBytes });
  for (const [name, urls] of entries) {
    if (files[name]) continue;
    const blob = await fetchParts(urls, (n) => {
      loaded += n;
      onStage({ stage: 'download', loaded, total: m.totalBytes });
    });
    const ab = await blob.arrayBuffer();
    try {
      await set(`ab:${m.version}:${name}`, ab, modelStore);
    } catch {
      /* storage full: still usable for this session */
    }
    files[name] = new Blob([ab]);
  }
  await set('version-ab', m.version, modelStore);
  const wasm = files['__ort.wasm'];
  delete files['__ort.wasm'];
  return { files, wasm, m };
}

function call<T>(
  w: Worker,
  msg: unknown,
  transfer: Transferable[],
  onProgress?: (d: { done: number; total: number }) => void,
  onPartial?: (text: string) => void,
  watchdogMs = 0,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (!watchdogMs) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        w.removeEventListener('message', onMsg);
        reject(new Error('מנוע התמלול הפסיק להגיב. כנראה שלמכשיר אין מספיק זיכרון. נסי סרטון קצר יותר, או סגרי אפליקציות אחרות ונסי שוב.'));
      }, watchdogMs);
    };
    arm();
    const onMsg = (e: MessageEvent) => {
      const d = e.data;
      arm();
      if (d.type === 'progress') return onProgress?.(d);
      if (d.type === 'partial') return onPartial?.(d.text);
      if (timer) clearTimeout(timer);
      w.removeEventListener('message', onMsg);
      if (d.type === 'error') reject(new Error(d.message));
      else resolve(d as T);
    };
    w.addEventListener('message', onMsg);
    w.onerror = (e) => reject(new Error(e.message || 'מנוע התמלול קרס. ייתכן שאין מספיק זיכרון במכשיר.'));
    w.postMessage(msg, transfer);
  });
}

async function ensureWorker(onStage: (s: EngineStage) => void): Promise<Worker> {
  if (worker && loadedDevice) return worker;
  const { files, wasm, m } = await ensureModelFiles(onStage);
  onStage({ stage: 'loading' });
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  try {
    const wasmBuf = await wasm.arrayBuffer();
    // Send plain ArrayBuffers (transferred, no copy) rather than Blobs.
    const bufs: Record<string, ArrayBuffer> = {};
    for (const [k, b] of Object.entries(files)) bufs[k] = await b.arrayBuffer();
    const r = await call<{ device: string }>(
      worker,
      { type: 'load', files: bufs, wasm: wasmBuf, preferGpu: m.gpu !== false, dtype: m.dtype },
      [wasmBuf, ...Object.values(bufs)],
    );
    loadedDevice = r.device;
  } catch (e) {
    worker.terminate();
    worker = null;
    throw new Error('לא הצלחנו להפעיל את מנוע התמלול במכשיר הזה: ' + (e as Error).message);
  }
  return worker;
}

/** Split audio into windows of at most `max` seconds, cutting at the quietest 200 ms in the last third. */
export function speechWindows(audio: Float32Array, rate: number, max = 28): [number, number][] {
  const dur = audio.length / rate;
  const out: [number, number][] = [];
  const hop = Math.floor(rate * 0.05);
  const rms = (from: number, to: number) => {
    let s = 0;
    const a = Math.max(0, Math.floor(from * rate));
    const b = Math.min(audio.length, Math.floor(to * rate));
    for (let i = a; i < b; i += 4) s += audio[i] * audio[i];
    return s / Math.max(1, (b - a) / 4);
  };
  let start = 0;
  while (dur - start > max) {
    let best = start + max;
    let bestE = Infinity;
    for (let t = start + max * 0.66; t < start + max - 0.2; t += hop / rate) {
      const e = rms(t, t + 0.2);
      if (e < bestE) {
        bestE = e;
        best = t + 0.1;
      }
    }
    out.push([start, best]);
    start = best;
  }
  if (dur - start > 0.1) out.push([start, dur]);
  return out;
}

export async function transcribeOnDevice(audio: Float32Array, onStage: (s: EngineStage) => void): Promise<Transcript> {
  const w = await ensureWorker(onStage);
  const windows = speechWindows(audio, 16000);
  onStage({ stage: 'transcribe', done: 0, total: windows.length });
  const copy = audio.slice();
  let live = '';
  let progress = { done: 0, total: windows.length };
  const r = await call<{ words: { text: string; start: number; end: number }[] }>(
    w,
    { type: 'run', audio: copy, windows, language: 'he' },
    [copy.buffer],
    (d) => {
      progress = d;
      onStage({ stage: 'transcribe', done: d.done, total: d.total, text: live });
    },
    (t) => {
      live = (live + t).replace(/\uFFFD/g, '').slice(-160);
      onStage({ stage: 'transcribe', done: progress.done, total: progress.total, text: live });
    },
    180_000,
  );
  if (!r.words.length) throw new Error('לא זוהה דיבור בסרטון.');
  const words: Word[] = r.words.map((x, i) => ({
    id: `w${i}`,
    text: x.text,
    originalText: x.text,
    start: x.start,
    end: x.end,
    kind: /^[[(].*[\])]$/.test(x.text) ? 'event' : 'word',
  }));
  const m = await getManifest();
  return {
    provider: 'on-device',
    model: m.model,
    languageCode: 'heb',
    languageProbability: 1,
    words,
    speakers: [],
    createdAt: Date.now(),
    revision: 0,
  };
}

export function engineDevice(): string | null {
  return loadedDevice;
}
