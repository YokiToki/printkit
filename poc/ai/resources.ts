/**
 * Одноразовая панель ресурсов для PoC (change 37, task 1.1):
 * замеряет wall time, долю занятости воркера, блокировку главного потока (longtask / long-animation-frame),
 * уровни Compute Pressure, adapter.info, профилирование ядер WebGPU в ORT Web 1.30 (`env.webgpu.profiling`),
 * накладные расходы профилирования (прогон без/с профилированием) и `renderer.info` + `EXT_disjoint_timer_query_webgl2` для 3D.
 */
import type * as THREE from 'three'

export interface KernelSample {
  kernelType: string
  kernelName: string
  programName: string
  startTime: number // нс
  endTime: number   // нс
}

export interface KernelSummary {
  gpuMs: number
  count: number
  slowest: { name: string; type: string; ms: number; calls: number }[]
}

/** Агрегация таймингов ядер WebGPU (время в наносекундах от ORT Web `env.webgpu.profiling.ondata`). */
export function summarizeKernels(samples: readonly KernelSample[]): KernelSummary {
  let gpuNs = 0
  const byOp = new Map<string, { name: string; type: string; ns: number; calls: number }>()
  for (const s of samples) {
    const dt = Math.max(0, s.endTime - s.startTime)
    gpuNs += dt
    const key = `${s.kernelType}|${s.programName || s.kernelName}`
    const prev = byOp.get(key) ?? { name: s.programName || s.kernelName || s.kernelType, type: s.kernelType, ns: 0, calls: 0 }
    prev.ns += dt; prev.calls++
    byOp.set(key, prev)
  }
  const slowest = [...byOp.values()]
    .sort((a, b) => b.ns - a.ns)
    .slice(0, 5)
    .map((x) => ({ name: x.name, type: x.type, ms: x.ns / 1e6, calls: x.calls }))
  return { gpuMs: gpuNs / 1e6, count: samples.length, slowest }
}

interface LongTaskWindow { t: number; d: number }
const longTasks: LongTaskWindow[] = []
let pressureLevel = 'unavailable'
const pressureMs: Record<string, number> = {}
let lastPressureAt = 0

function initObservers() {
  if (typeof PerformanceObserver !== 'undefined') {
    const supported = PerformanceObserver.supportedEntryTypes ?? []
    const type = supported.includes('longtask') ? 'longtask' : supported.includes('long-animation-frame') ? 'long-animation-frame' : null
    if (type) {
      const obs = new PerformanceObserver((list) => {
        const now = performance.now()
        for (const e of list.getEntries()) longTasks.push({ t: now, d: e.duration })
      })
      obs.observe({ type, buffered: true })
    }
  }
  const PO = (globalThis as unknown as { PressureObserver?: new (cb: (recs: { state: string }[]) => void, opts?: { sampleInterval?: number }) => { observe(s: string): Promise<void> } }).PressureObserver
  if (PO) {
    pressureLevel = 'nominal'
    lastPressureAt = performance.now()
    const obs = new PO((recs) => {
      const now = performance.now(), last = recs[recs.length - 1]
      if (!last) return
      if (lastPressureAt > 0) pressureMs[pressureLevel] = (pressureMs[pressureLevel] ?? 0) + (now - lastPressureAt)
      pressureLevel = last.state; lastPressureAt = now
    }, { sampleInterval: 500 })
    obs.observe('cpu').catch(() => { pressureLevel = 'unavailable' })
  }
}

export function resetPressureWindow() {
  for (const k of Object.keys(pressureMs)) delete pressureMs[k]
  lastPressureAt = performance.now()
}

export function readPressureSummary(): string {
  if (pressureLevel === 'unavailable') return 'недоступно'
  const now = performance.now()
  const snap = { ...pressureMs }
  if (lastPressureAt > 0) snap[pressureLevel] = (snap[pressureLevel] ?? 0) + (now - lastPressureAt)
  const parts = Object.entries(snap).map(([k, v]) => `${k}: ${(v / 1000).toFixed(1)} с`)
  return `${pressureLevel}${parts.length ? ` (${parts.join(', ')})` : ''}`
}

export function readLongTasks(windowMs = 10000): { blockedPct: number; longestMs: number; supported: boolean } {
  const supported = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes ?? []).some((t) => t === 'longtask' || t === 'long-animation-frame')
  if (!supported) return { blockedPct: 0, longestMs: 0, supported: false }
  const cutoff = performance.now() - windowMs
  while (longTasks.length && longTasks[0].t < cutoff) longTasks.shift()
  let sum = 0, max = 0
  for (const x of longTasks) { sum += x.d; if (x.d > max) max = x.d }
  return { blockedPct: Math.min(100, (sum / windowMs) * 100), longestMs: max, supported: true }
}

/** Таймер-запрос WebGL2 (`EXT_disjoint_timer_query_webgl2`) + `renderer.info` для 3D-сцены PoC. */
export function attachRenderMonitor(renderer: THREE.WebGLRenderer, onUpdate: (line: string) => void) {
  const gl = renderer.getContext() as WebGL2RenderingContext
  const ext = gl.getExtension?.('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number
    GPU_DISJOINT_EXT: number
  } | null
  let pending: WebGLQuery | null = null
  let lastGpuMs: number | null = null
  let lastSubmitMs = 0

  return {
    beforeRender(): number {
      if (ext && pending) {
        const avail = gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
        if (avail) {
          if (!disjoint) lastGpuMs = Number(gl.getQueryParameter(pending, gl.QUERY_RESULT)) / 1e6
          gl.deleteQuery(pending); pending = null
        }
      }
      if (ext && !pending) {
        const q = gl.createQuery()
        if (q) { pending = q; gl.beginQuery(ext.TIME_ELAPSED_EXT, q) }
      }
      return performance.now()
    },
    afterRender(t0: number) {
      lastSubmitMs = performance.now() - t0
      if (ext && pending) gl.endQuery(ext.TIME_ELAPSED_EXT)
      const r = renderer.info.render, m = renderer.info.memory
      const gpuStr = ext ? (lastGpuMs !== null ? `${lastGpuMs.toFixed(2)} мс (measured)` : 'ожидание...') : 'недоступно'
      onUpdate(`3D кадр: треуг. ${r.triangles}, вызовов ${r.calls}, геом. ${m.geometries}, текст. ${m.textures} | CPU submit ${lastSubmitMs.toFixed(2)} мс | GPU ${gpuStr}`)
    },
  }
}

export interface RunRecord {
  model: string
  ep: string
  threads: number
  profiling: boolean
  wallMs: number
  busyMs: number
  gpuMs: number | null
  kernels: KernelSummary | null
  pressure: string
  blockedPct: number
  longestBlockMs: number
}

const history: RunRecord[] = []
let panelEl: HTMLElement | null = null
let renderLine = '3D кадр: —'
let adapterLine = 'WebGPU адаптер: проверка...'

export function isProfilingEnabled(): boolean {
  return (document.getElementById('poc-prof') as HTMLInputElement | null)?.checked ?? false
}

export function selectedThreads(): number {
  return +((document.getElementById('poc-threads') as HTMLSelectElement | null)?.value ?? '1') || 1
}

export function recordRun(rec: RunRecord) {
  history.unshift(rec)
  if (history.length > 12) history.pop()
  renderPanel()
}

function renderPanel() {
  if (!panelEl) return
  const lt = readLongTasks(10000)
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  const heapStr = mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(1)} МБ (measured)` : 'недоступно'
  const ltStr = lt.supported ? `блок главного потока за 10 с: ${lt.blockedPct.toFixed(1)} %, макс. ${lt.longestMs.toFixed(0)} мс` : 'Long Tasks: недоступно'
  const rows = history.map((r) => {
    const busyShare = r.wallMs > 0 ? Math.min(1, r.busyMs / r.wallMs) : 1
    const coreEq = Math.min(r.threads, busyShare * r.threads)
    const gpuPart = r.gpuMs !== null ? ` | GPU ${r.gpuMs.toFixed(0)} мс (${((r.gpuMs / r.wallMs) * 100).toFixed(0)}% wall)` : ''
    const topK = r.kernels?.slowest.length ? `\n    топ-ядра: ${r.kernels.slowest.map((k) => `${k.name} ${k.ms.toFixed(1)}мс×${k.calls}`).join(', ')}` : ''
    return `• ${r.model} [${r.ep}${r.ep === 'wasm' ? `×${r.threads}` : ''}${r.profiling ? ', prof' : ''}]: wall ${r.wallMs.toFixed(0)} мс, busy ${(busyShare * 100).toFixed(0)}% (~${coreEq.toFixed(1)} ядра, est.)${gpuPart} | CPU pressure: ${r.pressure}${topK}`
  }).join('\n')
  const body = panelEl.querySelector('#poc-res-body') as HTMLElement | null
  if (body) {
    body.textContent = [
      `${adapterLine} | JS Heap: ${heapStr}`,
      `CPU pressure: ${readPressureSummary()} | ${ltStr}`,
      renderLine,
      history.length ? 'Последние запуски ИИ:\n' + rows : 'Запусков ИИ ещё не было.',
    ].join('\n')
  }
}

export function mountResourcesPanel(renderer: THREE.WebGLRenderer) {
  initObservers()
  const sec = document.createElement('section')
  sec.style.marginTop = '8px'
  sec.innerHTML = `
    <h4>Ресурсы (PoC 37, 1.1)</h4>
    <div>
      <label>потоки WASM <select id="poc-threads"><option value="1">1</option><option value="4">4 (нужен COOP/COEP)</option></select></label>
      <label><input id="poc-prof" type="checkbox"> профилирование WebGPU (timestamp-query, замедляет)</label>
    </div>
    <pre id="poc-res-body" style="margin:4px 0 0;white-space:pre-wrap;font:11px ui-monospace,monospace;background:#f8f8f5;border:1px solid #ddd;padding:6px"></pre>
  `
  const right = document.getElementById('right')
  const logBox = document.getElementById('log')
  if (right && logBox) right.insertBefore(sec, logBox)
  panelEl = sec

  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; device?: string; description?: string }; features: Set<string>; limits: { maxBufferSize?: number } } | null> } }).gpu
  if (gpu) {
    gpu.requestAdapter().then((a) => {
      if (!a) { adapterLine = 'WebGPU адаптер: недоступен'; renderPanel(); return }
      const inf = a.info ?? {}
      const ts = a.features.has('timestamp-query') ? 'timestamp-query: да' : 'timestamp-query: нет'
      const maxBuf = a.limits?.maxBufferSize ? `, maxBuffer ${(a.limits.maxBufferSize / 1048576).toFixed(0)} МБ` : ''
      adapterLine = `WebGPU: ${[inf.vendor, inf.architecture, inf.device, inf.description].filter(Boolean).join(' / ') || 'adapter'} (${ts}${maxBuf})`
      renderPanel()
    }).catch(() => { adapterLine = 'WebGPU адаптер: ошибка'; renderPanel() })
  } else {
    adapterLine = 'WebGPU: не поддерживается браузером'
  }

  const mon = attachRenderMonitor(renderer, (line) => { renderLine = line; renderPanel() })
  setInterval(renderPanel, 1000)
  renderPanel()
  return mon
}
