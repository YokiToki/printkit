import type { PlaneDefinition } from '../geometry/cut/plane'
import type { CutConnectorConfig } from '../geometry/cut/connectors'
import type { EditorObject, SceneDoc } from './scene'

export type CutType = 'plane' | 'grid'
export type CutMode = 'both' | 'keepNegative' | 'keepPositive' | 'slice'

export interface CutPlaneConfig {
  mode: CutMode
  plane: PlaneDefinition
  sliceCount?: number // for slice into N
}

export interface CutGridConfig {
  x: number[]
  y: number[]
  z: number[]
}

export interface CutGroup {
  id: string
  name?: string
  sourceObjectId: string
  type: CutType // 'plane' | 'grid'
  plane?: CutPlaneConfig
  grid?: CutGridConfig
  connector?: CutConnectorConfig
  bed?: {
    width: number
    depth: number
    margin: number
  }
  explodeGap?: number // mm, default 0
  includePins?: boolean // default true
}

export interface CutPartSource {
  kind: 'cutPart'
  groupId: string
  partIndex: number
  partLabel?: string
}

export function normaliseCutGroup(raw: unknown): CutGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>

  if (typeof g.id !== 'string' || !g.id) return null
  if (typeof g.sourceObjectId !== 'string' || !g.sourceObjectId) return null

  const id = g.id
  const sourceObjectId = g.sourceObjectId
  const name = typeof g.name === 'string' ? g.name : undefined
  const type: CutType = g.type === 'grid' ? 'grid' : 'plane'

  let plane: CutPlaneConfig | undefined
  if (g.plane && typeof g.plane === 'object') {
    const rawP = g.plane as Record<string, unknown>
    const mode: CutMode =
      rawP.mode === 'keepNegative' || rawP.mode === 'keepPositive' || rawP.mode === 'slice'
        ? rawP.mode
        : 'both'
    const planeDef =
      rawP.plane && typeof rawP.plane === 'object'
        ? (rawP.plane as PlaneDefinition)
        : { kind: 'axis' as const, axis: 'z' as const, position: 0 }
    const sliceCount =
      typeof rawP.sliceCount === 'number' && Number.isFinite(rawP.sliceCount)
        ? Math.max(2, Math.round(rawP.sliceCount))
        : 2
    plane = { mode, plane: planeDef, sliceCount }
  } else if (type === 'plane') {
    plane = {
      mode: 'both',
      plane: { kind: 'axis', axis: 'z', position: 0 },
    }
  }

  let grid: CutGridConfig | undefined
  if (g.grid && typeof g.grid === 'object') {
    const rawG = g.grid as Record<string, unknown>
    const parseArr = (arr: unknown): number[] =>
      Array.isArray(arr) ? arr.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []
    grid = {
      x: parseArr(rawG.x),
      y: parseArr(rawG.y),
      z: parseArr(rawG.z),
    }
  }

  const connector =
    g.connector && typeof g.connector === 'object'
      ? (g.connector as CutConnectorConfig)
      : undefined

  let bed: CutGroup['bed']
  if (g.bed && typeof g.bed === 'object') {
    const rawB = g.bed as Record<string, unknown>
    const width = typeof rawB.width === 'number' && Number.isFinite(rawB.width) ? rawB.width : 256
    const depth = typeof rawB.depth === 'number' && Number.isFinite(rawB.depth) ? rawB.depth : 256
    const margin = typeof rawB.margin === 'number' && Number.isFinite(rawB.margin) ? rawB.margin : 5
    bed = { width, depth, margin }
  }

  const explodeGap =
    typeof g.explodeGap === 'number' && Number.isFinite(g.explodeGap)
      ? Math.max(0, g.explodeGap)
      : 0

  const includePins = typeof g.includePins === 'boolean' ? g.includePins : true

  return {
    id,
    name,
    sourceObjectId,
    type,
    plane,
    grid,
    connector,
    bed,
    explodeGap,
    includePins,
  }
}

/**
 * Normalises a list of cut groups and drops orphan groups whose sourceObjectId does not exist in objects.
 */
export function migrateCuts(rawCuts: unknown, objects: EditorObject[]): CutGroup[] {
  if (!Array.isArray(rawCuts)) return []
  const objectIds = new Set(objects.map((o) => o.id))

  const validGroups: CutGroup[] = []
  for (const raw of rawCuts) {
    const g = normaliseCutGroup(raw)
    if (g && objectIds.has(g.sourceObjectId)) {
      validGroups.push(g)
    }
  }
  return validGroups
}

/**
 * Creates a new cut group, hides the source object, and generates the derived part objects.
 */
export function createCutGroup(
  doc: SceneDoc,
  group: CutGroup,
  partLabels: string[]
): SceneDoc {
  const sourceObj = doc.objects.find((o) => o.id === group.sourceObjectId)
  if (!sourceObj) return doc

  const nextObjects = doc.objects.map((o) =>
    o.id === sourceObj.id ? { ...o, visible: false } : o
  )

  const derivedObjects: EditorObject[] = partLabels.map((label, idx) => ({
    id: crypto.randomUUID(),
    name: `${sourceObj.name} ${label}`,
    visible: true,
    locked: false,
    color: sourceObj.color,
    source: {
      kind: 'cutPart',
      groupId: group.id,
      partIndex: idx,
      partLabel: label,
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    stack: [],
  }))

  const nextCuts = [...(doc.cuts ?? []).filter((c) => c.id !== group.id), group]

  return {
    ...doc,
    objects: [...nextObjects, ...derivedObjects],
    cuts: nextCuts,
  }
}

/**
 * Deletes a cut group, restores visibility of the source object, and removes all derived part objects.
 */
export function deleteCutGroup(doc: SceneDoc, groupId: string): SceneDoc {
  const group = doc.cuts?.find((c) => c.id === groupId)
  if (!group) return doc

  // Restore source object visibility
  const nextObjects = doc.objects
    .filter((o) => !(o.source.kind === 'cutPart' && (o.source as CutPartSource).groupId === groupId))
    .map((o) => (o.id === group.sourceObjectId ? { ...o, visible: true } : o))

  const nextCuts = (doc.cuts ?? []).filter((c) => c.id !== groupId)

  return {
    ...doc,
    objects: nextObjects,
    ...(nextCuts.length > 0 ? { cuts: nextCuts } : { cuts: undefined }),
  }
}

/**
 * Updates a cut group definition in the document.
 */
export function updateCutGroup(
  doc: SceneDoc,
  groupId: string,
  patch: Partial<CutGroup>
): SceneDoc {
  if (!doc.cuts) return doc
  const nextCuts = doc.cuts.map((c) => {
    if (c.id !== groupId) return c
    const merged = { ...c, ...patch }
    return normaliseCutGroup(merged) ?? c
  })

  return {
    ...doc,
    cuts: nextCuts,
  }
}
