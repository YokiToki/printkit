// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import i18n from '../../i18n'
import en from '../../i18n/en.json'
import ru from '../../i18n/ru.json'
import { closeLog, openLog, resetActivityLog, startJob } from '../activityLog'
import { ActivityLogPanel } from '../ActivityLogPanel'
import { DIAGNOSTICS_KEY, getDiagnostics, resetDiagnostics } from './diagnostics'
import { recordJobReport } from './jobs'
import { createLongTasksCollector } from './longTasks'
import { createPressureCollector } from './pressure'
import { resetRenderSnapshot, setRenderSnapshot } from './render'
import { resetSharedCollectors } from './ResourcesTab'
import { measured, unavailable } from './types'

function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

describe('ResourcesTab в ActivityLogPanel (37, 4.1)', () => {
  beforeEach(async () => {
    localStorage.clear()
    resetDiagnostics()
    resetActivityLog()
    resetRenderSnapshot()
    resetSharedCollectors()
    await i18n.changeLanguage('en')
  })
  afterEach(() => vi.restoreAllMocks())

  it('показывает группы CPU, GPU и Memory, таблицу последних задач и метку происхождения с тултипом у каждого значения', async () => {
    recordJobReport({
      kind: 'rebuild',
      start: 0,
      end: 80,
      backend: 'wasm',
      threads: 1,
      spans: [{ start: 0, end: 80 }],
      triangles: 240,
    })
    recordJobReport({
      kind: 'ai',
      name: 'RMBG-1.4',
      start: 100,
      end: 500,
      backend: 'wasm',
      threads: 4,
      spans: [{ start: 100, end: 400 }],
    })
    setRenderSnapshot({
      hasRender: true,
      timerQuerySupported: false,
      triangles: measured(240, 'triangles'),
      drawCalls: measured(3, 'calls'),
      submitMs: measured(1.2, 'ms'),
      gpuMs: unavailable('resources.unavailable.timerQuery'),
    })

    render(<ActivityLogPanel />)
    act(() => openLog())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resources' })) })

    const tab = screen.getByTestId('resources-tab')
    expect(within(tab).getByRole('region', { name: 'Processor (CPU)' })).toBeInTheDocument()
    expect(within(tab).getByRole('region', { name: 'Graphics (GPU)' })).toBeInTheDocument()
    expect(within(tab).getByRole('region', { name: 'Memory' })).toBeInTheDocument()

    const badges = within(tab).getAllByTestId('resource-provenance')
    expect(badges.length).toBeGreaterThanOrEqual(21)
    for (const b of badges) {
      expect(['measured', 'estimated', 'not available']).toContain(b.textContent)
      expect(b.getAttribute('title') ?? '').not.toBe('')
    }

    const table = within(tab).getByTestId('resources-jobs-table')
    expect(within(table).getByText('RMBG-1.4')).toBeInTheDocument()
    expect(within(table).getByText('WASM ×4')).toBeInTheDocument()
    expect(within(table).getByText('Model rebuild')).toBeInTheDocument()
    expect(within(table).getByText('240 triangles')).toBeInTheDocument()
  })

  it('неподдерживаемые источники перечисляются как «not available», а оценочные значения никогда не содержат знака «%»', async () => {
    recordJobReport({
      kind: 'ai',
      name: 'RMBG-1.4',
      start: 0,
      end: 400,
      backend: 'wasm',
      threads: 4,
      spans: [{ start: 0, end: 300 }],
    })
    const lt = createLongTasksCollector({ Observer: undefined })
    const pr = createPressureCollector({ Observer: undefined })

    render(
      <ActivityLogPanel
        resourcesDeps={{
          longTasks: lt,
          pressure: pr,
          gpuInfo: async () => ({
            supported: false,
            timestampQuery: false,
            adapterName: unavailable('resources.unavailable.webgpu'),
            architecture: unavailable('resources.unavailable.webgpu'),
            maxBufferBytes: unavailable('resources.unavailable.webgpu'),
          }),
          memory: async () => ({
            modelCacheBytes: measured(0, 'B'),
            storageUsageBytes: unavailable('resources.unavailable.storageEstimate'),
            storageQuotaBytes: unavailable('resources.unavailable.storageEstimate'),
            jsHeapBytes: unavailable('resources.unavailable.jsHeap'),
            wasmMemoryBytes: unavailable('resources.unavailable.wasmMemory'),
          }),
        }}
      />,
    )
    act(() => openLog())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resources' })) })

    expect(screen.getByTestId('resources-support-summary')).toHaveTextContent(
      'Compute Pressure: not available in this browser',
    )
    const badges = screen.getAllByTestId('resource-provenance')
    const estimatedBadges = badges.filter((b) => b.textContent === 'estimated')
    expect(estimatedBadges.length).toBeGreaterThanOrEqual(2)
    for (const b of estimatedBadges) {
      const valueText = b.parentElement?.firstElementChild?.textContent ?? ''
      expect(valueText).not.toContain('%')
    }
    expect(badges.some((b) => b.textContent === 'not available')).toBe(true)
  })

  it('переключатель диагностики предупреждает о замедлении и сохраняется в gridfinity.diagnostics', async () => {
    render(<ActivityLogPanel />)
    act(() => openLog())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resources' })) })

    const sw = screen.getByRole('switch', { name: /Diagnostics mode \(slows AI runs down a little\)/ })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(getDiagnostics()).toBe(true)
    expect(localStorage.getItem(DIAGNOSTICS_KEY)).toBe('true')
  })

  it('наблюдатели запускаются при открытии вкладки, обновляются раз в секунду во время работы задачи и отключаются при закрытии', async () => {
    vi.useFakeTimers()
    let ltDisconnected = 0
    let prDisconnected = 0
    class FakePerfObs {
      static supportedEntryTypes = ['longtask']
      observe() {}
      disconnect() { ltDisconnected++ }
    }
    class FakePressObs {
      static knownSources = ['cpu']
      observe() {}
      disconnect() { prDisconnected++ }
    }
    const lt = createLongTasksCollector({ Observer: FakePerfObs })
    const pr = createPressureCollector({ Observer: FakePressObs })
    const memSpy = vi.fn(async () => ({
      modelCacheBytes: measured(0, 'B'),
      storageUsageBytes: unavailable('resources.unavailable.storageEstimate'),
      storageQuotaBytes: unavailable('resources.unavailable.storageEstimate'),
      jsHeapBytes: unavailable('resources.unavailable.jsHeap'),
      wasmMemoryBytes: unavailable('resources.unavailable.wasmMemory'),
    }))

    render(<ActivityLogPanel resourcesDeps={{ longTasks: lt, pressure: pr, memory: memSpy }} />)
    expect(lt.running).toBe(false)
    expect(pr.running).toBe(false)

    act(() => openLog())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resources' })) })
    expect(lt.running).toBe(true)
    expect(pr.running).toBe(true)

    const job = startJob({ source: 'ai', key: 'log.ai.run', params: { name: 'Net' } })
    const callsBefore = memSpy.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(2100) })
    expect(memSpy.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 2)
    act(() => job.done('log.ai.runDone', { name: 'Net', seconds: '2.1' }))

    act(() => closeLog())
    expect(lt.running).toBe(false)
    expect(pr.running).toBe(false)
    expect(ltDisconnected).toBe(1)
    expect(prDisconnected).toBe(1)
    vi.useRealTimers()
  })

  it('Copy включает раздел отчёта о ресурсах', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    recordJobReport({
      kind: 'ai',
      name: 'BiRefNet',
      start: 0,
      end: 250,
      backend: 'webgpu',
      threads: 1,
      spans: [{ start: 0, end: 250 }],
    })
    render(<ActivityLogPanel />)
    act(() => openLog())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resources' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })) })

    const text = write.mock.calls[0][0] as string
    expect(text).toContain('=== Resources ===')
    expect(text).toContain('Processor (CPU):')
    expect(text).toContain('Graphics (GPU):')
    expect(text).toContain('Memory:')
    expect(text).toContain('BiRefNet | WebGPU')
  })

  it('ключи resources совпадают в en.json и ru.json, а переключение языка переводит вкладку', async () => {
    expect(flatKeys(en.resources).sort()).toEqual(flatKeys(ru.resources).sort())
    render(<ActivityLogPanel />)
    act(() => openLog())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resources' })) })
    await act(async () => { await i18n.changeLanguage('ru') })
    expect(screen.getByRole('region', { name: 'Процессор (CPU)' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Графика (GPU)' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Память' })).toBeInTheDocument()
  })

  it('полный сценарий (6.2): перестройка модели, запуск ИИ на WASM и WebGPU с диагностикой (GPU time и ядра), 3D-кадр, адаптер, отсутствие сетевых запросов и стек на мобильном экране', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { aggregateKernels, setDiagnostics } = await import('./diagnostics')
    setDiagnostics(true)

    recordJobReport({
      kind: 'rebuild',
      start: 0,
      end: 320,
      backend: 'wasm',
      threads: 1,
      spans: [{ start: 0, end: 320 }],
      triangles: 14800,
    })
    recordJobReport({
      kind: 'ai',
      name: 'RMBG-1.4 (int8)',
      start: 400,
      end: 1900,
      backend: 'wasm',
      threads: 4,
      spans: [{ start: 400, end: 1850 }],
    })
    const gpuProfile = aggregateKernels(
      [
        { kernelType: 'Conv', programName: 'Conv2D_fp16', startTime: 0, endTime: 45_000_000 },
        { kernelType: 'MatMul', programName: 'MatMul_fp16', startTime: 45_000_000, endTime: 75_000_000 },
      ],
      120,
    )
    recordJobReport({
      kind: 'ai',
      name: 'BiRefNet-lite (fp16)',
      start: 2000,
      end: 2120,
      backend: 'webgpu',
      threads: 1,
      spans: [{ start: 2000, end: 2120 }],
      gpuProfile,
      gpuMemoryBytes: 128 * 1048576,
    })
    setRenderSnapshot({
      hasRender: true,
      timerQuerySupported: true,
      triangles: measured(14800, 'triangles'),
      drawCalls: measured(4, 'calls'),
      submitMs: measured(1.4, 'ms'),
      gpuMs: measured(0.8, 'ms'),
    })

    render(
      <ActivityLogPanel
        resourcesDeps={{
          gpuInfo: async () => ({
            supported: true,
            timestampQuery: true,
            adapterName: measured('Apple M3 Pro'),
            architecture: measured('metal-3'),
            maxBufferBytes: measured(4294967296, 'B'),
          }),
        }}
      />,
    )
    act(() => openLog())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resources' })) })

    const tab = screen.getByTestId('resources-tab')
    // Стек из одной колонки на телефоне (390 px), три колонки от md
    expect(tab.querySelector('.grid-cols-1.md\\:grid-cols-3')).not.toBeNull()
    expect(within(tab).getByText('Apple M3 Pro')).toBeInTheDocument()
    expect(within(tab).getByText('metal-3')).toBeInTheDocument()
    expect(within(tab).getByText(/Conv2D_fp16/)).toBeInTheDocument()
    expect(within(tab).getAllByText('75 ms').length).toBeGreaterThanOrEqual(1)
    expect(within(tab).getByText('4 calls')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
