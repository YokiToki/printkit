import { migrateBox } from '../../features/box/migrate'
import {
  boxLayout,
  boxNotices,
  defaultBox,
  validateBox,
  type BoxParams,
} from '../../geometry/box'
import { checkFasteners } from '../../geometry/fasteners'
import { translateEn } from '../i18nEn'
import { pickBySchema } from '../patch'
import type { JsonSchemaObject } from '../schema'
import { axisSizeSchema, fastenersSchema, type AgentModeDescriptor } from './types'

export const boxSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Gridfinity storage box/bin parameters (all lengths in mm)',
  properties: {
    pitch: {
      type: 'number',
      minimum: 10,
      maximum: 200,
      description: 'Gridfinity cell pitch in mm (standard is 42 mm)',
    },
    x: axisSizeSchema,
    y: axisSizeSchema,
    height: {
      type: 'object',
      description: 'Box height in 7 mm Gridfinity height units or millimetres (mm)',
      properties: {
        mode: {
          type: 'string',
          enum: ['units', 'mm'] as const,
          description: 'Height sizing mode: 7 mm units or millimetres (mm)',
        },
        value: {
          type: 'number',
          minimum: 0,
          maximum: 2000,
          description: 'Height in 7 mm units (when mode is "units") or millimetres (mm)',
        },
      },
      required: ['mode', 'value'],
      additionalProperties: false,
    },
    thickness: {
      type: 'object',
      description: 'Box wall and floor thicknesses in mm',
      properties: {
        outerWall: { type: 'number', minimum: 0, maximum: 50, description: 'Outer wall thickness in mm' },
        innerWall: { type: 'number', minimum: 0, maximum: 50, description: 'Divider inner wall thickness in mm' },
        floor: { type: 'number', minimum: 0, maximum: 50, description: 'Cavity floor thickness above feet in mm' },
      },
      required: ['outerWall', 'innerWall', 'floor'],
      additionalProperties: false,
    },
    lip: {
      type: 'string',
      enum: ['default', 'thin', 'none'] as const,
      description: 'Stacking lip profile along the top rim',
    },
    scoop: {
      type: 'object',
      description: 'Finger scoop fillet along cavity bottom walls (radius in mm)',
      properties: {
        front: { type: 'boolean', description: 'Enable scoop along the front wall' },
        back: { type: 'boolean', description: 'Enable scoop along the back wall' },
        left: { type: 'boolean', description: 'Enable scoop along the left wall' },
        right: { type: 'boolean', description: 'Enable scoop along the right wall' },
        radius: { type: 'number', minimum: 0, maximum: 200, description: 'Scoop fillet radius in mm' },
      },
      required: ['front', 'back', 'left', 'right', 'radius'],
      additionalProperties: false,
    },
    compartments: {
      type: 'object',
      description: 'Internal compartments and divider positions',
      properties: {
        cols: { type: 'integer', minimum: 0, maximum: 50, description: 'Number of columns along X' },
        rows: { type: 'integer', minimum: 0, maximum: 50, description: 'Number of rows along Y' },
        xDividers: {
          type: 'array',
          maxItems: 30,
          description: 'Vertical divider centre positions as fractions (0..1) of cavity width',
          items: { type: 'number', minimum: 0, maximum: 1 },
        },
        yDividers: {
          type: 'array',
          maxItems: 30,
          description: 'Horizontal divider centre positions as fractions (0..1) of cavity depth',
          items: { type: 'number', minimum: 0, maximum: 1 },
        },
        removed: {
          type: 'array',
          maxItems: 400,
          description: 'Removed divider segments ("x:k:j" or "y:k:i") for merged compartments',
          items: { type: 'string', maxLength: 32 },
        },
      },
      required: ['cols', 'rows', 'xDividers', 'yDividers', 'removed'],
      additionalProperties: false,
    },
    fasteners: fastenersSchema,
  },
  required: ['pitch', 'x', 'y', 'height', 'thickness', 'lip', 'scoop', 'compartments', 'fasteners'],
  additionalProperties: false,
}

export const boxDescriptor: AgentModeDescriptor<BoxParams> = {
  id: 'box',
  product: 'gridfinity',
  mode: 'box',
  path: '/gridfinity/box',
  writable: true,
  defaults: defaultBox,
  schema: boxSchema,
  excludedFields: [],
  normalise(raw) {
    const merged = {
      ...defaultBox,
      ...migrateBox(raw),
    } as BoxParams
    const clampDiv = (arr: number[]) =>
      arr.map((v) => Math.max(0.01, Math.min(0.99, v)))
    const xDividers = clampDiv(merged.compartments.xDividers)
    const yDividers = clampDiv(merged.compartments.yDividers)
    return {
      ...merged,
      compartments: {
        ...merged.compartments,
        xDividers,
        yDividers,
      },
    }
  },
  validate(state) {
    const check = validateBox(state)
    const errors = check.errors.map((e) => ({
      field: e.field,
      key: e.key,
      message: translateEn(e.key),
    }))
    if (!check.ok) return { errors, warnings: [] }
    const l = boxLayout(state)
    const notices = boxNotices(state).map((k) => ({
      field: 'scoop.radius',
      key: k,
      message: translateEn(k, { r: `${l.scoopRadius.toFixed(1)} mm` }),
    }))
    const fWarnings = checkFasteners(state.fasteners, l.fp).map((w) => ({
      field: `fasteners.${w.kind}`,
      key: w.key,
      message: translateEn(w.key),
    }))
    return { errors, warnings: [...notices, ...fWarnings] }
  },
  describe(state) {
    return pickBySchema(state, boxSchema)
  },
}
