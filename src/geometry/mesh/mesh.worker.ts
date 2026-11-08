import { getWasm } from '../wasm'
import { analyze } from './analyze'
import { findIntersections } from './intersections'
import { weld } from './weld'
import { removeDegenerate } from './removeDegenerate'
import { fixOrientation } from './orient'
import { fillHoles } from './fillHoles'
import { removeShells } from './shells'
import { makeSolid } from './makeSolid'
import { autoRepair } from './autoRepair'
import { decimate } from './decimate'
import { smooth } from './smooth'
import { computeTopologySteps } from '../topology'
import type { IndexedMesh } from '../stl-import'

export type MeshWorkerRequest =
  | { kind: 'analyze'; id: number; mesh: IndexedMesh; options?: any }
  | { kind: 'intersections'; id: number; mesh: IndexedMesh; options?: any }
  | { kind: 'weld'; id: number; mesh: IndexedMesh; tolerance?: number }
  | { kind: 'removeDegenerate'; id: number; mesh: IndexedMesh }
  | { kind: 'fixOrientation'; id: number; mesh: IndexedMesh }
  | { kind: 'fillHoles'; id: number; mesh: IndexedMesh; options?: any }
  | { kind: 'removeShells'; id: number; mesh: IndexedMesh; options?: any }
  | { kind: 'makeSolid'; id: number; mesh: IndexedMesh; options?: any }
  | { kind: 'autoRepair'; id: number; mesh: IndexedMesh; options?: any }
  | { kind: 'decimate'; id: number; mesh: IndexedMesh; options?: any }
  | { kind: 'smooth'; id: number; mesh: IndexedMesh; options?: any }
  | { kind: 'topology'; id: number; mesh: IndexedMesh; options?: any }

export type MeshWorkerResponse =
  | { kind: 'progress'; id: number; fraction: number }
  | { kind: 'result'; id: number; data: any }
  | { kind: 'error'; id: number; error: string; code?: string }

/**
 * Creates an inline handler implementing the worker protocol.
 * Used in tests or when Web Worker is not available.
 */
export function createMeshHandler(wasmUrl?: string) {
  let wasmPromise = getWasm(wasmUrl)

  return async (
    msg: MeshWorkerRequest,
    postResponse: (res: MeshWorkerResponse, transfer?: Transferable[]) => void
  ) => {
    try {
      const { id, kind, mesh } = msg
      switch (kind) {
        case 'analyze': {
          const res = analyze(mesh, msg.options)
          postResponse({ kind: 'result', id, data: res })
          break
        }
        case 'intersections': {
          const res = findIntersections(mesh, {
            ...msg.options,
            onProgress: (fraction) => postResponse({ kind: 'progress', id, fraction }),
          })
          postResponse({ kind: 'result', id, data: res })
          break
        }
        case 'weld': {
          const res = weld(mesh, msg.tolerance)
          postResponse(
            { kind: 'result', id, data: res },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'removeDegenerate': {
          const res = removeDegenerate(mesh)
          postResponse(
            { kind: 'result', id, data: res },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'fixOrientation': {
          const res = fixOrientation(mesh)
          postResponse(
            { kind: 'result', id, data: res },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'fillHoles': {
          const res = fillHoles(mesh, msg.options)
          postResponse(
            { kind: 'result', id, data: res },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'removeShells': {
          const res = removeShells(mesh, msg.options)
          postResponse(
            { kind: 'result', id, data: res },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'makeSolid': {
          const w = await wasmPromise
          const res = makeSolid(w, mesh, msg.options)
          postResponse(
            { kind: 'result', id, data: { mesh: res.mesh, report: res.report } },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'autoRepair': {
          const w = await wasmPromise
          const res = autoRepair(mesh, { ...msg.options, w })
          postResponse(
            { kind: 'result', id, data: res },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'decimate': {
          const w = await wasmPromise
          const res = decimate(w, mesh, msg.options)
          postResponse(
            { kind: 'result', id, data: res },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'smooth': {
          const res = smooth(mesh, msg.options)
          postResponse(
            { kind: 'result', id, data: res },
            [res.mesh.vertProperties.buffer, res.mesh.triVerts.buffer]
          )
          break
        }
        case 'topology': {
          const topo = computeTopologySteps(mesh, msg.options ?? {}, (fraction) =>
            postResponse({ kind: 'progress', id, fraction })
          )
          postResponse({ kind: 'result', id, data: topo })
          break
        }
      }
    } catch (e: any) {
      postResponse({
        kind: 'error',
        id: msg.id,
        error: e instanceof Error ? e.message : String(e),
        code: e.name,
      })
    }
  }
}

// In worker environment
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  const handler = createMeshHandler()
  self.addEventListener('message', (e: MessageEvent<MeshWorkerRequest>) => {
    handler(e.data, (res, transfer) => {
      ;(self as any).postMessage(res, transfer ? { transfer } : undefined)
    })
  })
}
