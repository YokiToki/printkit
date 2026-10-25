import { defineConfig } from 'vite'

// PoC нейросетевых силуэтов (change 32). Не часть приложения: отдельный dev-сервер, `npm run poc:ai`.
// POC_COI=1 включает кросс-изоляцию (COOP/COEP), нужную для многопоточного WASM: так проверяется, стоит ли городить обходку для GitHub Pages.
const coi = process.env.POC_COI === '1'
export default defineConfig({
  root: 'poc/ai',
  base: './',
  server: {
    port: 5198, strictPort: true, fs: { allow: ['../..'] },
    headers: coi ? { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' } : {},
  },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
})
