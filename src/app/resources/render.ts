import { getDiagnostics } from './diagnostics'
import { measured, unavailable, type ResourceValue } from './types'

export interface DisjointTimerExtLike {
  TIME_ELAPSED_EXT: number
  GPU_DISJOINT_EXT: number
}

export interface WebGL2ContextLike {
  QUERY_RESULT: number
  QUERY_RESULT_AVAILABLE: number
  getExtension?(name: 'EXT_disjoint_timer_query_webgl2'): DisjointTimerExtLike | null
  createQuery?(): unknown
  deleteQuery?(q: unknown): void
  beginQuery?(target: number, q: unknown): void
  endQuery?(target: number): void
  getQueryParameter?(q: unknown, pname: number): unknown
  getParameter?(pname: number): unknown
}

export interface RendererInfoLike {
  render: { triangles: number; calls: number }
  memory?: { geometries: number; textures: number }
}

export interface RendererLike {
  info: RendererInfoLike
  getContext?(): WebGL2ContextLike | null
}

export interface RenderSnapshot {
  hasRender: boolean
  timerQuerySupported: boolean
  triangles: ResourceValue<number | null>
  drawCalls: ResourceValue<number | null>
  submitMs: ResourceValue<number | null>
  gpuMs: ResourceValue<number | null>
}

export interface RenderMonitorDeps {
  diagnostics?: () => boolean
  now?: () => number
}

const initialSnapshot = (): RenderSnapshot => ({
  hasRender: false,
  timerQuerySupported: false,
  triangles: unavailable('resources.unavailable.noRender'),
  drawCalls: unavailable('resources.unavailable.noRender'),
  submitMs: unavailable('resources.unavailable.noRender'),
  gpuMs: unavailable('resources.unavailable.diagnosticsOff'),
})

let latestRender: RenderSnapshot = initialSnapshot()
const listeners = new Set<() => void>()

export function getRenderSnapshot(): RenderSnapshot {
  return latestRender
}

export function setRenderSnapshot(s: RenderSnapshot): void {
  latestRender = s
  listeners.forEach((l) => l())
}

export function subscribeRenderSnapshot(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function resetRenderSnapshot(): void {
  latestRender = initialSnapshot()
  listeners.forEach((l) => l())
}

/**
 * Обёртка вокруг отрисовки вьюпорта: снимает `renderer.info` (треугольники и вызовы отрисовки),
 * время подачи кадра на CPU и — только когда включён режим диагностики и доступно расширение
 * `EXT_disjoint_timer_query_webgl2` — GPU-время последнего кадра (при флаге disjoint результат отбрасывается).
 */
export function createRenderMonitor(renderer: RendererLike, deps: RenderMonitorDeps = {}) {
  const isDiag = deps.diagnostics ?? getDiagnostics
  const now = deps.now ?? (() => performance.now())
  const gl = renderer.getContext?.() ?? null
  const ext = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null
  const timerQuerySupported = Boolean(gl && ext && gl.createQuery && gl.beginQuery && gl.endQuery && gl.getQueryParameter && gl.getParameter)

  let pendingQuery: unknown = null
  let activeThisFrame = false
  let t0 = 0
  let lastTriangles = 0
  let lastCalls = 0
  let lastSubmitMs = 0
  let lastGpuMs: ResourceValue<number | null> = timerQuerySupported
    ? unavailable('resources.unavailable.diagnosticsOff')
    : unavailable('resources.unavailable.timerQuery')
  let hasRendered = false

  const pollPending = () => {
    if (!gl || !ext || !pendingQuery) return
    const avail = Boolean(gl.getQueryParameter!(pendingQuery, gl.QUERY_RESULT_AVAILABLE))
    const disjoint = Boolean(gl.getParameter!(ext.GPU_DISJOINT_EXT))
    if (!avail) return
    if (disjoint) {
      lastGpuMs = unavailable('resources.unavailable.timerDisjoint')
    } else {
      const ns = Number(gl.getQueryParameter!(pendingQuery, gl.QUERY_RESULT))
      lastGpuMs = measured(ns / 1e6, 'ms')
    }
    gl.deleteQuery?.(pendingQuery)
    pendingQuery = null
  }

  const emit = (): RenderSnapshot => {
    if (!hasRendered) {
      return {
        hasRender: false,
        timerQuerySupported,
        triangles: unavailable('resources.unavailable.noRender'),
        drawCalls: unavailable('resources.unavailable.noRender'),
        submitMs: unavailable('resources.unavailable.noRender'),
        gpuMs: !timerQuerySupported
          ? unavailable('resources.unavailable.timerQuery')
          : !isDiag()
            ? unavailable('resources.unavailable.diagnosticsOff')
            : lastGpuMs,
      }
    }
    const gpuVal: ResourceValue<number | null> = !timerQuerySupported
      ? unavailable('resources.unavailable.timerQuery')
      : !isDiag()
        ? unavailable('resources.unavailable.diagnosticsOff')
        : lastGpuMs
    const snap: RenderSnapshot = {
      hasRender: true,
      timerQuerySupported,
      triangles: measured(lastTriangles, 'triangles'),
      drawCalls: measured(lastCalls, 'calls'),
      submitMs: measured(lastSubmitMs, 'ms'),
      gpuMs: gpuVal,
    }
    setRenderSnapshot(snap)
    return snap
  }

  return {
    get timerQuerySupported() { return timerQuerySupported },

    beforeRender() {
      activeThisFrame = false
      if (timerQuerySupported && isDiag()) {
        pollPending()
        if (!pendingQuery && gl && ext) {
          const q = gl.createQuery!()
          if (q) {
            pendingQuery = q
            activeThisFrame = true
            gl.beginQuery!(ext.TIME_ELAPSED_EXT, q)
          }
        }
      } else if (pendingQuery && gl) {
        gl.deleteQuery?.(pendingQuery)
        pendingQuery = null
      }
      t0 = now()
    },

    afterRender(): RenderSnapshot {
      lastSubmitMs = Math.max(0, now() - t0)
      if (activeThisFrame && gl && ext) {
        gl.endQuery!(ext.TIME_ELAPSED_EXT)
        activeThisFrame = false
      }
      lastTriangles = renderer.info.render.triangles
      lastCalls = renderer.info.render.calls
      hasRendered = true
      if (timerQuerySupported && isDiag()) pollPending()
      return emit()
    },

    poll(): RenderSnapshot {
      if (timerQuerySupported && isDiag()) pollPending()
      return emit()
    },

    dispose() {
      if (pendingQuery && gl) {
        gl.deleteQuery?.(pendingQuery)
        pendingQuery = null
      }
    },
  }
}
