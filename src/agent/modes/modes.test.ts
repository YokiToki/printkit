import { describe, expect, it } from 'vitest'
import { toGeometry, validateBaseplate } from '../../geometry/baseplate'
import { validateBox } from '../../geometry/box'
import { validateKeychain } from '../../geometry/keychain'
import { validateRackCase } from '../../geometry/rack/case'
import { validateRackPanel } from '../../geometry/rack/panel'
import { validateRackShelf } from '../../geometry/rack/shelf'
import { shapeParams } from '../../features/keychain/shapeState'
import { applyPatch } from '../patch'
import { validateSchema, type JsonSchema } from '../schema'
import {
  baseplateDescriptor,
  boxDescriptor,
  cutoutDescriptor,
  findModeDescriptor,
  keychainImageDescriptor,
  keychainShapeDescriptor,
  MODE_DESCRIPTORS,
  rackCaseDescriptor,
  rackPanelDescriptor,
  rackShelfDescriptor,
  WRITABLE_MODES,
} from './index'

function objectLeafPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return prefix ? [prefix] : []
  }
  const entries = Object.entries(obj as Record<string, unknown>)
  if (entries.length === 0) return prefix ? [prefix] : []
  const out: string[] = []
  for (const [k, v] of entries) {
    const next = prefix ? `${prefix}.${k}` : k
    out.push(...objectLeafPaths(v, next))
  }
  return out
}

function schemaPaths(schema: JsonSchema, prefix = ''): Set<string> {
  const out = new Set<string>()
  if (prefix) out.add(prefix)
  if (schema.type === 'object') {
    for (const [k, prop] of Object.entries(schema.properties)) {
      const next = prefix ? `${prefix}.${k}` : k
      for (const p of schemaPaths(prop, next)) out.add(p)
    }
  }
  return out
}

describe('Agent mode descriptors', () => {
  it('registers all 6 writable modes and 2 read-only modes', () => {
    expect(WRITABLE_MODES).toHaveLength(6)
    expect(MODE_DESCRIPTORS).toHaveLength(8)
    for (const m of WRITABLE_MODES) {
      const d = findModeDescriptor(m.product, m.mode)
      expect(d, `${m.product}/${m.mode}`).toBeDefined()
      expect(d?.writable).toBe(true)
    }
    expect(findModeDescriptor('gridfinity', 'cutout')?.writable).toBe(false)
    expect(findModeDescriptor('keychain', 'image')?.writable).toBe(false)
  })

  it('defaults satisfy each mode schema', () => {
    for (const d of MODE_DESCRIPTORS) {
      const described = d.describe(d.defaults)
      const issues = validateSchema(described, d.schema)
      expect(issues, `schema issues for ${d.product}/${d.mode}`).toEqual([])
      const v = d.validate(d.defaults)
      expect(v.errors, `default validation errors for ${d.product}/${d.mode}`).toEqual([])
    }
  })

  it('covers every leaf path of defaults in schema or excludedFields', () => {
    for (const d of MODE_DESCRIPTORS) {
      const leaves = objectLeafPaths(d.defaults)
      const inSchema = schemaPaths(d.schema)
      const excluded = d.excludedFields
      for (const leaf of leaves) {
        const coveredBySchema = inSchema.has(leaf)
        const coveredByExcluded = excluded.some((ex) => leaf === ex || leaf.startsWith(`${ex}.`))
        expect(
          coveredBySchema || coveredByExcluded,
          `${d.product}/${d.mode}: leaf path "${leaf}" is neither in schema nor in excludedFields`,
        ).toBe(true)
      }
    }
  })

  it('round-trips partial patches through normalise for all writable modes', () => {
    const patches: [typeof MODE_DESCRIPTORS[number], Record<string, unknown>][] = [
      [baseplateDescriptor, { x: { mode: 'units', value: 4, align: 'center' }, fasteners: { magnets: { mode: 'corner' } } }],
      [boxDescriptor, { x: { value: 3 }, height: { value: 4 }, lip: 'thin' }],
      [rackPanelDescriptor, { units: 2, ears: { shape: 'slot' }, pattern: { kind: 'hex' } }],
      [rackCaseDescriptor, { device: { width: 150, depth: 120, height: 35 }, vents: { enabled: false } }],
      [rackShelfDescriptor, { units: 2, shelf: { depth: 180 }, sides: { height: 25 } }],
      [keychainShapeDescriptor, { shape: { kind: 'circle', width: 55 }, text: { enabled: true, content: 'PRINTKIT' } }],
    ]
    for (const [d, patch] of patches) {
      expect(validateSchema(patch, d.schema, { partial: true }), `${d.id} patch schema`).toEqual([])
      const merged = applyPatch(d.defaults, patch)
      const normalised = d.normalise(merged)
      const described = d.describe(normalised)
      expect(validateSchema(described, d.schema), `${d.id} normalised schema`).toEqual([])
      expect(d.validate(normalised).errors, `${d.id} normalised errors`).toEqual([])
    }
  })

  it('produces the same validation keys as the underlying mode validators for invalid sizes', () => {
    // Baseplate: size smaller than 1 pitch
    const badBp = applyPatch(baseplateDescriptor.defaults, { x: { mode: 'mm', value: 10, align: 'center' } })
    expect(baseplateDescriptor.validate(badBp).errors.map((e) => e.key)).toEqual(
      validateBaseplate(toGeometry(badBp)).errors.map((e) => e.key),
    )

    // Box: size smaller than 1 pitch and height <= 0
    const badBox = applyPatch(boxDescriptor.defaults, {
      x: { mode: 'mm', value: 15, align: 'center' },
      height: { mode: 'mm', value: 0 },
    })
    expect(boxDescriptor.validate(badBox).errors.map((e) => e.key)).toEqual(
      validateBox(badBox).errors.map((e) => e.key),
    )

    // Rack panel: thickness out of range
    const badPanel = applyPatch(rackPanelDescriptor.defaults, { thickness: 0.5 })
    expect(rackPanelDescriptor.validate(badPanel).errors.map((e) => e.key)).toEqual(
      validateRackPanel(badPanel).errors,
    )

    // Rack case: device wider than rack window
    const badCase = applyPatch(rackCaseDescriptor.defaults, { device: { width: 240, depth: 100, height: 30 } })
    expect(rackCaseDescriptor.validate(badCase).errors.map((e) => e.key)).toEqual(
      validateRackCase(badCase).errors,
    )
    expect(rackCaseDescriptor.validate(badCase).errors[0]?.message).toContain('too wide')

    // Rack shelf: depth out of range
    const badShelf = applyPatch(rackShelfDescriptor.defaults, { shelf: { depth: 5, thickness: 3, clearance: 0.5 } })
    expect(rackShelfDescriptor.validate(badShelf).errors.map((e) => e.key)).toEqual(
      validateRackShelf(badShelf).errors,
    )

    // Keychain shape: heightFloor >= hmax
    const badShape = applyPatch(keychainShapeDescriptor.defaults, {
      relief: { ...keychainShapeDescriptor.defaults.relief, hmax: 1, heightFloor: 2 },
    })
    expect(keychainShapeDescriptor.validate(badShape).errors.map((e) => e.key)).toEqual(
      validateKeychain(shapeParams(badShape)).errors.map((e) => e.key),
    )
  })

  it('sanitises cutout and keychain image read-only descriptors', () => {
    const describedCutout = cutoutDescriptor.describe({
      ...cutoutDescriptor.defaults,
      cutouts: [
        {
          id: 'c1',
          name: 'secret.stl',
          x: 0,
          y: 0,
          rotation: 0,
          depth: 10,
          clearance: 0.5,
          visible: true,
          source: { kind: 'outline', points: [[0, 0], [10, 0], [0, 10]], size: { w: 10, l: 10 } },
        },
      ],
    })
    expect(describedCutout).not.toHaveProperty('cutouts')

    const describedImage = keychainImageDescriptor.describe({
      ...keychainImageDescriptor.defaults,
      imageId: 'img-secret',
    })
    expect(describedImage).not.toHaveProperty('imageId')
    expect(describedImage).not.toHaveProperty('silhouette')
    expect(describedImage).not.toHaveProperty('outline')
  })
})
