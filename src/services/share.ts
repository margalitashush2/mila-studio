/**
 * Saving files to the phone. Inside Claude the page uses the `downloads` capability, which
 * opens the iOS share sheet ("Save Video" puts it in the Photos gallery). Elsewhere it falls
 * back to the Web Share API or a normal download. Call from a tap.
 */
type Downloads = { save(r: { filename: string; data: Blob | string }): Promise<{ status: string }> };
type ClaudeWin = Window & { claude?: { use(name: string): Promise<unknown> } };

let downloadsPromise: Promise<Downloads | null> | null = null;
export function getDownloads(): Promise<Downloads | null> {
  const w = window as ClaudeWin;
  if (!w.claude?.use) return Promise.resolve(null);
  downloadsPromise ??= w.claude.use('downloads').then((d) => (d as Downloads) ?? null).catch(() => null);
  return downloadsPromise;
}
// Resolve early so the first tap doesn't wait.
void getDownloads();

export type SaveOutcome = 'saved' | 'cancelled' | 'failed';

export async function saveFile(blob: Blob, name: string): Promise<SaveOutcome> {
  const dl = await getDownloads();
  if (dl) {
    try {
      await dl.save({ filename: name, data: blob });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return 'cancelled';
      if (code !== 'unavailable' && code !== 'not_granted') return 'failed';
    }
  }
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'saved';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'saved';
}

/** Minimal ZIP (stored, no compression) so .srt files can be saved where only common types are allowed. */
export function zipFiles(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // UTF-8 names
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'mila';
}
