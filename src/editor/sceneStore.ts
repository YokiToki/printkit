import { useEffect, useState } from 'react'
import { log } from '../app/activityLog'
import type { MeshStore } from '../features/cutout/meshStore'
import {
  createEmptyScene,
  DEFAULT_TRANSFORM,
  type EditorObject,
  type ObjectSource,
  type PrimitiveShape,
  type SceneDoc,
  type Transform,
} from './scene'

export const SCENE_STORAGE_KEY = 'editor.scene'

const KNOWN_PRIMITIVES = new Set<PrimitiveShape>(['box', 'cylinder', 'sphere', 'cone', 'torus', 'wedge'])

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

function normaliseTransform(raw: unknown): Transform {
  if (!raw || typeof raw !== 'object') {
    return {
      position: [...DEFAULT_TRANSFORM.position],
      rotation: [...DEFAULT_TRANSFORM.rotation],
      scale: [...DEFAULT_TRANSFORM.scale],
    }
  }
  const t = raw as Record<string, unknown>
  const pos = Array.isArray(t.position) ? t.position : []
  const rot = Array.isArray(t.rotation) ? t.rotation : []
  const sc = Array.isArray(t.scale) ? t.scale : []

  return {
    position: [num(pos[0], 0), num(pos[1], 0), num(pos[2], 0)],
    rotation: [num(rot[0], 0), num(rot[1], 0), num(rot[2], 0)],
    scale: [num(sc[0], 1), num(sc[1], 1), num(sc[2], 1)],
  }
}

function normaliseSource(raw: unknown, objectName: string): ObjectSource | null {
  if (!raw || typeof raw !== 'object') {
    log.warn('storage', 'log.editor.unknownSource', { name: objectName })
    return null
  }
  const s = raw as Record<string, unknown>
  if (s.kind === 'mesh') {
    if (typeof s.meshId !== 'string' || !s.meshId) {
      log.warn('storage', 'log.editor.missingMeshId', { name: objectName })
      return null
    }
    return {
      kind: 'mesh',
      meshId: s.meshId,
      unit: s.unit === 'in' ? 'in' : 'mm',
    }
  }

  if (s.kind === 'primitive') {
    if (typeof s.shape !== 'string' || !KNOWN_PRIMITIVES.has(s.shape as PrimitiveShape)) {
      log.warn('storage', 'log.editor.unknownSource', { name: objectName })
      return null
    }
    const shape = s.shape as PrimitiveShape
    const rawParams = (s.params && typeof s.params === 'object' ? s.params : {}) as Record<string, unknown>
    const params: Record<string, number> = {}

    if (shape === 'box' || shape === 'wedge') {
      params.width = num(rawParams.width, 20)
      params.depth = num(rawParams.depth, 20)
      params.height = num(rawParams.height, 20)
    } else if (shape === 'cylinder' || shape === 'cone') {
      const isCone = shape === 'cone'
      const key = isCone ? 'bottomDiameter' : 'diameter'
      params[key] = num(rawParams[key], 20)
      params.height = num(rawParams.height, 20)
    } else if (shape === 'sphere') {
      params.diameter = num(rawParams.diameter, 20)
    } else if (shape === 'torus') {
      params.diameter = num(rawParams.diameter, 30)
      params.tubeDiameter = num(rawParams.tubeDiameter, 6)
    }

    return {
      kind: 'primitive',
      shape,
      params,
    }
  }

  log.warn('storage', 'log.editor.unknownSource', { name: objectName })
  return null
}

export function migrateScene(raw: unknown): SceneDoc {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createEmptyScene()
  }

  const data = raw as Record<string, unknown>
  const rawObjects = Array.isArray(data.objects) ? data.objects : []

  const objects: EditorObject[] = []

  for (let i = 0; i < rawObjects.length; i++) {
    const item = rawObjects[i]
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue

    const o = item as Record<string, unknown>
    const name = typeof o.name === 'string' && o.name ? o.name : `Object ${i + 1}`
    const source = normaliseSource(o.source, name)
    if (!source) continue

    const id = typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID()
    const visible = typeof o.visible === 'boolean' ? o.visible : true
    const locked = typeof o.locked === 'boolean' ? o.locked : false
    const color = typeof o.color === 'number' && Number.isInteger(o.color) ? Math.max(0, o.color) : 0
    const transform = normaliseTransform(o.transform)

    objects.push({
      id,
      name,
      visible,
      locked,
      color,
      source,
      transform,
    })
  }

  return {
    schema: 1,
    objects,
  }
}

export function loadPersistedScene(key = SCENE_STORAGE_KEY): SceneDoc {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return createEmptyScene()
    const parsed = JSON.parse(raw)
    return migrateScene(parsed)
  } catch {
    return createEmptyScene()
  }
}

export function savePersistedScene(doc: SceneDoc, key = SCENE_STORAGE_KEY): void {
  try {
    localStorage.setItem(key, JSON.stringify(doc))
  } catch {
    // localStorage may be disabled or full
  }
}

export async function gcMeshes(doc: SceneDoc, store: MeshStore): Promise<void> {
  if (!store.keys) return
  const used = new Set<string>()
  for (const obj of doc.objects) {
    if (obj.source.kind === 'mesh') {
      used.add(obj.source.meshId)
    }
  }
  const allKeys = await store.keys()
  for (const key of allKeys) {
    if (!used.has(key)) {
      await store.remove(key)
    }
  }
}

export function useScene(key = SCENE_STORAGE_KEY) {
  const [doc, setDoc] = useState<SceneDoc>(() => loadPersistedScene(key))

  useEffect(() => {
    savePersistedScene(doc, key)
  }, [doc, key])

  return [doc, setDoc] as const
}
