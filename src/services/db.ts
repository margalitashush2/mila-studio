/** Persistent storage on the device (IndexedDB). Videos, transcripts and the model never leave the phone. */
import { createStore, del as idbDel, get as idbGet, keys as idbKeys, set as idbSet, type UseStore } from 'idb-keyval';
import type { BrandKit, DictionaryEntry, Project } from '../core/types';

let store: UseStore = createStore('mila-studio', 'kv');

/** Safari sometimes closes the IndexedDB connection ("connection is closing"); reopen once and retry. */
async function withRetry<T>(fn: (st: UseStore) => Promise<T>): Promise<T> {
  try {
    return await fn(store);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (!/closing|closed|InvalidState|connection/i.test(msg)) throw e;
    store = createStore('mila-studio', 'kv');
    return fn(store);
  }
}
const get = <T>(k: IDBValidKey, _s?: unknown) => withRetry((st) => idbGet<T>(k, st));
const set = (k: IDBValidKey, v: unknown, _s?: unknown) => withRetry((st) => idbSet(k, v, st));
const del = (k: IDBValidKey, _s?: unknown) => withRetry((st) => idbDel(k, st));
const keys = (_s?: unknown) => withRetry((st) => idbKeys(st));
const blobCache = new Map<string, Blob>();

export interface Settings {
  exportQuality: 720 | 1080 | 2160;
  /** ElevenLabs API key: when set, transcription runs in the cloud (accurate, fast) */
  elevenLabsKey: string;
  engine: 'quality' | 'light';
}

export const DEFAULT_SETTINGS: Settings = { exportQuality: 1080, engine: 'quality', elevenLabsKey: '' };

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}

export const db = {
  async listProjects(): Promise<Project[]> {
    const all = (await keys(store)).filter((k) => String(k).startsWith('project:'));
    const items = await Promise.all(all.map((k) => get<Project>(k, store)));
    return items.filter((p): p is Project => !!p).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  getProject: (id: string) => get<Project>(`project:${id}`, store),
  saveProject: (p: Project) => set(`project:${p.id}`, p, store),
  async deleteProject(p: Project) {
    await del(`project:${p.id}`, store);
    blobCache.delete(p.videoKey);
    await del(`blob:${p.videoKey}`, store);
    await del(`audio:${p.videoKey}`, store);
    const meta = await get<{ chunks: number }>(`video:${p.videoKey}`, store);
    if (meta) {
      for (let i = 0; i < meta.chunks; i++) await del(`vchunk:${p.videoKey}:${i}`, store);
      await del(`video:${p.videoKey}`, store);
    }
  },
  /** Small files (logos, fonts). Stored as ArrayBuffers: iOS can lose Blobs kept in IndexedDB. */
  async putBlob(key: string, blob: Blob) {
    const ab = await readSlice(blob);
    const type = blob.type || 'application/octet-stream';
    const mem = new Blob([ab], { type });
    blobCache.set(key, mem);
    await set(`blob:${key}`, { ab, type }, store);
  },
  async getBlob(key: string): Promise<Blob | undefined> {
    const hit = blobCache.get(key);
    if (hit) return hit;
    const v = await get<{ ab: ArrayBuffer; type: string } | Blob>(`blob:${key}`, store);
    if (!v) return undefined;
    let mem: Blob | undefined;
    if (v instanceof Blob) {
      try {
        mem = new Blob([await v.arrayBuffer()], { type: v.type }); // legacy entry
      } catch {
        return undefined;
      }
    } else mem = new Blob([v.ab], { type: v.type });
    blobCache.set(key, mem);
    return mem;
  },
  /** Videos are stored as ArrayBuffer chunks: WebKit can lose Blobs kept in IndexedDB. */
  /**
   * Copies the picked file into memory + storage right away and returns an in-memory Blob.
   * (On iOS in-app browsers the picked File can become unreadable a little later.)
   */
  async putVideo(key: string, file: Blob, onProgress?: (f: number) => void): Promise<Blob> {
    const CHUNK = 8 * 1024 * 1024;
    const n = Math.max(1, Math.ceil(file.size / CHUNK));
    const parts: ArrayBuffer[] = [];
    for (let i = 0; i < n; i++) {
      const part = await readSlice(file.slice(i * CHUNK, (i + 1) * CHUNK));
      parts.push(part);
      await set(`vchunk:${key}:${i}`, part, store);
      onProgress?.((i + 1) / n);
    }
    const type = file.type || 'video/mp4';
    await set(`video:${key}`, { chunks: n, type, size: file.size }, store);
    const mem = new Blob(parts, { type });
    blobCache.set(key, mem);
    return mem;
  },
  async getVideo(key: string): Promise<Blob | undefined> {
    const hit = blobCache.get(key);
    if (hit) return hit;
    const meta = await get<{ chunks: number; type: string }>(`video:${key}`, store);
    if (!meta) return this.getBlob(key); // projects saved by an earlier version
    const parts: ArrayBuffer[] = [];
    for (let i = 0; i < meta.chunks; i++) {
      const p = await get<ArrayBuffer>(`vchunk:${key}:${i}`, store);
      if (!p) return undefined;
      parts.push(p);
    }
    const b = new Blob(parts, { type: meta.type });
    blobCache.set(key, b);
    return b;
  },
  putAudio: (key: string, pcm16k: Int16Array) => set(`audio:${key}`, pcm16k.buffer, store),
  async getAudio(key: string): Promise<Int16Array | undefined> {
    const b = await get<ArrayBuffer>(`audio:${key}`, store);
    return b ? new Int16Array(b) : undefined;
  },
  async deleteBlob(key: string) {
    blobCache.delete(key);
    await del(`blob:${key}`, store);
  },
  async getSettings(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...((await get<Settings>('settings', store)) ?? {}) };
  },
  saveSettings: (s: Settings) => set('settings', s, store),
  async getDictionary(): Promise<DictionaryEntry[]> {
    return (await get<DictionaryEntry[]>('dictionary', store)) ?? [];
  },
  saveDictionary: (d: DictionaryEntry[]) => set('dictionary', d, store),
  async getBrand(): Promise<BrandKit> {
    return (
      (await get<BrandKit>('brand', store)) ?? {
        logos: [],
        defaultLogo: { logoId: null, x: 0.85, y: 0.08, scale: 0.18, opacity: 0.9 },
        colors: ['#FFFFFF', '#FFB547', '#7C6CFF'],
        captionStyle: null,
        savedStyles: [],
        customFonts: [],
      }
    );
  },
  saveBrand: (b: BrandKit) => set('brand', b, store),
  async storageEstimate(): Promise<{ usage: number; quota: number } | null> {
    try {
      const e = await navigator.storage.estimate();
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    } catch {
      return null;
    }
  },
};

/** Reads a Blob slice with several fallbacks (some in-app browsers fail on one method but not another). */
async function readSlice(b: Blob): Promise<ArrayBuffer> {
  const errors: string[] = [];
  try {
    return await b.arrayBuffer();
  } catch (e) {
    errors.push(`arrayBuffer: ${(e as Error)?.message}`);
  }
  try {
    return await new Promise<ArrayBuffer>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as ArrayBuffer);
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(b);
    });
  } catch (e) {
    errors.push(`FileReader: ${(e as Error)?.message}`);
  }
  try {
    return await new Response(b).arrayBuffer();
  } catch (e) {
    errors.push(`Response: ${(e as Error)?.message}`);
  }
  throw new Error('לא הצלחנו לקרוא את קובץ הסרטון מהגלריה (' + errors.join(' | ') + ')');
}

export function uid(prefix = ''): string {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + Date.now().toString(36) + r[0].toString(36) + r[1].toString(36);
}
