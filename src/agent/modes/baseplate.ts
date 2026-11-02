import { migrateBaseplate } from '../../features/baseplate/migrate'
import {
  baseplateLayout,
  defaultParams,
  planSplit,
  toGeometry,
  validateBaseplate,
  type BaseplateParams,
} from '../../geometry/baseplate'
import { checkFasteners } from '../../geometry/fasteners'
import { translateEn } from '../i18nEn'
import { pickBySchema } from '../patch'
import type { JsonSchemaObject } from '../schema'
import { axisSizeSchema, fastenersSchema, type AgentModeDescriptor } from './types'

const connectorSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Split part edge connector settings (lengths in mm)',
  properties: {
    type: {
      type: 'string',
      enum: ['none', 'holes', 'dovetail'] as const,
      description: 'Connector type along split cut faces',
    },
    preset: {
      type: 'string',
      enum: ['filament', 'pin2', 'pin3', 'magnet3x2', 'magnet2_8x0_75', 'custom'] as const,
      description: 'Hole connector preset',
    },
    diameter: { type: 'number', minimum: 0.5, maximum: 20, description: 'Connector hole diameter in mm' },
    depth: { type: 'number', minimum: 0.5, maximum: 50, description: 'Connector hole depth per part in mm' },
    count: { type: 'integer', minimum: 1, maximum: 20, description: 'Connectors per cut face' },
    inset: { type: 'number', minimum: 0, maximum: 200, description: 'End inset along cut face in mm' },
    clearance: { type: 'number', minimum: 0, maximum: 2, description: 'Dovetail clearance per side in mm' },
    neck: { type: 'number', minimum: 1, maximum: 50, description: 'Dovetail neck width in mm' },
    tip: { type: 'number', minimum: 1, maximum: 50, description: 'Dovetail tip width in mm' },
    dovetailDepth: { type: 'number', minimum: 0.2, maximum: 10, description: 'Dovetail depth in mm' },
    dovetailHeight: { type: 'number', minimum: 0.4, maximum: 20, description: 'Dovetail height from bed in mm' },
  },
  required: [
    'type',
    'preset',
    'diameter',
    'depth',
    'count',
    'inset',
    'clearance',
    'neck',
    'tip',
    'dovetailDepth',
    'dovetailHeight',
  ],
  additionalProperties: false,
}

export const baseplateSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Gridfinity baseplate parameters (all lengths in mm)',
  properties: {
    pitch: {
      type: 'number',
      minimum: 10,
      maximum: 200,
      description: 'Gridfinity cell pitch in mm (standard is 42 mm)',
    },
    x: axisSizeSchema,
    y: axisSizeSchema,
    thickness: {
      type: 'object',
      description: 'Baseplate profile and wall thicknesses in mm',
      properties: {
        baseHeight: {
          type: 'number',
          minimum: 0,
          maximum: 200,
          description: 'Socket profile height in mm (minimum 4.65 mm)',
        },
        floor: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Solid floor thickness under sockets in mm (0 for open frame)',
        },
        rim: {
          type: 'number',
          minimum: 0,
          maximum: 200,
          description: 'Outer rim width around the baseplate in mm',
        },
        paddingDrop: {
          type: 'number',
          minimum: 0,
          maximum: 200,
          description: 'Drop of fractional padding below rim top in mm (0 is flush)',
        },
        cornerRadius: {
          type: 'number',
          minimum: 0,
          maximum: 500,
          description: 'Outer corner fillet radius in mm',
        },
      },
      required: ['baseHeight', 'floor', 'rim', 'paddingDrop', 'cornerRadius'],
      additionalProperties: false,
    },
    fasteners: fastenersSchema,
    split: {
      type: 'object',
      description: 'Plate splitting settings for smaller print beds (lengths in mm)',
      properties: {
        enabled: { type: 'boolean', description: 'Enable splitting the baseplate into parts' },
        source: {
          type: 'string',
          enum: ['plate', 'custom'] as const,
          description: 'Bed size source: active printer plate or custom dimensions',
        },
        bedX: { type: 'number', minimum: 20, maximum: 2000, description: 'Custom bed width X in mm' },
        bedY: { type: 'number', minimum: 20, maximum: 2000, description: 'Custom bed depth Y in mm' },
        margin: { type: 'number', minimum: 0, maximum: 100, description: 'Bed edge margin in mm' },
        auto: { type: 'boolean', description: 'Compute split cuts automatically' },
        xCuts: {
          type: 'array',
          maxItems: 30,
          description: 'Manual X cut cell indices (1..nx-1)',
          items: { type: 'integer', minimum: 1, maximum: 30 },
        },
        yCuts: {
          type: 'array',
          maxItems: 30,
          description: 'Manual Y cut cell indices (1..ny-1)',
          items: { type: 'integer', minimum: 1, maximum: 30 },
        },
        connector: connectorSchema,
        exploded: { type: 'boolean', description: 'Show split parts exploded in the 3D viewport' },
        gap: { type: 'number', minimum: 0, maximum: 100, description: 'Exploded view gap in mm' },
      },
      required: [
        'enabled',
        'source',
        'bedX',
        'bedY',
        'margin',
        'auto',
        'xCuts',
        'yCuts',
        'connector',
        'exploded',
        'gap',
      ],
      additionalProperties: false,
    },
  },
  required: ['pitch', 'x', 'y', 'thickness', 'fasteners', 'split'],
  additionalProperties: false,
}

export const baseplateDescriptor: AgentModeDescriptor<BaseplateParams> = {
  id: 'baseplate',
  product: 'gridfinity',
  mode: 'baseplate',
  path: '/gridfinity/baseplate',
  writable: true,
  defaults: defaultParams,
  schema: baseplateSchema,
  excludedFields: [
    'preview.showPlate',
    'preview.plateX',
    'preview.plateY',
    'split.connector.overrides',
  ],
  normalise(raw) {
    const merged = {
      ...defaultParams,
      ...migrateBaseplate(raw),
    } as BaseplateParams
    const gap = Math.max(0, Math.min(50, merged.split.gap))
    return gap === merged.split.gap
      ? merged
      : { ...merged, split: { ...merged.split, gap } }
  },
  validate(state) {
    const geom = toGeometry(state)
    const check = validateBaseplate(geom)
    const errors = check.errors.map((e) => ({
      field: e.field,
      key: e.key,
      message: translateEn(e.key),
    }))
    if (!check.ok) return { errors, warnings: [] }
    const { fp } = baseplateLayout(geom)
    const fWarnings = checkFasteners(geom.fasteners, fp).map((w) => ({
      field: `fasteners.${w.kind}`,
      key: w.key,
      message: translateEn(w.key),
    }))
    const cWarnings = planSplit(geom)
      .plans.flatMap((p) => p.issues)
      .map((iss) => ({
        field: `split.connector.${iss.cut}`,
        key: iss.key,
        message: translateEn(iss.key, { cut: iss.cut, parts: iss.parts }),
      }))
    return { errors, warnings: [...fWarnings, ...cWarnings] }
  },
  describe(state) {
    return pickBySchema(state, baseplateSchema)
  },
}
