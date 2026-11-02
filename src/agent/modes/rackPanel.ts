import { migrateRackPanel } from '../../features/rack/migrate'
import {
  defaultRackPanel,
  validateRackPanel,
  type RackPanelParams,
} from '../../geometry/rack/panel'
import { translateEn, translateRackSettingEn } from '../i18nEn'
import { pickBySchema } from '../patch'
import type { JsonSchemaObject } from '../schema'
import { rackEarsSchema, rackPatternSchema, type AgentModeDescriptor } from './types'

export const rackPanelSchema: JsonSchemaObject = {
  type: 'object',
  description: '10-inch rack panel parameters (all lengths in mm, height in rack units U)',
  properties: {
    units: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Panel height in rack units U (1 U = 44.45 mm; valid range 1..10)',
    },
    thickness: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Panel thickness in mm (valid range 1.5..8 mm)',
    },
    cornerRadius: {
      type: 'number',
      minimum: 0,
      maximum: 50,
      description: 'Outer corner radius in mm (valid range 0..10 mm)',
    },
    tolerance: {
      type: 'boolean',
      description: 'Subtract 0.45 mm height tolerance so adjacent panels fit',
    },
    ears: rackEarsSchema,
    pattern: rackPatternSchema,
    back: {
      type: 'object',
      description: 'Optional separate back wall behind the panel (thickness in mm)',
      properties: {
        enabled: { type: 'boolean', description: 'Build a separate back wall part' },
        thickness: {
          type: 'number',
          minimum: 0,
          maximum: 20,
          description: 'Back wall thickness in mm (valid range 0.2..2 mm)',
        },
      },
      required: ['enabled', 'thickness'],
      additionalProperties: false,
    },
  },
  required: ['units', 'thickness', 'cornerRadius', 'tolerance', 'ears', 'pattern', 'back'],
  additionalProperties: false,
}

export const rackPanelDescriptor: AgentModeDescriptor<RackPanelParams> = {
  id: 'rackPanel',
  product: 'rack',
  mode: 'panel',
  path: '/rack/panel',
  writable: true,
  defaults: defaultRackPanel,
  schema: rackPanelSchema,
  excludedFields: [],
  normalise(raw) {
    return migrateRackPanel(raw) as unknown as RackPanelParams
  },
  validate(state) {
    const res = validateRackPanel(state)
    return {
      errors: res.errors.map((key) => ({ key, message: translateEn(key) })),
      warnings: res.warnings.map((w) => ({
        field: w.setting,
        key: w.key,
        message: translateEn(w.key, { setting: translateRackSettingEn(w.setting) }),
      })),
    }
  },
  describe(state) {
    return pickBySchema(state, rackPanelSchema)
  },
}
