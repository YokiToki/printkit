// Запуск моделей: сессия onnxruntime-web создаётся лениво (динамический импорт), бэкенд WebGPU или WASM в одну нить.
import { fromOutput, toInput } from './prepost'
import type { Backend, ModelSpec } from './models'

/** Нужная часть onnxruntime-web: так среду можно подменить в тестах и не тянуть библиотеку, пока ИИ не использован. */
export interface OrtLike {
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown
  InferenceSession: {
    create(bytes: Uint8Array, options: { executionProviders: string[]; graphOptimizationLevel?: string }): Promise<SessionLike>
  }
}
export interface SessionLike {
  inputNames: readonly string[]
  outputNames: readonly string[]
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>>
  release?(): Promise<void>
}

export type Phase = 'session' | 'run'
export interface MlRuntime {
  /** Создаёт сессию модели из байт весов на выбранном бэкенде. */
  load(spec: ModelSpec, bytes: ArrayBuffer, backend: Backend): Promise<void>
  /** Альфа 0…1 размера w × h для картинки RGB w × h. */
  matte(spec: ModelSpec, rgb: Uint8Array, w: number, h: number): Promise<Float32Array>
  release(modelId: string): Promise<void>
  has(modelId: string): boolean
}

export function createRuntime(loadOrt: (backend: Backend) => Promise<OrtLike>, onPhase?: (phase: Phase, modelId: string) => void): MlRuntime {
  const sessions = new Map<string, SessionLike>()
  const libs = new Map<Backend, OrtLike>()
  const sessionLib = new Map<string, OrtLike>()
  return {
    async load(spec, bytes, backend) {
      onPhase?.('session', spec.id)
      // WebGPU-сборка библиотеки ломается без WebGPU даже для WASM-сессии, поэтому у каждого бэкенда своя сборка
      let ort = libs.get(backend)
      if (!ort) { ort = await loadOrt(backend); libs.set(backend, ort) }
      // буфер весов сессии не переиспользуется: ORT может его передать (transfer), поэтому ей отдаём копию
      const session = await ort.InferenceSession.create(new Uint8Array(bytes.slice(0)), { executionProviders: [backend], graphOptimizationLevel: 'all' })
      await sessions.get(spec.id)?.release?.()
      sessions.set(spec.id, session); sessionLib.set(spec.id, ort)
    },
    async matte(spec, rgb, w, h) {
      const session = sessions.get(spec.id), ort = sessionLib.get(spec.id)
      if (!session || !ort) throw new Error(`session ${spec.id} not loaded`)
      onPhase?.('run', spec.id)
      // тензор создаётся заново на каждый запуск: при wasm.proxy ORT забирает буфер
      const input = new ort.Tensor('float32', toInput(rgb, w, h, spec), [1, 3, spec.size, spec.size])
      const out = await session.run({ [session.inputNames[0]]: input })
      return fromOutput(out[session.outputNames[0]].data as Float32Array, spec, w, h)
    },
    async release(modelId) { await sessions.get(modelId)?.release?.(); sessions.delete(modelId) },
    has: (modelId) => sessions.has(modelId),
  }
}
