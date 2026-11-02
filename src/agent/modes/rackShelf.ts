import { migrateRackShelf } from '../../features/rack/migrateShelf'
import {
  defaultRackShelf,
  validateRackShelf,
  type RackShelfParams,
} from '../../geometry/rack/shelf'
import { translateEn, translateRackSettingEn } from '../i18nEn'
import { pickBySchema } from '../patch'
import type { JsonSchemaObject } from '../schema'
import { rackEarsSchema, rackPatternSchema, type AgentModeDescriptor } from './types'

export const rackShelfSchema: JsonSchemaObject = {
  type: 'object',
  description: '10-inch rack shelf parameters (all lengths in mm, height in rack units U)',
  properties: {
    units: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Front plate height in rack units U (1..10)',
    },
    thickness: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Front plate thickness in mm (1.5..8 mm)',
    },
    cornerRadius: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Front plate outer corner radius in mm (0..10 mm)',
    },
    tolerance: {
      type: 'boolean',
      description: 'Subtract 0.45 mm height tolerance from the front plate',
    },
    ears: rackEarsSchema,
    shelf: {
      type: 'object',
      description: 'Shelf floor dimensions in mm',
      properties: {
        depth: { type: 'number', minimum: 0, maximum: 1000, description: 'Shelf depth behind the plate in mm (20..400 mm)' },
        thickness: { type: 'number', minimum: 0, maximum: 50, description: 'Floor thickness in mm (1.5..10 mm)' },
        clearance: { type: 'number', minimum: 0, maximum: 20, description: 'Side clearance to rack rails in mm (0..2 mm)' },
      },
      required: ['depth', 'thickness', 'clearance'],
      additionalProperties: false,
    },
    sides: {
      type: 'object',
      description: 'Sloped side wall dimensions in mm (height 0 removes side walls)',
      properties: {
        height: { type: 'number', minimum: 0, maximum: 1000, description: 'Side wall height at the front plate in mm (0 disables walls)' },
        wall: { type: 'number', minimum: 0, maximum: 50, description: 'Side wall thickness in mm (0.8..10 mm)' },
      },
      required: ['height', 'wall'],
      additionalProperties: false,
    },
    closedFront: {
      type: 'boolean',
      description: 'Keep the front plate closed above the floor instead of open',
    },
    floorPattern: rackPatternSchema,
    platePattern: rackPatternSchema,
  },
  required: [
    'units',
    'thickness',
    'cornerRadius',
    'tolerance',
    'ears',
    'shelf',
    'sides',
    'closedFront',
    'floorPattern',
    'platePattern',
  ],
  additionalProperties: false,
}

export const rackShelfDescriptor: AgentModeDescriptor<RackShelfParams> = {
  id: 'rackShelf',
  product: 'rack',
  mode: 'shelf',
  path: '/rack/shelf',
  writable: true,
  defaults: defaultRackShelf,
  schema: rackShelfSchema,
  excludedFields: [],
  normalise(raw) {
    return migrateRackShelf(raw) as unknown as RackShelfParams
  },
  validate(state) {
    const res = validateRackShelf(state)
    const warnings = [
      ...res.floorWarnings,
      ...(state.closedFront ? res.plateWarnings : []),
    ]
    return {
      errors: res.errors.map((key) => ({ key, message: translateEn(key) })),
      warnings: warnings.map((w) => ({
        field: w.setting,
        key: w.key,
        message: translateEn(w.key, { setting: translateRackSettingEn(w.setting) }),
      })),
    }
  },
  describe(state) {
    return pickBySchema(state, rackShelfSchema)
  },
}
