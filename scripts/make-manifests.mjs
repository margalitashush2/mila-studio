// Writes public/model-manifest*.json pointing at pinned Hugging Face files (downloaded by the phone directly)
// and copies the onnxruntime wasm next to the app.
import fs from 'fs';
const models = {
  'model-manifest.json': {
    repo: 'instush/ivrit-whisper-large-v3-turbo-timestamped-onnx', sha: 'c71eadaca74c0923a06632bdaeb7413ff9cff4cf',
    enc: 'encoder_model_q4.onnx', dec: 'decoder_model_merged_q4.onnx', punctuation: true,
    label: 'ivrit.ai Whisper large-v3-turbo (מודל עברי מאומן על כ-5,000 שעות עברית)', model: 'ivrit-ai/whisper-large-v3-turbo',
  },
  'model-manifest-light.json': {
    repo: 'onnx-community/whisper-small_timestamped', sha: '65caa70f294b46e1c33ff820aae6b16d048ab818',
    enc: 'encoder_model_q4.onnx', dec: 'decoder_model_merged_int8.onnx', punctuation: false,
    label: 'Whisper small (OpenAI), מודל קל', model: 'openai/whisper-small',
  },
};
fs.mkdirSync('public/model', { recursive: true });
const wasmSrc = 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm';
fs.copyFileSync(wasmSrc, 'public/model/ort-asyncify.wasm');
const wasmSize = fs.statSync(wasmSrc).size;
for (const [out, m] of Object.entries(models)) {
  const tree = await (await fetch(`https://huggingface.co/api/models/${m.repo}/tree/${m.sha}?recursive=1`)).json();
  const size = Object.fromEntries(tree.map((x) => [x.path, x.lfs?.size ?? x.size]));
  const want = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', `onnx/${m.enc}`, `onnx/${m.dec}`];
  const files = {};
  let total = wasmSize;
  for (const f of want) {
    if (size[f] == null) throw new Error(`${m.repo} missing ${f}`);
    files[f] = [`https://huggingface.co/${m.repo}/resolve/${m.sha}/${f}`];
    total += size[f];
  }
  const dtype = { encoder_model: m.enc.replace(/^encoder_model_|\.onnx$/g, ''), decoder_model_merged: m.dec.replace(/^decoder_model_merged_|\.onnx$/g, '') };
  const manifest = { version: `${m.repo}@${m.sha.slice(0, 8)}:${m.enc}:${m.dec}`, label: m.label, model: m.model, dtype, punctuation: m.punctuation, files, wasm: ['model/ort-asyncify.wasm'], totalBytes: total };
  fs.writeFileSync(`public/${out}`, JSON.stringify(manifest, null, 1));
  console.log(out, (total / 1e6).toFixed(0), 'MB');
}
