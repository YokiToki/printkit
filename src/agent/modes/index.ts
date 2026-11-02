import { defaultCutout, cutoutNotices, validateCutout, type CutoutParams } from '../../geometry/cutout'
import { defaultKeychain, validateKeychain, type KeychainParams } from '../../geometry/keychain'
import { migrateCutout } from '../../features/cutout/migrate'
import { migrateKeychain } from '../../features/keychain/migrate'
import { translateEn } from '../i18nEn'
import { pickBySchema } from '../patch'
import type { JsonSchemaObject } from '../schema'
import { axisSizeSchema, fastenersSchema, type AgentModeDescriptor, type ValidationSummary } from './types'
import { baseplateDescriptor } from './baseplate'
import { boxDescriptor } from './box'
import { rackPanelDescriptor } from './rackPanel'
import { rackCaseDescriptor } from './rackCase'
import { rackShelfDescriptor } from './rackShelf'
import { keychainShapeDescriptor } from './keychainShape'

const cutoutSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Gridfinity cutout bin numeric parameters (read-only mode; lengths in mm)',
  properties: {
    pitch: {
      type: 'number',
      minimum: 10,
      maximum: 200,
      description: 'Gridfinity cell pitch in mm',
    },
    x: axisSizeSchema,
    y: axisSizeSchema,
    height: {
      type: 'object',
      description: 'Bin height in 7 mm units or millimetres (mm)',
      properties: {
        mode: { type: 'string', enum: ['units', 'mm'] as const, description: 'Height mode' },
        value: { type: 'number', minimum: 0, maximum: 2000, description: 'Height value' },
      },
      required: ['mode', 'value'],
      additionalProperties: false,
    },
    thickness: {
      type: 'object',
      description: 'Bin wall and floor thicknesses in mm',
      properties: {
        outerWall: { type: 'number', minimum: 0, maximum: 50, description: 'Outer wall in mm' },
        innerWall: { type: 'number', minimum: 0, maximum: 50, description: 'Inner wall in mm' },
        floor: { type: 'number', minimum: 0, maximum: 50, description: 'Floor thickness in mm' },
      },
      required: ['outerWall', 'innerWall', 'floor'],
      additionalProperties: false,
    },
    lip: {
      type: 'string',
      enum: ['default', 'thin', 'none'] as const,
      description: 'Stacking lip profile',
    },
    fasteners: fastenersSchema,
  },
  required: ['pitch', 'x', 'y', 'height', 'thickness', 'lip', 'fasteners'],
  additionalProperties: false,
}

function validateCutoutAgent(p: CutoutParams): ValidationSummary {
  const check = validateCutout(p)
  const errors = check.errors.map((e) => ({ field: e.field, key: e.key, message: translateEn(e.key) }))
  const warnings = cutoutNotices(p).map((w) => ({ field: `cutout.${w.id}`, key: w.key, message: translateEn(w.key) }))
  return { errors, warnings }
}

export const cutoutDescriptor: AgentModeDescriptor<CutoutParams> = {
  id: 'cutout',
  product: 'gridfinity',
  mode: 'cutout',
  path: '/gridfinity/cutout',
  writable: false,
  defaults: defaultCutout,
  schema: cutoutSchema,
  excludedFields: ['cutouts'],
  describe: (p) => pickBySchema(p, cutoutSchema),
  normalise: (p) => migrateCutout(p) as unknown as CutoutParams,
  validate: validateCutoutAgent,
}

const keychainImageSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Keychain image mode numeric parameters (read-only mode; lengths in mm)',
  properties: {
    size: {
      type: 'object',
      description: 'Target keychain dimensions in mm',
      properties: {
        mode: {
          type: 'string',
          enum: ['longest', 'width', 'height', 'box'] as const,
          description: 'Sizing mode',
        },
        longest: { type: 'number', minimum: 5, maximum: 500, description: 'Longest side in mm' },
        width: { type: 'number', minimum: 5, maximum: 500, description: 'Width in mm' },
        height: { type: 'number', minimum: 5, maximum: 500, description: 'Height in mm' },
      },
      required: ['mode', 'longest', 'width', 'height'],
      additionalProperties: false,
    },
    relief: keychainShapeDescriptor.schema.properties!.relief,
    detail: keychainShapeDescriptor.schema.properties!.detail,
    pattern: keychainShapeDescriptor.schema.properties!.pattern,
    base: keychainShapeDescriptor.schema.properties!.base,
    mount: keychainShapeDescriptor.schema.properties!.mount,
    split: keychainShapeDescriptor.schema.properties!.split,
    text: keychainShapeDescriptor.schema.properties!.text,
    quality: keychainShapeDescriptor.schema.properties!.quality,
  },
  required: ['size', 'relief', 'detail', 'pattern', 'base', 'mount', 'split', 'text', 'quality'],
  additionalProperties: false,
}

function validateKeychainImageAgent(p: KeychainParams): ValidationSummary {
  const check = validateKeychain(p)
  const errors = check.errors.map((e) => ({ field: e.field, key: e.key, message: translateEn(e.key) }))
  return { errors, warnings: [] }
}

export const keychainImageDescriptor: AgentModeDescriptor<KeychainParams> = {
  id: 'keychainImage',
  product: 'keychain',
  mode: 'image',
  path: '/keychain/image',
  writable: false,
  hasUntrustedText: true,
  defaults: defaultKeychain,
  schema: keychainImageSchema,
  excludedFields: [
    'origin',
    'imageId',
    'crop',
    'outline',
    'silhouette',
    'source',
    'split.pinPositions',
  ],
  describe: (p) => pickBySchema(p, keychainImageSchema),
  normalise: (p) => migrateKeychain(p) as unknown as KeychainParams,
  validate: validateKeychainImageAgent,
}

export const WRITABLE_MODES = [
  { product: 'gridfinity', mode: 'baseplate' },
  { product: 'gridfinity', mode: 'box' },
  { product: 'rack', mode: 'panel' },
  { product: 'rack', mode: 'case' },
  { product: 'rack', mode: 'shelf' },
  { product: 'keychain', mode: 'shape' },
] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODE_DESCRIPTORS: readonly AgentModeDescriptor<any>[] = [
  baseplateDescriptor,
  boxDescriptor,
  cutoutDescriptor,
  rackPanelDescriptor,
  rackCaseDescriptor,
  rackShelfDescriptor,
  keychainShapeDescriptor,
  keychainImageDescriptor,
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findModeDescriptor(product: string, mode: string): AgentModeDescriptor<any> | undefined {
  return MODE_DESCRIPTORS.find((d) => d.product === product && d.mode === mode)
}

export {
  baseplateDescriptor,
  boxDescriptor,
  rackPanelDescriptor,
  rackCaseDescriptor,
  rackShelfDescriptor,
  keychainShapeDescriptor,
}
export type { AgentModeDescriptor, AgentModeId, ValidationSummary } from './types'
