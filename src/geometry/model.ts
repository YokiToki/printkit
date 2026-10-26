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
import { meshOf, type MeshData } from './mesh'

/** Параметры по режимам. Новые режимы (box, cutout) добавляются сюда. */
export interface ModeParams { baseplate: BaseplateGeometry; box: BoxParams; cutout: CutoutParams; keychain: KeychainParams; rackPanel: RackPanelParams; rackCase: RackCaseParams; rackShelf: RackShelfParams }

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
export interface ModelResult { parts: PartMesh[]; tools?: ToolMesh[]; /** Только у rackPanel: ключ ошибки (модели нет) и замечания о тонком. */ rack?: { error?: string; /** Только rackCase при rack.error.tooWide: на сколько мм корпус шире окна между рейками. */ excess?: number; warnings: Issue[] }; /** Только у keychain: сведения о силуэте и размерах, ошибка построения. */ keychain?: KeychainInfo; /** Детали уже стоят на листе печати: экспорт сохраняет их взаимное положение, а не раскладывает заново. */ sheetLayout?: boolean; /** Только у keychain в режиме половин: матрицы 4×4 (по столбцам) для собранного вида по подписям деталей. */ assembly?: Assembly }

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
    default:
      throw new Error(`Unknown mode: ${String(mode)}`)
  }
}
