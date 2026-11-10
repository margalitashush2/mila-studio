/// <reference lib="webworker" />
/**
 * On-device Hebrew speech recognition worker (Whisper ONNX with word timestamps; model chosen by the manifest).
 * Model files arrive from the main thread as Blobs; no network access is needed here.
 */
import { env, pipeline, WhisperTextStreamer } from '@huggingface/transformers';

type Files = Record<string, ArrayBuffer>;
type ASR = { tokenizer: unknown } & ((audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }>);

const MODEL_ID = 'model';
const FAKE_BASE = 'https://model.local/';
let asr: ASR | null = null;
let files: Files = {};
let device: 'webgpu' | 'wasm' = 'wasm';

function fakeFetch(input: string | URL): Promise<Response> {
  const url = String(input);
  const key = Object.keys(files).find((k) => url.endsWith('/' + k));
  if (!key) return Promise.resolve(new Response('not found', { status: 404 }));
  const buf = files[key];
  // a copy, so the stored buffer stays usable if the same file is requested twice
  return Promise.resolve(
    new Response(buf.slice(0), { status: 200, headers: { 'content-length': String(buf.byteLength), 'content-type': 'application/octet-stream' } }),
  );
}

async function load(msg: { files: Files; wasm: ArrayBuffer; preferGpu: boolean; dtype: Record<string, string> }) {
  files = msg.files;
  // All model requests go through fakeFetch (files already on the phone); nothing hits the network.
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.remoteHost = FAKE_BASE;
  env.remotePathTemplate = '{model}/';
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.useWasmCache = false;
  env.fetch = fakeFetch as typeof env.fetch;
  const ortEnv = env.backends.onnx as { wasm?: Record<string, unknown> };
  ortEnv.wasm = ortEnv.wasm ?? {};
  ortEnv.wasm.wasmBinary = msg.wasm;
  // Use the factory embedded in the bundle; never fetch runtime files from a CDN.
  ortEnv.wasm.wasmPaths = undefined;
  ortEnv.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
  ortEnv.wasm.proxy = false;

  // Probe WebGPU first: a failed backend init is cached by onnxruntime, so don't "try and fall back".
  let gpuOk = false;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    gpuOk = !!(msg.preferGpu && gpu && (await gpu.requestAdapter()));
  } catch {
    gpuOk = false;
  }
  const tryDevices: ('webgpu' | 'wasm')[] = gpuOk ? ['webgpu'] : ['wasm'];
  let lastErr: unknown;
  for (const d of tryDevices) {
    try {
      asr = (await pipeline('automatic-speech-recognition', MODEL_ID, {
        device: d,
        dtype: msg.dtype as never,
      })) as unknown as ASR;
      device = d;
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function run(msg: { audio: Float32Array; windows: [number, number][]; language: string }) {
  if (!asr) throw new Error('model not loaded');
  const rate = 16000;
  const words: { text: string; start: number; end: number }[] = [];
  for (let i = 0; i < msg.windows.length; i++) {
    const [s, e] = msg.windows[i];
    const slice = msg.audio.subarray(Math.floor(s * rate), Math.floor(e * rate));
    postMessage({ type: 'progress', done: i, total: msg.windows.length });
    // Live text while decoding: shows progress and doubles as a heartbeat for the main thread.
    const streamer = new WhisperTextStreamer(asr.tokenizer as never, {
      skip_prompt: true,
      callback_function: (text: string) => postMessage({ type: 'partial', text }),
    });
    const out = await asr(slice, {
      language: msg.language,
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 30,
      streamer,
    });
    for (const c of out.chunks ?? []) {
      const text = c.text.trim();
      if (!text) continue;
      const a = s + (c.timestamp[0] ?? 0);
      const b = s + (c.timestamp[1] ?? c.timestamp[0] ?? 0);
      words.push({ text, start: a, end: Math.max(b, a + 0.05) });
    }
    postMessage({ type: 'progress', done: i + 1, total: msg.windows.length });
  }
  return words;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      await load(msg);
      postMessage({ type: 'loaded', device });
    } else if (msg.type === 'run') {
      const words = await run(msg);
      postMessage({ type: 'result', words, device });
    }
  } catch (err) {
    postMessage({ type: 'error', message: (err as Error)?.message ?? String(err) });
  }
};
