/// <reference lib="webworker" />
// Воркер ИИ: владеет сессиями onnxruntime-web. Создаётся лениво (только когда пользователь запускает ИИ), поэтому классический
// путь не грузит ни этот файл, ни библиотеку с её WASM.
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import ortWebgpuUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import type { RawKernelSample } from '../app/resources/diagnostics'
import { createRuntime, type OrtLike } from './runtime'
import type { MlRequest, MlResponse } from './mlClient'

let kernels: RawKernelSample[] | undefined

const runtime = createRuntime(async (backend) => {
  // две сборки: WASM-only (14 МБ) для обычного пути и с WebGPU (26 МБ, asyncify: именно его ждёт `onnxruntime-web/webgpu`; с другим wasm сессия молча зависает) только там, где модель идёт на WebGPU
  const ort = backend === 'webgpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm')
  ort.env.logLevel = 'error' // предупреждения ORT о неиспользуемых весах иначе попадают в консоль как ошибки
  const isolated = typeof self !== 'undefined' && Boolean((self as { crossOriginIsolated?: boolean }).crossOriginIsolated)
  ort.env.wasm.numThreads = isolated ? Math.min(4, Math.max(1, navigator.hardwareConcurrency || 1)) : 1 // без COOP/COEP (GitHub Pages их не отдаёт) многопоточного WASM нет
  ort.env.wasm.wasmPaths = { wasm: backend === 'webgpu' ? ortWebgpuUrl : ortWasmUrl }
  return ort as unknown as OrtLike
}, (phase, modelId) => self.postMessage({ kind: 'phase', phase, modelId } satisfies MlResponse), (s) => { kernels = s })

self.addEventListener('message', async (e: MessageEvent<MlRequest>) => {
  const m = e.data
  try {
    if (m.kind === 'load') { await runtime.load(m.spec, m.bytes, m.backend, m.data); self.postMessage({ id: m.id, ok: true } satisfies MlResponse) }
    else if (m.kind === 'matte') {
      kernels = undefined
      const alpha = await runtime.matte(m.spec, m.rgb, m.w, m.h, { profile: m.profile })
      self.postMessage({ id: m.id, ok: true, alpha, ...(kernels ? { kernels } : {}) } satisfies MlResponse, [alpha.buffer])
    } else if (m.kind === 'depth') {
      kernels = undefined
      const alpha = await runtime.depth(m.spec, m.rgb, m.w, m.h, { profile: m.profile })
      self.postMessage({ id: m.id, ok: true, alpha, ...(kernels ? { kernels } : {}) } satisfies MlResponse, [alpha.buffer])
    } else { await runtime.release(m.modelId); self.postMessage({ id: m.id, ok: true } satisfies MlResponse) }
  } catch (err) {
    self.postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) } satisfies MlResponse)
  }
})

// Исключение вне запроса (например, внутри инициализации ORT) иначе оставило бы запрос ждать вечно
self.addEventListener('unhandledrejection', (e) => self.postMessage({ kind: 'fatal', message: String((e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason) } satisfies MlResponse))
