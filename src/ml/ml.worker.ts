/// <reference lib="webworker" />
// Воркер ИИ: владеет сессиями onnxruntime-web. Создаётся лениво (только когда пользователь запускает ИИ), поэтому классический
// путь не грузит ни этот файл, ни библиотеку с её WASM.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url'
import { createRuntime, type OrtLike } from './runtime'
import type { MlRequest, MlResponse } from './mlClient'

const runtime = createRuntime(async () => {
  const ort = await import('onnxruntime-web/webgpu')
  ort.env.wasm.numThreads = 1 // без COOP/COEP (GitHub Pages их не отдаёт) многопоточного WASM нет
  ort.env.wasm.wasmPaths = { wasm: ortWasmUrl }
  return ort as unknown as OrtLike
}, (phase, modelId) => self.postMessage({ kind: 'phase', phase, modelId } satisfies MlResponse))

self.addEventListener('message', async (e: MessageEvent<MlRequest>) => {
  const m = e.data
  try {
    if (m.kind === 'load') { await runtime.load(m.spec, m.bytes, m.backend); self.postMessage({ id: m.id, ok: true } satisfies MlResponse) }
    else if (m.kind === 'matte') {
      const alpha = await runtime.matte(m.spec, m.rgb, m.w, m.h)
      self.postMessage({ id: m.id, ok: true, alpha } satisfies MlResponse, [alpha.buffer])
    } else { await runtime.release(m.modelId); self.postMessage({ id: m.id, ok: true } satisfies MlResponse) }
  } catch (err) {
    self.postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) } satisfies MlResponse)
  }
})
