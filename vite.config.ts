import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode artifact` builds the copy that runs inside a Claude page: CPU-only onnxruntime
// (smaller wasm), model packed into JSON text files that the page decodes itself.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  resolve: mode === 'artifact' ? { alias: [{ find: /^onnxruntime-web\/webgpu$/, replacement: 'onnxruntime-web/wasm' }] } : undefined,
  build: { target: 'safari16', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000, outDir: mode === 'artifact' ? 'dist-artifact' : 'dist' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
}));
