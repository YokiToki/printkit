import { migrateRackCase } from '../../features/rack/migrateCase'
import {
  defaultRackCase,
  validateRackCase,
  type RackCaseParams,
} from '../../geometry/rack/case'
import { MAX_GROUPS } from '../../geometry/rack/openings'
import { translateEn, translateRackSettingEn } from '../i18nEn'
import { pickBySchema } from '../patch'
import type { JsonSchemaObject } from '../schema'
import { rackEarsSchema, type AgentModeDescriptor } from './types'

export const rackCaseSchema: JsonSchemaObject = {
  type: 'object',
  description: '10-inch rack device enclosure parameters (all lengths in mm)',
  properties: {
    device: {
      type: 'object',
      description: 'Enclosed device dimensions in mm',
      properties: {
        width: { type: 'number', minimum: 0, maximum: 1000, description: 'Device width in mm' },
        depth: { type: 'number', minimum: 0, maximum: 1000, description: 'Device depth in mm' },
        height: { type: 'number', minimum: 0, maximum: 1000, description: 'Device height in mm' },
      },
      required: ['width', 'depth', 'height'],
      additionalProperties: false,
    },
    gap: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Clearance gap between the device and the shell in mm',
    },
    wall: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Shell wall thickness in mm',
    },
    plateThickness: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Front mounting plate thickness in mm',
    },
    units: {
      type: 'object',
      description: 'Rack unit height setting (1 U = 44.45 mm)',
      properties: {
        auto: { type: 'boolean', description: 'Automatically choose minimum rack units' },
        value: { type: 'number', minimum: 0, maximum: 50, description: 'Manual rack units U' },
      },
      required: ['auto', 'value'],
      additionalProperties: false,
    },
    cornerRadius: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Front plate corner radius in mm',
    },
    tolerance: {
      type: 'boolean',
      description: 'Subtract 0.45 mm height tolerance from the front plate',
    },
    ears: rackEarsSchema,
    window: {
      type: 'object',
      description: 'Front window cutout over the device face (lip in mm)',
      properties: {
        enabled: { type: 'boolean', description: 'Cut a window on the device front' },
        lip: { type: 'number', minimum: 0, maximum: 200, description: 'Front retaining lip width in mm' },
      },
      required: ['enabled', 'lip'],
      additionalProperties: false,
    },
    openings: {
      type: 'array',
      maxItems: MAX_GROUPS,
      description: 'Front plate keystone and round hole groups (up to 6 groups)',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['keystone', 'hole'] as const,
            description: 'Opening kind: standard keystone jack socket or round hole',
          },
          count: {
            type: 'integer',
            minimum: 1,
            maximum: 24,
            description: 'Number of openings in the group (1..24)',
          },
          perRow: {
            type: 'integer',
            minimum: 1,
            maximum: 24,
            description: 'Openings per row (1 = column, >= count = single row)',
          },
          zone: {
            type: 'string',
            enum: ['left', 'right', 'above', 'below'] as const,
            description: 'Placement zone around the device shell',
          },
          diameter: {
            type: 'number',
            minimum: 2,
            maximum: 30,
            description: 'Hole diameter in mm (used when kind is "hole")',
          },
        },
        required: ['kind', 'count', 'perRow', 'zone', 'diameter'],
        additionalProperties: false,
      },
    },
    vents: {
      type: 'object',
      description: 'Hexagonal ventilation cutouts on shell top and side walls (lengths in mm)',
      properties: {
        enabled: { type: 'boolean', description: 'Enable hexagonal vents on top and side walls' },
        width: { type: 'number', minimum: 0, maximum: 100, description: 'Hexagon flat-to-flat width in mm' },
        wall: { type: 'number', minimum: 0, maximum: 50, description: 'Wall between hexagons in mm' },
        margin: { type: 'number', minimum: 0, maximum: 100, description: 'Margin from shell edges in mm' },
      },
      required: ['enabled', 'width', 'wall', 'margin'],
      additionalProperties: false,
    },
  },
  required: [
    'device',
    'gap',
    'wall',
    'plateThickness',
    'units',
    'cornerRadius',
    'tolerance',
    'ears',
    'window',
    'openings',
    'vents',
  ],
  additionalProperties: false,
}

export const rackCaseDescriptor: AgentModeDescriptor<RackCaseParams> = {
  id: 'rackCase',
  product: 'rack',
  mode: 'case',
  path: '/rack/case',
  writable: true,
  defaults: defaultRackCase,
  schema: rackCaseSchema,
  excludedFields: [],
  normalise(raw) {
    return migrateRackCase(raw) as unknown as RackCaseParams
  },
  validate(state) {
    const res = validateRackCase(state)
    return {
      errors: res.errors.map((key) => ({
        key,
        message:
          key === 'rack.error.tooWide'
            ? translateEn(key, { excess: `${res.excess.toFixed(2)} mm` })
            : translateEn(key),
      })),
      warnings: res.warnings.map((w) => ({
        field: w.setting,
        key: w.key,
        message: translateEn(w.key, { setting: translateRackSettingEn(w.setting) }),
      })),
    }
  },
  describe(state) {
    return pickBySchema(state, rackCaseSchema)
  },
}
