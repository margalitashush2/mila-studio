// Packs the light model for a Claude page: binary model files become Z85 text inside JSON
// chunks (served as data the page decodes), config files stay JSON, CPU-only ort wasm as is.
// Usage: node scripts/pack-artifact.mjs <modelDir> <outDir>
import fs from 'fs';
import path from 'path';
const [modelDir, outDir] = process.argv.slice(2);
const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
function z85(buf) {
  const pad = Buffer.alloc(Math.ceil(buf.length / 4) * 4);
  buf.copy(pad);
  const out = Buffer.alloc((pad.length / 4) * 5);
  for (let i = 0, o = 0; i < pad.length; i += 4, o += 5) {
    let v = pad.readUInt32BE(i);
    for (let k = 4; k >= 0; k--) { out[o + k] = ALPHA.charCodeAt(v % 85); v = Math.floor(v / 85); }
  }
  return out.toString('latin1');
}
fs.mkdirSync(path.join(outDir, 'model'), { recursive: true });
const RAW = 12 * 1024 * 1024; // -> ~15MB of text per chunk
const files = {};
let total = 0;
for (const f of ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json']) {
  fs.copyFileSync(path.join(modelDir, f), path.join(outDir, 'model', f));
  files[f] = [`model/${f}`];
  total += fs.statSync(path.join(modelDir, f)).size;
}
for (const f of ['onnx/encoder_model_q4.onnx', 'onnx/decoder_model_merged_q4.onnx']) {
  const buf = fs.readFileSync(path.join(modelDir, f));
  const base = f.replace('/', '__');
  files[f] = [];
  for (let i = 0, k = 0; i < buf.length; i += RAW, k++) {
    const part = buf.subarray(i, i + RAW);
    const name = `model/${base}.${String(k).padStart(2, '0')}.z85.json`;
    fs.writeFileSync(path.join(outDir, name), `{"n":${part.length},"d":"${z85(part)}"}`);
    files[f].push(name);
  }
  total += buf.length;
}
fs.copyFileSync('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', path.join(outDir, 'model/ort-wasm.wasm'));
total += fs.statSync(path.join(outDir, 'model/ort-wasm.wasm')).size;
const manifest = {
  version: 'whisper-small-he-lite:q4+e8:v1',
  label: 'Whisper small (OpenAI), מותאם לטלפון',
  model: 'openai/whisper-small',
  dtype: { encoder_model: 'q4', decoder_model_merged: 'q4' },
  punctuation: false,
  gpu: false,
  files,
  wasm: ['model/ort-wasm.wasm'],
  totalBytes: total,
};
fs.writeFileSync(path.join(outDir, 'model-manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(outDir, 'model-manifest-light.json'), JSON.stringify(manifest, null, 1));
console.log('total raw MB', (total / 1e6).toFixed(1));
