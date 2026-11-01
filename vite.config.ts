import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

// версия записана только в package.json: сайт и тесты получают её отсюда
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  // относительные URL: один билд работает под любым подпутём (GitHub Pages), роутинг на hash-ах
  base: './',
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  // onnxruntime-web грузит собственные .mjs/.wasm внутри воркера: пре-бандлинг Vite ломает пути и хэши при перезапуске
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  // .claude/worktrees — чужие рабочие копии (сессии приложения): их тесты не наши
  // геометрические тесты (WASM, сетки до сотен тысяч треугольников) в полном параллельном прогоне долгие: общий таймаут щедрый
  test: { setupFiles: ['./src/test-setup.ts'], exclude: [...configDefaults.exclude, '.claude/**'], testTimeout: 30000 },
})
