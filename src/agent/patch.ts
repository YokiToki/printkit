import type { JsonSchema, JsonSchemaObject } from './schema'

export interface NormalisedDiff {
  path: string
  sent: unknown
  used: unknown
}

export interface PatchEntry {
  path: string
  value: unknown
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const joinPath = (base: string, key: string): string => (base ? `${base}.${key}` : key)

const cloneValue = <T>(v: T): T => {
  if (Array.isArray(v)) return v.map((item) => cloneValue(item)) as unknown as T
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = cloneValue(val)
    return out as T
  }
  return v
}

/** Глубокое слияние патча с текущим состоянием: вложенные объекты сливаются по ключам, массивы заменяются целиком. */
export function applyPatch<T>(base: T, patch: Record<string, unknown>): T {
  if (!isPlainObject(base)) return cloneValue(patch) as unknown as T
  const out: Record<string, unknown> = { ...cloneValue(base) }
  for (const [k, patchVal] of Object.entries(patch)) {
    if (patchVal === undefined) continue
    const baseVal = out[k]
    if (isPlainObject(baseVal) && isPlainObject(patchVal)) {
      out[k] = applyPatch(baseVal, patchVal)
    } else {
      out[k] = cloneValue(patchVal)
    }
  }
  return out as T
}

const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => k in b && valuesEqual(a[k], b[k]))
  }
  return false
}

/** Вычисляет поля, которые функция нормализации изменила относительно переданных в патче значений. */
export function diffNormalised(
  patched: unknown,
  normalised: unknown,
  patch?: Record<string, unknown>,
): NormalisedDiff[] {
  const diffs: NormalisedDiff[] = []
  walkDiff(patched, normalised, patch, '', diffs)
  return diffs
}

function walkDiff(
  sent: unknown,
  used: unknown,
  patch: unknown,
  path: string,
  diffs: NormalisedDiff[],
): void {
  if (patch !== undefined && !isPlainObject(patch)) {
    if (!valuesEqual(sent, used)) diffs.push({ path, sent: cloneValue(sent), used: cloneValue(used) })
    return
  }
  if (isPlainObject(sent) && isPlainObject(used)) {
    const keys = isPlainObject(patch)
      ? Object.keys(patch)
      : Array.from(new Set([...Object.keys(sent), ...Object.keys(used)]))
    for (const k of keys) {
      if (isPlainObject(patch) && patch[k] === undefined) continue
      walkDiff(sent[k], used[k], isPlainObject(patch) ? patch[k] : undefined, joinPath(path, k), diffs)
    }
    return
  }
  if (!valuesEqual(sent, used)) {
    diffs.push({ path, sent: cloneValue(sent), used: cloneValue(used) })
  }
}

/** Собирает плоский список изменённых путей из патча для краткой записи в журнале. */
export function flattenPatchPaths(patch: Record<string, unknown>, prefix = ''): PatchEntry[] {
  const out: PatchEntry[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const path = joinPath(prefix, k)
    if (isPlainObject(v) && Object.keys(v).length > 0) {
      out.push(...flattenPatchPaths(v, path))
    } else {
      out.push({ path, value: v })
    }
  }
  return out
}

/** Оставляет в объекте только поля, описанные в схеме (чтобы внутренние поля не попадали в ответ). */
export function pickBySchema<T>(value: T, schema: JsonSchemaObject): Record<string, unknown> {
  if (!isPlainObject(value)) return {}
  return pickNode(value, schema) as Record<string, unknown>
}

function pickNode(value: unknown, schema: JsonSchema): unknown {
  if (schema.type === 'object' && isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, propSchema] of Object.entries(schema.properties)) {
      if (k in value && value[k] !== undefined) {
        out[k] = pickNode(value[k], propSchema)
      }
    }
    return out
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    return value.map((item) => pickNode(item, schema.items))
  }
  return cloneValue(value)
}
