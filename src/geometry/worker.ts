/// <reference lib="webworker" />
import wasmUrl from 'manifold-3d/manifold.wasm?url'
import { generate, registerDepth, registerImage, registerMatte, registerMesh, registerText } from './model'
import { transferablesOf } from './mesh'
import type { WorkerMessage, WorkerResponse } from './modelClient'

// Воркер владеет экземпляром WASM; Manifold-объекты наружу не выходят, только сетка.
self.addEventListener('message', async (e: MessageEvent<WorkerMessage>) => {
  if ('kind' in e.data) {
    if (e.data.kind === 'mesh') registerMesh(e.data.meshId, e.data.mesh)
    else if (e.data.kind === 'text') registerText(e.data.textId, e.data.raster)
    else if (e.data.kind === 'matte') registerMatte(e.data.matteId, e.data.matte)
    else if (e.data.kind === 'depth') registerDepth(e.data.depthId, e.data.depth)
    else registerImage(e.data.imageId, e.data.image)
    return
  }
  const { id, mode, params } = e.data
  try {
    const result = await generate(mode, params, wasmUrl)
    self.postMessage({ id, result } satisfies WorkerResponse, transferablesOf(result.parts.map((p) => p.mesh)))
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse)
  }
})
