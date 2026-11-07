import type { IndexedMesh, TriSoup } from '../stl-import'
import { weld } from './weld'
import {
  createMeshHandler,
  type MeshWorkerRequest,
  type MeshWorkerResponse,
} from './mesh.worker'
import type { MeshAnalysis, AnalyzeOptions } from './analyze'
import type { IntersectionResult, IntersectionOptions } from './intersections'
import type { WeldReport } from './weld'
import type { RemoveDegenerateReport } from './removeDegenerate'
import type { OrientReport } from './orient'
import type { FillHolesOptions, FillHolesReport } from './fillHoles'
import type { RemoveShellsOptions, RemoveShellsReport } from './shells'
import type { MakeSolidOptions, MakeSolidReport } from './makeSolid'
import type { AutoRepairOptions, AutoRepairResult } from './autoRepair'
import type { DecimateOptions, DecimateReport } from './decimate'
import type { SmoothOptions, SmoothReport } from './smooth'

export class MeshSupersededError extends Error {
  constructor() {
    super('superseded')
    this.name = 'MeshSupersededError'
  }
}

export type MeshLane = 'analyze' | 'intersections' | 'repair'

export interface MeshWorkerLike {
  postMessage(msg: MeshWorkerRequest, transfer?: Transferable[]): void
  addEventListener(type: 'message', cb: (e: { data: MeshWorkerResponse }) => void): void
  addEventListener(type: 'error', cb: (e: { message?: string }) => void): void
  terminate?(): void
}

interface PendingJob<T> {
  resolve: (val: T) => void
  reject: (err: Error) => void
  lane: MeshLane
  onProgress?: (fraction: number) => void
}

/**
 * Client for async mesh operations.
 * Lanes: 'analyze', 'intersections', 'repair'.
 * Latest request wins per lane, earlier ones are rejected with MeshSupersededError.
 * In environments without Web Worker (tests/Node), falls back to inline handler.
 */
export class MeshClient {
  private worker: MeshWorkerLike | null | undefined
  private inlineHandler = createMeshHandler()
  private nextId = 1
  private latestInLane: Record<MeshLane, number> = {
    analyze: 0,
    intersections: 0,
    repair: 0,
  }
  private pending = new Map<number, PendingJob<any>>()

  constructor(private factory: () => MeshWorkerLike | null = () => null) {}

  private get w(): MeshWorkerLike | null {
    if (this.worker === undefined) {
      this.worker = this.factory()
      this.worker?.addEventListener('message', (e) => this.onMessage(e.data))
      this.worker?.addEventListener('error', (e) =>
        this.failAll(new Error(e.message || 'Worker error'))
      )
    }
    return this.worker
  }

  private send(msg: MeshWorkerRequest) {
    const w = this.w
    if (w) {
      w.postMessage(msg, [msg.mesh.vertProperties.buffer, msg.mesh.triVerts.buffer])
    } else {
      // Inline microtask execution
      queueMicrotask(() => {
        this.inlineHandler(msg, (res) => this.onMessage(res))
      })
    }
  }

  private request<T>(
    lane: MeshLane,
    build: (id: number) => MeshWorkerRequest,
    onProgress?: (fraction: number) => void
  ): Promise<T> {
    const id = this.nextId++
    this.latestInLane[lane] = id

    // Cancel older pending jobs in this lane
    for (const [oldId, job] of this.pending) {
      if (job.lane === lane && oldId < id) {
        job.reject(new MeshSupersededError())
        this.pending.delete(oldId)
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, lane, onProgress })
      this.send(build(id))
    })
  }

  private onMessage(res: MeshWorkerResponse) {
    const job = this.pending.get(res.id)
    if (!job) return

    if (res.kind === 'progress') {
      job.onProgress?.(res.fraction)
      return
    }

    this.pending.delete(res.id)

    if (res.id !== this.latestInLane[job.lane]) {
      job.reject(new MeshSupersededError())
      return
    }

    if (res.kind === 'error') {
      const err = new Error(res.error)
      if (res.code) err.name = res.code
      job.reject(err)
    } else {
      job.resolve(res.data)
    }
  }

  private failAll(err: Error) {
    for (const job of this.pending.values()) {
      job.reject(err)
    }
    this.pending.clear()
  }

  private ensureIndexed(mesh: TriSoup | IndexedMesh): IndexedMesh {
    return 'triVerts' in mesh ? mesh : weld(mesh).mesh
  }

  analyze(mesh: TriSoup | IndexedMesh, options?: AnalyzeOptions): Promise<MeshAnalysis> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('analyze', (id) => ({ kind: 'analyze', id, mesh: indexed, options }))
  }

  findIntersections(
    mesh: TriSoup | IndexedMesh,
    options?: IntersectionOptions
  ): Promise<IntersectionResult> {
    const indexed = this.ensureIndexed(mesh)
    return this.request(
      'intersections',
      (id) => ({ kind: 'intersections', id, mesh: indexed, options }),
      options?.onProgress
    )
  }

  weld(mesh: TriSoup | IndexedMesh, tolerance?: number): Promise<{ mesh: IndexedMesh; report: WeldReport }> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'weld', id, mesh: indexed, tolerance }))
  }

  removeDegenerate(mesh: TriSoup | IndexedMesh): Promise<{ mesh: IndexedMesh; report: RemoveDegenerateReport }> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'removeDegenerate', id, mesh: indexed }))
  }

  fixOrientation(mesh: TriSoup | IndexedMesh): Promise<{ mesh: IndexedMesh; report: OrientReport }> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'fixOrientation', id, mesh: indexed }))
  }

  fillHoles(
    mesh: TriSoup | IndexedMesh,
    options?: FillHolesOptions
  ): Promise<{ mesh: IndexedMesh; report: FillHolesReport }> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'fillHoles', id, mesh: indexed, options }))
  }

  removeShells(
    mesh: TriSoup | IndexedMesh,
    options?: RemoveShellsOptions
  ): Promise<{ mesh: IndexedMesh; report: RemoveShellsReport }> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'removeShells', id, mesh: indexed, options }))
  }

  makeSolid(
    mesh: TriSoup | IndexedMesh,
    options?: MakeSolidOptions
  ): Promise<{ mesh: IndexedMesh; report: MakeSolidReport }> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'makeSolid', id, mesh: indexed, options }))
  }

  autoRepair(
    mesh: TriSoup | IndexedMesh,
    options?: AutoRepairOptions
  ): Promise<AutoRepairResult> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'autoRepair', id, mesh: indexed, options }))
  }

  decimate(
    mesh: TriSoup | IndexedMesh,
    options?: DecimateOptions
  ): Promise<{ mesh: IndexedMesh; report: DecimateReport }> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'decimate', id, mesh: indexed, options }))
  }

  smooth(
    mesh: TriSoup | IndexedMesh,
    options?: SmoothOptions
  ): Promise<{ mesh: IndexedMesh; report: SmoothReport }> {
    const indexed = this.ensureIndexed(mesh)
    return this.request('repair', (id) => ({ kind: 'smooth', id, mesh: indexed, options }))
  }

  cancel(lane?: MeshLane) {
    if (lane) {
      for (const [id, job] of this.pending) {
        if (job.lane === lane) {
          job.reject(new MeshSupersededError())
          this.pending.delete(id)
        }
      }
    } else {
      this.failAll(new MeshSupersededError())
    }
  }

  dispose() {
    this.worker?.terminate?.()
    this.worker = null
    this.failAll(new MeshSupersededError())
  }
}
