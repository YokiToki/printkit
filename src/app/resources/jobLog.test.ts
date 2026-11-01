// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import en from '../../i18n/en.json'
import ru from '../../i18n/ru.json'
import { ModelClient, type WorkerMessage, type WorkerResponse } from '../../geometry/modelClient'
import { result as mesh, sharpParams as defaultParams } from '../../geometry/testing'
import { createMlService } from '../../ml/service'
import { MODELS } from '../../ml/models'
import { getLogSnapshot, resetActivityLog, startJob, subscribeLog } from '../activityLog'
import { logText } from '../logText'
import { reportResult } from '../modelLog'
import { getJobReports } from './jobs'

describe('отчёты задач в журнале и строке состояния ИИ (37, 3.1)', () => {
  beforeEach(async () => {
    resetActivityLog()
    await i18n.changeLanguage('en')
  })

  it('перестройка модели через ModelClient записывает отчёт и строку с длительностью, бэкендом и числом треугольников (EN/RU)', async () => {
    let cb!: (e: { data: WorkerResponse }) => void
    let sentId = 0
    const worker = {
      postMessage(m: WorkerMessage) { if ('id' in m) sentId = m.id },
      addEventListener(_: 'message', fn: (e: { data: WorkerResponse }) => void) { cb = fn },
    }
    const client = new ModelClient(worker)
    const job = startJob({ source: 'model', key: 'log.model.start' })
    const p = client.generate('baseplate', defaultParams)
    const m = mesh(1)
    m.parts[0].mesh.triVerts = new Uint32Array(360) // 120 треугольников
    cb({ data: { id: sentId, result: m } })
    const res = await p
    expect(res).not.toBeNull()
    expect(client.lastRun).toMatchObject({ backend: 'wasm', threads: 1 })
    reportResult(job, res!, 42, { current: '' }, client.lastRun)

    const entry = getLogSnapshot().entries.at(-1)!
    expect(entry.key).toBe('log.model.done')
    const enLine = logText(i18n.t, entry.key, entry.params)
    expect(enLine).toContain('42 ms')
    expect(enLine).toContain('120 triangles')
    expect(enLine).toContain('WASM ×1')

    await i18n.changeLanguage('ru')
    const ruLine = logText(i18n.t, entry.key, entry.params)
    expect(ruLine).toContain('42 мс')
    expect(ruLine).toContain('треугольников: 120')
    expect(ruLine).toContain('WASM ×1')

    expect(getJobReports()).toHaveLength(1)
    expect(getJobReports()[0]).toMatchObject({ kind: 'rebuild', backend: 'wasm', threads: 1 })
    expect(getJobReports()[0].triangles?.value).toBe(120)
  })

  it('запуск ИИ на WASM ×4 и WebGPU пишет «WASM ×4» и «WebGPU» в строку состояния и в итоговую строку (EN/RU)', async () => {
    const wasmSpec = MODELS[0] // rmbg-1.4-quant, wasm
    const webgpuSpec = MODELS[3] // birefnet-general-lite-fp16, webgpu
    const store = {
      read: vi.fn(async () => new ArrayBuffer(16)),
      readData: vi.fn(async () => new ArrayBuffer(16)),
      cancel: vi.fn(),
      download: vi.fn(),
      status: () => ({ state: 'ready' }),
      persistent: true,
    }
    const client = {
      load: vi.fn(async () => {}),
      matte: vi.fn(async (_s: unknown, _r: Uint8Array, w: number, h: number) => new Float32Array(w * h).fill(1)),
      cancel: vi.fn(),
    }

    const statusLines: string[] = []
    const unsub = subscribeLog(() => {
      const j = getLogSnapshot().jobs.at(-1)
      if (j) statusLines.push(logText(i18n.t, j.key, j.params))
    })

    const wasmSvc = createMlService({
      client: client as never,
      store: store as never,
      caps: async () => ({ webgpu: false, f16: false }),
      threads: 4,
    })
    await wasmSvc.matteAlpha(wasmSpec, new Uint8Array(12), 2, 2)

    expect(statusLines.some((s) => s.includes('WASM ×4'))).toBe(true)
    const wasmDone = getLogSnapshot().entries.at(-1)!
    expect(logText(i18n.t, wasmDone.key, wasmDone.params)).toMatch(/done in \d+\.\d s \(WASM ×4, busy \d+ %\)/)

    statusLines.length = 0
    const gpuSvc = createMlService({
      client: client as never,
      store: store as never,
      caps: async () => ({ webgpu: true, f16: true }),
      threads: 4,
    })
    await gpuSvc.matteAlpha(webgpuSpec, new Uint8Array(12), 2, 2)
    unsub()

    expect(statusLines.some((s) => s.includes('WebGPU'))).toBe(true)
    const gpuDone = getLogSnapshot().entries.at(-1)!
    expect(logText(i18n.t, gpuDone.key, gpuDone.params)).toMatch(/done in \d+\.\d s \(WebGPU, busy \d+ %\)/)

    await i18n.changeLanguage('ru')
    expect(logText(i18n.t, wasmDone.key, wasmDone.params)).toMatch(/готово за \d+\.\d с \(WASM ×4, занято \d+ %\)/)
    expect(logText(i18n.t, gpuDone.key, gpuDone.params)).toMatch(/готово за \d+\.\d с \(WebGPU, занято \d+ %\)/)

    expect(getJobReports().map((r) => `${r.backend}:${r.threads}`)).toEqual(['webgpu:1', 'wasm:4'])
  })

  it('ключи log.job совпадают в en.json и ru.json', () => {
    expect(Object.keys(en.log.job).sort()).toEqual(Object.keys(ru.log.job).sort())
  })
})
