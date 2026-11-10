// Splits a transformers.js Whisper model + the onnxruntime wasm into small parts and writes
// model-manifest.json. Usage:
//   node scripts/prepare-model.mjs <modelDir> <outDir> <encoderFile> <decoderFile> <label> <modelId> <punctuation:0|1> [partMB]
import fs from 'fs';
import path from 'path';
const [modelDir, outDir, enc, dec, label, modelId, punct, partMb = '14'] = process.argv.slice(2);
const PART = Number(partMb) * 1024 * 1024;
fs.mkdirSync(path.join(outDir, 'model'), { recursive: true });
let total = 0;
function split(src, name) {
  const buf = fs.readFileSync(src);
  const urls = [];
  const safe = name.replace(/[\/]/g, '__');
  for (let i = 0, k = 0; i < buf.length || k === 0; i += PART, k++) {
    const p = `model/${safe}.${String(k).padStart(2, '0')}.bin`;
    fs.writeFileSync(path.join(outDir, p), buf.subarray(i, i + PART));
    urls.push(p);
  }
  total += buf.length;
  return urls;
}
const files = {};
for (const f of ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json']) files[f] = split(path.join(modelDir, f), f);
files[`onnx/${enc}`] = split(path.join(modelDir, 'onnx', enc), `onnx/${enc}`);
files[`onnx/${dec}`] = split(path.join(modelDir, 'onnx', dec), `onnx/${dec}`);
const wasm = split('node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm', 'ort-asyncify.wasm');
const dtype = { encoder_model: enc.replace(/^encoder_model_?|\.onnx$/g, '') || 'fp32', decoder_model_merged: dec.replace(/^decoder_model_merged_?|\.onnx$/g, '') || 'fp32' };
const version = `${modelId}:${enc}:${dec}`;
const manifest = { version, label, model: modelId, dtype, punctuation: punct === '1', files, wasm, totalBytes: total };
fs.writeFileSync(path.join(outDir, 'model-manifest.json'), JSON.stringify(manifest, null, 1));
console.log('parts', Object.values(files).flat().length + wasm.length, 'MB', (total / 1e6).toFixed(1), dtype);
