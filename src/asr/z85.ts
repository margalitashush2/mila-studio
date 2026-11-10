/** Z85 (ZeroMQ base-85) decoding: binary packed as JSON-safe text with 25% overhead. */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
const DECODE = new Uint8Array(128).fill(255);
for (let i = 0; i < ALPHABET.length; i++) DECODE[ALPHABET.charCodeAt(i)] = i;

/** Decodes `text` (length multiple of 5) and trims to `byteLength`. */
export function z85Decode(text: string, byteLength: number): Uint8Array {
  const out = new Uint8Array((text.length / 5) * 4);
  let o = 0;
  for (let i = 0; i < text.length; i += 5) {
    let v = 0;
    for (let k = 0; k < 5; k++) {
      const d = DECODE[text.charCodeAt(i + k)];
      if (d === 255) throw new Error('corrupt model data');
      v = v * 85 + d;
    }
    out[o++] = (v >>> 24) & 255;
    out[o++] = (v >>> 16) & 255;
    out[o++] = (v >>> 8) & 255;
    out[o++] = v & 255;
  }
  return out.subarray(0, byteLength);
}

export function z85Encode(bytes: Uint8Array): string {
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
  padded.set(bytes);
  let s = '';
  const parts: string[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    let v = ((padded[i] << 24) | (padded[i + 1] << 16) | (padded[i + 2] << 8) | padded[i + 3]) >>> 0;
    const c = new Array(5);
    for (let k = 4; k >= 0; k--) {
      c[k] = ALPHABET[v % 85];
      v = Math.floor(v / 85);
    }
    s += c.join('');
    if (s.length > 1 << 16) {
      parts.push(s);
      s = '';
    }
  }
  parts.push(s);
  return parts.join('');
}
