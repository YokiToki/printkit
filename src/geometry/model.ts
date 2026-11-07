import { buildBaseplateParts, type BaseplateGeometry } from './baseplate'
import { buildBox, type BoxParams } from './box'
import { buildRackCase, type RackCaseParams } from './rack/case'
import { buildRackPanel, type RackPanelParams } from './rack/panel'
import { buildRackShelf, type RackShelfParams } from './rack/shelf'
import type { Issue } from './rack/patterns/types'
import type { Assembly } from './keychainAssembly'
import { buildKeychainSheet, type ImageRegistry, type KeychainInfo, type KeychainParams, type Matte, type MatteRegistry } from './keychain'
import type { GrayImage } from './raster/threshold'
import type { TextRaster, TextRegistry } from './text'
import { buildCutout, buildCutoutTools, type CutoutParams, type MeshRegistry } from './cutout'
import type { IndexedMesh } from './stl-import'
import { getWasm } from './wasm'
import { meshBounds, meshOf, type MeshData } from './mesh'
import { buildPrimitiveManifold } from '../editor/primitives'
import { matrixOf, type EditorObject, type Mat4, type ObjectSource, type Transform } from '../editor/scene'
import type { Sketch } from '../editor/sketch/model'
import type { Op } from '../editor/stack'
import { featureToOp } from '../editor/stack'
import { topologicalOrder } from '../editor/graph'
import { meshHealth } from '../editor/health'
import { toManifold } from './stl-import'
import { evaluateStack, PrefixCache, type ToolObjectInfo } from './features/evaluate'
import type { CutGroup, CutPartSource } from '../editor/cuts'
import { evaluateCutGroup, type EvaluatedGroupResult } from './cut/groupEval'

export interface EditorObjectParam {
  id: string
  name?: string
  visible?: boolean
  locked?: boolean
  color?: number
  source: ObjectSource
  transform?: Transform
  matrix?: Mat4
  stack?: Op[]
  rollback?: number | null
}

export interface EditorModelParams {
  objects: EditorObjectParam[]
  sketches?: Sketch[]
  cuts?: CutGroup[]
  quality?: 'coarse' | 'fine'
}

export interface OpStatus {
  opId: string
  status: 'ok' | 'failed'
  reason?: string
  params?: Record<string, string | number>
}

export interface ObjectStatus {
  objectId: string
  ops: OpStatus[]
  error?: string
}

export interface EditorInfo {
  statuses: Record<string, ObjectStatus>
}

/** Кэш полигональных сеток примитивов по (форма, параметры). */
export const primitiveMeshCache = new Map<string, MeshData>()
/** Кэш полигональных сеток тел из фич эскизов. */
export const featureMeshCache = new Map<string, MeshData>()
/** Префиксный кэш стека операций редактора. */
export const editorPrefixCache = new PrefixCache(6_000_000)

function copyMeshData(m: MeshData): MeshData {
  return {
    ...m,
    vertProperties: new Float32Array(m.vertProperties),
    triVerts: new Uint32Array(m.triVerts),
  }
}

/** Параметры по режимам. Новые режимы (box, cutout) добавляются сюда. */
export interface ModeParams {
  baseplate: BaseplateGeometry
  box: BoxParams
  cutout: CutoutParams
  keychain: KeychainParams
  rackPanel: RackPanelParams
  rackCase: RackCaseParams
  rackShelf: RackShelfParams
  editor: EditorModelParams
}

/** Импортированные сетки этого потока (воркера): вырезы ссылаются на них по id. */
export const meshRegistry: MeshRegistry = new Map()
export const registerMesh = (id: string, mesh: IndexedMesh) => { meshRegistry.set(id, mesh) }
/** Изображения Keychain в этом потоке (воркере): параметры ссылаются на них по id. */
export const imageRegistry: ImageRegistry = new Map()
export const registerImage = (id: string, image: GrayImage) => { imageRegistry.set(id, image) }
/** Растры надписей Keychain в этом потоке (воркере): параметры ссылаются на них по maskId. */
export const matteRegistry: MatteRegistry = new Map()
export const registerMatte = (id: string, matte: Matte) => { matteRegistry.set(id, matte) }

export const depthRegistry: MatteRegistry = new Map()
export const registerDepth = (id: string, depth: Matte) => { depthRegistry.set(id, depth) }

export const textRegistry: TextRegistry = new Map()
export const registerText = (id: string, raster: TextRaster) => { textRegistry.set(id, raster) }
export type ModeId = keyof ModeParams

/** Одна часть модели: сетка и описание для превью. Без разделения часть одна (A1). */
export interface PartMesh { label: string; col: number; row: number; oversize: boolean; mesh: MeshData }
/** Вырезающий инструмент: только для превью, не часть модели (габариты, объём и экспорт его не учитывают). */
export interface ToolMesh { id: string; name: string; /** Индекс цвета выреза в палитре (одинаков в списке, виде сверху и 3D). */ color: number; mesh: MeshData }
export interface ModelResult { parts: PartMesh[]; tools?: ToolMesh[]; /** Только у rackPanel: ключ ошибки (модели нет) и замечания о тонком. */ rack?: { error?: string; /** Только rackCase при rack.error.tooWide: на сколько мм корпус шире окна между рейками. */ excess?: number; warnings: Issue[] }; /** Только у keychain: сведения о силуэте и размерах, ошибка построения. */ keychain?: KeychainInfo; /** Детали уже стоят на листе печати: экспорт сохраняет их взаимное положение, а не раскладывает заново. */ sheetLayout?: boolean; /** Только у keychain в режиме половин: матрицы 4×4 (по столбцам) для собранного вида по подписям деталей. */ assembly?: Assembly; editor?: EditorInfo }

/** Габариты всей модели в собранных координатах. */
export function modelBounds(r: ModelResult): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const p of r.parts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.mesh.min[k]); max[k] = Math.max(max[k], p.mesh.max[k]) }
  return { min, max }
}

/** Единая точка генерации: режим + параметры → части модели. Работает и в воркере, и в тестах. */
export async function generate<M extends ModeId>(mode: M, params: ModeParams[M], wasmUrl?: string): Promise<ModelResult> {
  switch (mode) {
    case 'baseplate': {
      const built = await buildBaseplateParts(params as BaseplateGeometry, wasmUrl)
      const parts = built.map(({ part, solid }) => {
        try { return { label: part.label, col: part.col, row: part.row, oversize: part.oversize, mesh: meshOf(solid) } } finally { solid.delete() }
      })
      return { parts }
    }
    case 'box': {
      const m = await buildBox(params as BoxParams, wasmUrl)
      try { return { parts: [{ label: 'A1', col: 0, row: 0, oversize: false, mesh: meshOf(m) }] } } finally { m.delete() }
    }
    case 'cutout': {
      const m = await buildCutout(params as CutoutParams, meshRegistry, wasmUrl)
      const tools = buildCutoutTools(await getWasm(wasmUrl), params as CutoutParams, meshRegistry)
      try {
        return { parts: [{ label: 'A1', col: 0, row: 0, oversize: false, mesh: meshOf(m) }], tools: tools.map((t) => ({ id: t.id, name: t.name, color: t.color, mesh: t.mesh })) }
      } finally { m.delete() }
    }
    case 'keychain': {
      const { parts, info, assembly } = await buildKeychainSheet(params as KeychainParams, imageRegistry, wasmUrl, textRegistry, matteRegistry, depthRegistry)
      try {
        return { parts: parts.map((q) => ({ label: q.label, col: q.col, row: q.row, oversize: false, mesh: meshOf(q.solid) })), keychain: info, ...(parts.length > 1 ? { sheetLayout: true } : {}), ...(assembly ? { assembly } : {}) }
      } finally { parts.forEach((q) => q.solid.delete()) }
    }
    case 'rackPanel': {
      const built = await buildRackPanel(params as RackPanelParams, wasmUrl)
      const rack = { ...(built.error ? { error: built.error } : {}), warnings: built.warnings }
      const parts: PartMesh[] = []
      try {
        if (built.panel) parts.push({ label: 'panel', col: 0, row: 0, oversize: false, mesh: meshOf(built.panel) })
        if (built.back) parts.push({ label: 'back', col: 1, row: 0, oversize: false, mesh: meshOf(built.back) })
        return { parts, rack }
      } finally { built.panel?.delete(); built.back?.delete() }
    }
    case 'rackCase': {
      const built = await buildRackCase(params as RackCaseParams, wasmUrl)
      const rack = { ...(built.error ? { error: built.error } : {}), ...(built.excess ? { excess: built.excess } : {}), warnings: built.warnings }
      try { return { parts: built.solid ? [{ label: 'case', col: 0, row: 0, oversize: false, mesh: meshOf(built.solid) }] : [], rack } } finally { built.solid?.delete() }
    }
    case 'rackShelf': {
      const built = await buildRackShelf(params as RackShelfParams, wasmUrl)
      const rack = { ...(built.error ? { error: built.error } : {}), warnings: built.warnings }
      try { return { parts: built.solid ? [{ label: 'shelf', col: 0, row: 0, oversize: false, mesh: meshOf(built.solid) }] : [], rack } } finally { built.solid?.delete() }
    }
    case 'editor': {
      const p = params as EditorModelParams
      const w = await getWasm(wasmUrl)
      const parts: PartMesh[] = []
      const tools: ToolMesh[] = []
      const statuses: Record<string, ObjectStatus> = {}

      const editorObjs: EditorObject[] = p.objects.map((o) => {
        let stack = o.stack ?? []
        let source = o.source
        if (o.source.kind === 'feature') {
          stack = [...o.source.features.map(featureToOp), ...stack]
          source = { kind: 'empty' }
        }
        return {
          id: o.id,
          name: o.name ?? o.id,
          visible: o.visible ?? true,
          locked: o.locked ?? false,
          color: o.color ?? 0,
          source,
          transform: o.transform ?? { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          stack,
          rollback: o.rollback,
        }
      })

      // Find tool objects used by enabled boolean ops
      const toolUsage = new Set<string>()
      for (const o of editorObjs) {
        for (const op of o.stack ?? []) {
          if (op.enabled && op.kind === 'boolean') {
            for (const t of (op as any).params.tools ?? []) {
              toolUsage.add(t)
            }
          }
        }
      }

      const topo = topologicalOrder(editorObjs, p.cuts)
      if (topo.cycle) {
        for (const cid of topo.cycle) {
          statuses[cid] = {
            objectId: cid,
            error: 'stack.error.cycle',
            ops: (editorObjs.find((o) => o.id === cid)?.stack ?? []).map((op) => ({
              opId: op.id,
              status: 'failed',
              reason: 'stack.error.cycle',
            })),
          }
        }
      }

      const evaluatedTools = new Map<string, ToolObjectInfo>()
      const evaluatedSolids = new Map<string, any>()
      const activeGroupResults = new Map<string, EvaluatedGroupResult>()

      for (const obj of topo.order) {
        const oParam = p.objects.find((o) => o.id === obj.id)
        const objMatrix = oParam?.matrix ?? matrixOf(obj.transform)

        let baseSolid: any = null
        let meshH: any = undefined
        let partOversize = false

        if (obj.source.kind === 'primitive') {
          baseSolid = buildPrimitiveManifold(w, obj.source.shape, obj.source.params)
        } else if (obj.source.kind === 'mesh') {
          const indexed = meshRegistry.get(obj.source.meshId)
          if (indexed) {
            meshH = meshHealth(indexed)
            try {
              baseSolid = toManifold(w, indexed)
            } catch {
              baseSolid = null
            }
          }
        } else if (obj.source.kind === 'cutPart') {
          const cutSource = obj.source as CutPartSource
          const group = p.cuts?.find((c) => c.id === cutSource.groupId)
          if (group) {
            if (!activeGroupResults.has(group.id)) {
              const srcSolid = evaluatedSolids.get(group.sourceObjectId)
              if (srcSolid) {
                const srcObj = p.objects.find((o) => o.id === group.sourceObjectId)
                const srcSig = JSON.stringify({
                  source: srcObj?.source,
                  stack: srcObj?.stack,
                  rollback: srcObj?.rollback,
                })
                const res = await evaluateCutGroup(w, srcSolid, group, srcSig)
                activeGroupResults.set(group.id, res)
              }
            }
            const groupRes = activeGroupResults.get(group.id)
            if (groupRes && cutSource.partIndex < groupRes.parts.length) {
              const evaluatedPart = groupRes.parts[cutSource.partIndex]
              baseSolid = evaluatedPart.solid.asOriginal()
              partOversize = !!evaluatedPart.oversize
            }
          }
        }

        const cutGroupForObj =
          obj.source.kind === 'cutPart'
            ? p.cuts?.find((c) => c.id === (obj.source as any).groupId)
            : undefined
        const cutSrcObj = cutGroupForObj
          ? p.objects.find((o) => o.id === cutGroupForObj.sourceObjectId)
          : undefined

        const sourceKey = JSON.stringify({
          source: obj.source,
          sketches: obj.source.kind === 'feature' ? p.sketches : undefined,
          cutGroup: cutGroupForObj,
          cutSource: cutSrcObj
            ? { source: cutSrcObj.source, stack: cutSrcObj.stack, rollback: cutSrcObj.rollback }
            : undefined,
        })

        const evalRes = await evaluateStack(baseSolid, obj.stack ?? [], obj.rollback, {
          w,
          targetId: obj.id,
          sourceKey,
          targetMatrix: objMatrix,
          sketches: p.sketches,
          quality: p.quality,
          toolObjects: evaluatedTools,
          cache: editorPrefixCache,
        })

        if (baseSolid) {
          baseSolid.delete()
        }

        if (evalRes.failedIndex !== undefined) {
          console.warn(`[stack] Object ${obj.id} op ${evalRes.failedOpId} failed: ${evalRes.failedReason}`, evalRes.failedParams)
        }

        const opStatuses: OpStatus[] = (obj.stack ?? []).map((op, idx) => {
          if (evalRes.failedIndex !== undefined) {
            if (idx === evalRes.failedIndex) {
              return {
                opId: op.id,
                status: 'failed',
                reason: evalRes.failedReason,
                params: evalRes.failedParams,
              }
            } else if (idx > evalRes.failedIndex) {
              return {
                opId: op.id,
                status: 'failed',
                reason: 'stack.error.skipped',
              }
            }
          }
          return {
            opId: op.id,
            status: 'ok',
          }
        })

        statuses[obj.id] = {
          objectId: obj.id,
          ops: opStatuses,
          error: evalRes.failedReason,
        }

        if (evalRes.solid) {
          evaluatedSolids.set(obj.id, evalRes.solid.asOriginal())
          const mesh = meshOf(evalRes.solid)
          if (oParam?.source?.kind === 'feature') {
            const cacheKey = JSON.stringify({
              features: oParam.source.features,
              sketches: p.sketches ?? [],
              quality: p.quality ?? 'fine',
            })
            featureMeshCache.set(cacheKey, copyMeshData(mesh))
          }
          const isTool = toolUsage.has(obj.id)

          if (isTool) {
            evaluatedTools.set(obj.id, {
              solid: evalRes.solid,
              matrix: objMatrix,
              name: obj.name,
              health: meshH,
              signature: JSON.stringify({
                source: obj.source,
                stack: obj.stack,
                rollback: obj.rollback,
              }),
            })
            if (obj.visible) {
              tools.push({
                id: obj.id,
                name: obj.name,
                color: obj.color,
                mesh,
              })
            }
          } else {
            if (obj.visible) {
              parts.push({
                label: obj.id,
                col: 0,
                row: 0,
                oversize: partOversize,
                mesh,
              })
            }
            evalRes.solid.delete()
          }
        } else if (obj.source.kind === 'mesh' && !toolUsage.has(obj.id) && obj.visible) {
          const indexed = meshRegistry.get(obj.source.meshId)
          if (indexed) {
            const b = meshBounds(indexed.vertProperties)
            let vol = 0
            const tris = indexed.triVerts
            const verts = indexed.vertProperties
            for (let t = 0; t < tris.length; t += 3) {
              const ia = tris[t] * 3, ib = tris[t + 1] * 3, ic = tris[t + 2] * 3
              vol +=
                (verts[ia] * (verts[ib + 1] * verts[ic + 2] - verts[ib + 2] * verts[ic + 1]) -
                  verts[ia + 1] * (verts[ib] * verts[ic + 2] - verts[ib + 2] * verts[ic]) +
                  verts[ia + 2] * (verts[ib] * verts[ic + 1] - verts[ib + 1] * verts[ic])) /
                6
            }
            parts.push({
              label: obj.id,
              col: 0,
              row: 0,
              oversize: false,
              mesh: {
                vertProperties: indexed.vertProperties,
                triVerts: indexed.triVerts,
                numProp: 3,
                min: b.min,
                max: b.max,
                volume: Math.abs(vol),
              },
            })
          }
        }
      }

      // Add loose pins from cut groups if includePins is not false
      if (p.cuts) {
        for (const group of p.cuts) {
          if (group.includePins !== false) {
            const groupRes = activeGroupResults.get(group.id)
            if (groupRes?.loosePins) {
              for (let i = 0; i < groupRes.loosePins.length; i++) {
                const pin = groupRes.loosePins[i]
                parts.push({
                  label: `${group.name ?? 'Part'} Pin ${i + 1}`,
                  col: 0,
                  row: 0,
                  oversize: false,
                  mesh: meshOf(pin),
                })
              }
            }
          }
        }
      }

      for (const t of evaluatedTools.values()) {
        t.solid?.delete()
      }
      for (const s of evaluatedSolids.values()) {
        try {
          s.delete()
        } catch {
          // already deleted
        }
      }
      for (const g of activeGroupResults.values()) {
        for (const pt of g.parts) {
          try {
            pt.solid.delete()
          } catch {
            // already deleted
          }
        }
        if (g.loosePins) {
          for (const pin of g.loosePins) {
            try {
              pin.delete()
            } catch {
              // already deleted
            }
          }
        }
      }

      return {
        parts,
        tools: tools.length > 0 ? tools : undefined,
        editor: { statuses },
      }
    }
    default:
      throw new Error(`Unknown mode: ${String(mode)}`)
  }
}
