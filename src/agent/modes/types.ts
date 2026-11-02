import type { ProductId } from '../../app/products'
import type { ValidationIssue } from '../i18nEn'
import type { JsonSchemaObject } from '../schema'

export type AgentModeId =
  | 'baseplate'
  | 'box'
  | 'cutout'
  | 'rackPanel'
  | 'rackCase'
  | 'rackShelf'
  | 'keychainShape'
  | 'keychainImage'

export interface ValidationSummary {
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
}

export interface AgentModeDescriptor<T = Record<string, unknown>> {
  id: AgentModeId
  product: ProductId
  /** Идентификатор режима в маршрутах продукта (например, `panel` для `/rack/panel`). */
  mode: string
  path: string
  writable: boolean
  /** Содержит ли ответ `get_parameters` пользовательский текст (помечается `untrustedContentHint`). */
  hasUntrustedText?: boolean
  defaults: T
  schema: JsonSchemaObject
  /** Явный список путей из `defaults`, исключённых из схемы для агента (проверяется тестом покрытия). */
  excludedFields: readonly string[]
  normalise(raw: Record<string, unknown>): T
  validate(state: T): ValidationSummary
  describe(state: T): Record<string, unknown>
}

export const axisSizeSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Axis size in Gridfinity cell units or millimetres (mm)',
  properties: {
    mode: {
      type: 'string',
      enum: ['units', 'mm'] as const,
      description: 'Sizing mode: cell units or millimetres (mm)',
    },
    value: {
      type: 'number',
      minimum: 0,
      maximum: 5000,
      description: 'Size in cell units (when mode is "units") or millimetres (mm)',
    },
    align: {
      type: 'string',
      enum: ['start', 'center', 'end'] as const,
      description: 'Alignment of whole cells when fractional padding remains',
    },
  },
  required: ['mode', 'value', 'align'],
  additionalProperties: false,
}

const fastenerSlotSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Cell corner slot coordinates',
  properties: {
    i: { type: 'integer', minimum: 0, maximum: 50, description: 'Column cell index (0-based)' },
    j: { type: 'integer', minimum: 0, maximum: 50, description: 'Row cell index (0-based)' },
    sx: { type: 'integer', minimum: -1, maximum: 1, description: 'Corner X sign (-1 or 1)' },
    sy: { type: 'integer', minimum: -1, maximum: 1, description: 'Corner Y sign (-1 or 1)' },
  },
  required: ['i', 'j', 'sx', 'sy'],
  additionalProperties: false,
}

const fastenerKindSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Fastener placement mode and manual slots',
  properties: {
    mode: {
      type: 'string',
      enum: ['none', 'corner', 'full', 'manual'] as const,
      description: 'Placement mode: none, corner (outer 4), full (all cells), or manual',
    },
    slots: {
      type: 'array',
      maxItems: 400,
      description: 'Selected cell-corner slots when mode is "manual"',
      items: fastenerSlotSchema,
    },
  },
  required: ['mode', 'slots'],
  additionalProperties: false,
}

export const fastenersSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Magnet and screw fastener settings (lengths in mm)',
  properties: {
    magnets: fastenerKindSchema,
    screws: fastenerKindSchema,
    magnetPreset: {
      type: 'string',
      enum: ['m6x2', 'm6.5x2.4', 'm8x2', 'custom'] as const,
      description: 'Magnet size preset',
    },
    magnetD: {
      type: 'number',
      minimum: 1,
      maximum: 30,
      description: 'Magnet hole diameter in mm',
    },
    magnetDepth: {
      type: 'number',
      minimum: 0.2,
      maximum: 20,
      description: 'Magnet pocket depth in mm',
    },
    screwPreset: {
      type: 'string',
      enum: ['m3', 'custom'] as const,
      description: 'Screw size preset',
    },
    screwD: {
      type: 'number',
      minimum: 1,
      maximum: 20,
      description: 'Screw hole diameter in mm',
    },
    screwHead: {
      type: 'string',
      enum: ['none', 'countersink', 'counterbore'] as const,
      description: 'Screw head style',
    },
    headD: {
      type: 'number',
      minimum: 1,
      maximum: 30,
      description: 'Screw head diameter in mm',
    },
    headDepth: {
      type: 'number',
      minimum: 0,
      maximum: 20,
      description: 'Counterbore depth in mm',
    },
    tolerance: {
      type: 'number',
      minimum: -1,
      maximum: 2,
      description: 'Fit tolerance added to magnet diameter and depth in mm',
    },
    earWall: {
      type: 'number',
      minimum: 0.4,
      maximum: 10,
      description: 'Wall thickness around fastener holes (ear) in mm',
    },
  },
  required: [
    'magnets',
    'screws',
    'magnetPreset',
    'magnetD',
    'magnetDepth',
    'screwPreset',
    'screwD',
    'screwHead',
    'headD',
    'headDepth',
    'tolerance',
    'earWall',
  ],
  additionalProperties: false,
}

export const rackEarsSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Rack mounting ear hole settings (lengths in mm)',
  properties: {
    positions: {
      type: 'string',
      enum: ['all', 'outer', 'edges'] as const,
      description: 'Ear hole positions per unit: all three, outer two, or edges only',
    },
    shape: {
      type: 'string',
      enum: ['round', 'slot'] as const,
      description: 'Mounting hole shape: round or horizontal slot',
    },
    size: {
      type: 'number',
      minimum: 0,
      maximum: 30,
      description: 'Hole diameter or slot height in mm',
    },
    slotLength: {
      type: 'number',
      minimum: 0,
      maximum: 40,
      description: 'Horizontal slot length in mm',
    },
  },
  required: ['positions', 'shape', 'size', 'slotLength'],
  additionalProperties: false,
}

export const rackPatternSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Through-cut ventilation or decorative pattern settings (lengths in mm)',
  properties: {
    kind: {
      type: 'string',
      enum: ['none', 'skadis', 'hex', 'pills', 'lines', 'passthrough', 'asanoha', 'hicks'] as const,
      description: 'Pattern kind',
    },
    margin: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Margin around the pattern region in mm',
    },
    rotate: {
      type: 'boolean',
      description: 'Rotate pattern by 90 degrees',
    },
    skadis: {
      type: 'object',
      description: 'Skadis pegboard slot settings in mm',
      properties: {
        slotWidth: { type: 'number', minimum: 0.5, maximum: 50, description: 'Slot width in mm' },
        slotLength: { type: 'number', minimum: 1, maximum: 100, description: 'Slot length in mm' },
        pitch: { type: 'number', minimum: 2, maximum: 200, description: 'Horizontal pitch in mm' },
        rowStep: { type: 'number', minimum: 2, maximum: 200, description: 'Vertical row step in mm' },
        shift: { type: 'number', minimum: 0, maximum: 200, description: 'Odd-row horizontal shift in mm' },
      },
      required: ['slotWidth', 'slotLength', 'pitch', 'rowStep', 'shift'],
      additionalProperties: false,
    },
    hex: {
      type: 'object',
      description: 'Hexagon honeycomb pattern settings in mm',
      properties: {
        width: { type: 'number', minimum: 1, maximum: 100, description: 'Flat-to-flat hexagon width in mm' },
        wall: { type: 'number', minimum: 0.2, maximum: 50, description: 'Wall thickness between hexagons in mm' },
      },
      required: ['width', 'wall'],
      additionalProperties: false,
    },
    pills: {
      type: 'object',
      description: 'Slotted pill pattern settings in mm',
      properties: {
        width: { type: 'number', minimum: 1, maximum: 100, description: 'Pill width in mm' },
        length: { type: 'number', minimum: 1, maximum: 200, description: 'Pill length in mm' },
        wall: { type: 'number', minimum: 0.2, maximum: 50, description: 'Wall between pills in mm' },
        edgePills: { type: 'boolean', description: 'Include shortened pills at row ends' },
      },
      required: ['width', 'length', 'wall', 'edgePills'],
      additionalProperties: false,
    },
    lines: {
      type: 'object',
      description: 'Horizontal line slots settings in mm',
      properties: {
        height: { type: 'number', minimum: 0.5, maximum: 100, description: 'Slot height in mm' },
        wall: { type: 'number', minimum: 0.2, maximum: 50, description: 'Wall between slots in mm' },
      },
      required: ['height', 'wall'],
      additionalProperties: false,
    },
    passthrough: {
      type: 'object',
      description: 'Rectangular passthrough opening settings in mm',
      properties: {
        borderX: { type: 'number', minimum: 0, maximum: 100, description: 'Side border width in mm' },
        borderY: { type: 'number', minimum: 0, maximum: 100, description: 'Top and bottom border height in mm' },
        radius: { type: 'number', minimum: 0, maximum: 50, description: 'Corner radius in mm' },
      },
      required: ['borderX', 'borderY', 'radius'],
      additionalProperties: false,
    },
    asanoha: {
      type: 'object',
      description: 'Kumiko asanoha pattern settings in mm',
      properties: {
        width: { type: 'number', minimum: 5, maximum: 200, description: 'Hexagon cell width in mm' },
        mainWidth: { type: 'number', minimum: 0.2, maximum: 20, description: 'Main lattice stroke width in mm' },
        detailWidth: { type: 'number', minimum: 0, maximum: 20, description: 'Detail stroke width in mm (0 disables details)' },
      },
      required: ['width', 'mainWidth', 'detailWidth'],
      additionalProperties: false,
    },
    hicks: {
      type: 'object',
      description: 'Kumiko Hicks hexagon pattern settings in mm',
      properties: {
        width: { type: 'number', minimum: 5, maximum: 200, description: 'Cell flat-to-flat width in mm' },
        stroke: { type: 'number', minimum: 0.2, maximum: 20, description: 'Material stroke width in mm' },
        gap: { type: 'number', minimum: 0.2, maximum: 20, description: 'Cut gap width in mm' },
        edgeCells: { type: 'boolean', description: 'Include clipped cells along the region edge' },
      },
      required: ['width', 'stroke', 'gap', 'edgeCells'],
      additionalProperties: false,
    },
  },
  required: ['kind', 'margin', 'rotate', 'skadis', 'hex', 'pills', 'lines', 'passthrough', 'asanoha', 'hicks'],
  additionalProperties: false,
}
