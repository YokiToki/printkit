import {
  defaultShapeState,
  migrateShape,
  shapeParams,
  type ShapeState,
} from '../../features/keychain/shapeState'
import { MAX_SMOOTH, validateKeychain } from '../../geometry/keychain'
import { PATTERN_KINDS } from '../../geometry/patterns/fields'
import { PROFILE_KINDS } from '../../geometry/patterns/profile'
import { SHAPE_KINDS } from '../../geometry/shapes'
import { MAX_TEXT_CHARS } from '../../geometry/text'
import { translateEn } from '../i18nEn'
import { pickBySchema } from '../patch'
import type { JsonSchemaObject } from '../schema'
import type { AgentModeDescriptor } from './types'

export const keychainShapeSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Keychain geometric shape mode parameters (all lengths in mm)',
  properties: {
    shape: {
      type: 'object',
      description: 'Base shape outline and raised rim settings (lengths in mm)',
      properties: {
        kind: {
          type: 'string',
          enum: SHAPE_KINDS,
          description: 'Geometric shape kind: rect, circle, ellipse, capsule, or polygon',
        },
        width: {
          type: 'number',
          minimum: 0,
          maximum: 500,
          description: 'Width in mm (diameter for circle, circumscribed diameter for polygon)',
        },
        height: {
          type: 'number',
          minimum: 0,
          maximum: 500,
          description: 'Height in mm (used by rect, ellipse, capsule)',
        },
        radius: {
          type: 'number',
          minimum: 0,
          maximum: 250,
          description: 'Corner fillet radius in mm (rect and polygon)',
        },
        sides: {
          type: 'integer',
          minimum: 1,
          maximum: 24,
          description: 'Number of polygon sides (valid range 3..12)',
        },
        rotation: {
          type: 'number',
          minimum: -360,
          maximum: 360,
          description: 'Polygon rotation angle in degrees',
        },
        rim: {
          type: 'object',
          description: 'Raised border rim along the shape perimeter (lengths in mm)',
          properties: {
            enabled: { type: 'boolean', description: 'Enable raised rim' },
            width: { type: 'number', minimum: 0, maximum: 50, description: 'Rim inward width in mm' },
            height: { type: 'number', minimum: 0, maximum: 50, description: 'Rim height above plateau in mm' },
          },
          required: ['enabled', 'width', 'height'],
          additionalProperties: false,
        },
      },
      required: ['kind', 'width', 'height', 'radius', 'sides', 'rotation', 'rim'],
      additionalProperties: false,
    },
    relief: {
      type: 'object',
      description: 'Relief height and edge profile settings (lengths in mm)',
      properties: {
        profile: {
          type: 'string',
          enum: PROFILE_KINDS,
          description: 'Edge profile shape: bevel, dome, terrace, flat, or engraved',
        },
        hmax: { type: 'number', minimum: 0, maximum: 50, description: 'Relief plateau height above base in mm' },
        edgeWidth: { type: 'number', minimum: 0, maximum: 100, description: 'Bevel width from outline to plateau in mm' },
        pow: { type: 'number', minimum: 0, maximum: 10, description: 'Bevel curve exponent' },
        steps: { type: 'integer', minimum: 1, maximum: 20, description: 'Number of terrace steps' },
        heightFloor: { type: 'number', minimum: 0, maximum: 50, description: 'Minimum relief height at outline edge in mm' },
        smooth: { type: 'number', minimum: 0, maximum: 10, description: 'Surface smoothing radius in mm (0..3 mm)' },
      },
      required: ['profile', 'hmax', 'edgeWidth', 'pow', 'steps', 'heightFloor'],
      additionalProperties: false,
    },
    detail: {
      type: 'object',
      description: 'Medial spine and edge groove details in mm',
      properties: {
        spineAmp: { type: 'number', minimum: 0, maximum: 20, description: 'Medial spine height in mm (0 disables)' },
        spineWidth: { type: 'number', minimum: 0, maximum: 50, description: 'Medial spine width in mm' },
        grooveDepth: { type: 'number', minimum: 0, maximum: 20, description: 'Perimeter groove depth in mm (0 disables)' },
        grooveWidth: { type: 'number', minimum: 0, maximum: 50, description: 'Perimeter groove width in mm' },
        grooveOffset: { type: 'number', minimum: 0, maximum: 50, description: 'Perimeter groove inset from edge in mm' },
      },
      required: ['spineAmp', 'spineWidth', 'grooveDepth', 'grooveWidth', 'grooveOffset'],
      additionalProperties: false,
    },
    pattern: {
      type: 'object',
      description: 'Surface groove pattern settings (lengths in mm)',
      properties: {
        kind: {
          type: 'string',
          enum: PATTERN_KINDS,
          description: 'Surface pattern kind',
        },
        pitch: { type: 'number', minimum: 0, maximum: 100, description: 'Pattern period in mm' },
        width: { type: 'number', minimum: 0, maximum: 100, description: 'Groove width or dot diameter in mm' },
        depth: { type: 'number', minimum: 0, maximum: 20, description: 'Groove depth in mm' },
        angle: { type: 'number', minimum: -360, maximum: 360, description: 'Pattern angle in degrees' },
        offset: { type: 'number', minimum: -100, maximum: 100, description: 'Pattern shift in mm' },
        staggered: { type: 'boolean', description: 'Stagger alternate dot rows' },
        scope: {
          type: 'string',
          enum: ['relief', 'plateau', 'base'] as const,
          description: 'Where the pattern applies: relief, plateau, or base plate',
        },
      },
      required: ['kind', 'pitch', 'width', 'depth', 'angle', 'offset', 'staggered', 'scope'],
      additionalProperties: false,
    },
    base: {
      type: 'object',
      description: 'Backing plate settings (lengths in mm)',
      properties: {
        thickness: { type: 'number', minimum: 0, maximum: 50, description: 'Base plate thickness in mm (0 for relief only)' },
        shape: {
          type: 'string',
          enum: ['silhouette', 'rect', 'rounded', 'circle'] as const,
          description: 'Base plate outline shape',
        },
        offset: { type: 'number', minimum: 0, maximum: 100, description: 'Silhouette plate outward offset in mm' },
        margin: { type: 'number', minimum: 0, maximum: 100, description: 'Auto-sized plate margin around shape in mm' },
        radius: { type: 'number', minimum: 0, maximum: 100, description: 'Rounded rectangle corner radius in mm' },
        auto: { type: 'boolean', description: 'Size the base plate automatically from the shape plus margin' },
        width: { type: 'number', minimum: 0, maximum: 500, description: 'Manual base plate width (or diameter) in mm' },
        height: { type: 'number', minimum: 0, maximum: 500, description: 'Manual base plate height in mm' },
      },
      required: ['thickness', 'shape', 'offset', 'margin', 'radius', 'auto', 'width', 'height'],
      additionalProperties: false,
    },
    mount: {
      type: 'object',
      description: 'Keyring mount settings (lengths in mm, positions as 0..1 fractions of shape bounds)',
      properties: {
        style: {
          type: 'string',
          enum: ['none', 'hole', 'eyelet', 'channel'] as const,
          description: 'Keyring mount style',
        },
        x: { type: 'number', minimum: -1, maximum: 2, description: 'Mount X position as fraction of shape width (0..1)' },
        y: { type: 'number', minimum: -1, maximum: 2, description: 'Mount Y position as fraction of shape height (0..1, Y up)' },
        diameter: { type: 'number', minimum: 0, maximum: 50, description: 'Hole, eyelet bore, or channel diameter in mm' },
        outer: { type: 'number', minimum: 0, maximum: 100, description: 'Eyelet outer diameter in mm' },
        exitX: { type: 'number', minimum: -1, maximum: 2, description: 'Channel exit X position fraction' },
        exitY: { type: 'number', minimum: -1, maximum: 2, description: 'Channel exit Y position fraction' },
        minWall: { type: 'number', minimum: 0, maximum: 20, description: 'Minimum wall around mount in mm' },
      },
      required: ['style', 'x', 'y', 'diameter', 'outer', 'exitX', 'exitY', 'minWall'],
      additionalProperties: false,
    },
    split: {
      type: 'object',
      description: 'Two-halves split and alignment pins settings (lengths in mm)',
      properties: {
        enabled: { type: 'boolean', description: 'Split into two mirrored halves for flat printing' },
        pins: { type: 'integer', minimum: 0, maximum: 10, description: 'Number of alignment pins (valid range 0..6)' },
        pinRadius: { type: 'number', minimum: 0, maximum: 20, description: 'Pin hole radius in mm' },
        clearance: { type: 'number', minimum: 0, maximum: 5, description: 'Pin radial clearance in mm' },
        pinDepth: { type: 'number', minimum: 0, maximum: 20, description: 'Pin hole depth per half in mm' },
        gap: { type: 'number', minimum: 0, maximum: 100, description: 'Gap between parts on print sheet in mm' },
      },
      required: ['enabled', 'pins', 'pinRadius', 'clearance', 'pinDepth', 'gap'],
      additionalProperties: false,
    },
    text: {
      type: 'object',
      description: 'Embossed or engraved text overlay (lengths in mm)',
      properties: {
        enabled: { type: 'boolean', description: 'Enable text overlay' },
        content: {
          type: 'string',
          maxLength: MAX_TEXT_CHARS,
          description: 'Text content (untrusted user text, max 400 chars)',
        },
        font: {
          type: 'object',
          description: 'Font family and style',
          properties: {
            id: { type: 'string', maxLength: 64, description: 'Font family identifier (e.g. "roboto", "inter")' },
            bold: { type: 'boolean', description: 'Bold weight' },
            italic: { type: 'boolean', description: 'Italic style' },
          },
          required: ['id', 'bold', 'italic'],
          additionalProperties: false,
        },
        size: { type: 'number', minimum: 0, maximum: 200, description: 'Capital letter height in mm' },
        letterSpacing: { type: 'number', minimum: -20, maximum: 50, description: 'Extra letter spacing in mm' },
        lineSpacing: { type: 'number', minimum: 0, maximum: 10, description: 'Line spacing multiplier' },
        align: {
          type: 'string',
          enum: ['left', 'center', 'right'] as const,
          description: 'Multi-line text alignment',
        },
        rotation: { type: 'number', minimum: -360, maximum: 360, description: 'Text rotation in degrees' },
        mode: {
          type: 'string',
          enum: ['emboss', 'engrave'] as const,
          description: 'Text mode: emboss (raised) or engrave (cut)',
        },
        height: { type: 'number', minimum: 0, maximum: 20, description: 'Embossed height in mm' },
        depth: { type: 'number', minimum: 0, maximum: 20, description: 'Engraved depth in mm' },
        x: { type: 'number', minimum: -1, maximum: 2, description: 'Text centre X fraction of shape bounds (0..1)' },
        y: { type: 'number', minimum: -1, maximum: 2, description: 'Text centre Y fraction of shape bounds (0..1)' },
      },
      required: [
        'enabled',
        'content',
        'font',
        'size',
        'letterSpacing',
        'lineSpacing',
        'align',
        'rotation',
        'mode',
        'height',
        'depth',
        'x',
        'y',
      ],
      additionalProperties: false,
    },
    quality: {
      type: 'object',
      description: 'Grid resolution settings (cell size in mm)',
      properties: {
        cell: { type: 'number', minimum: 0, maximum: 20, description: 'Target relief grid step in mm (0.02..5 mm)' },
        maxTriangles: { type: 'integer', minimum: 1000, maximum: 2_000_000, description: 'Triangle budget' },
      },
      required: ['cell', 'maxTriangles'],
      additionalProperties: false,
    },
  },
  required: ['shape', 'relief', 'detail', 'pattern', 'base', 'mount', 'split', 'text', 'quality'],
  additionalProperties: false,
}

export const keychainShapeDescriptor: AgentModeDescriptor<ShapeState> = {
  id: 'keychainShape',
  product: 'keychain',
  mode: 'shape',
  path: '/keychain/shape',
  writable: true,
  hasUntrustedText: true,
  defaults: defaultShapeState,
  schema: keychainShapeSchema,
  excludedFields: [
    'source.kind',
    'source.contrast',
    'source.gamma',
    'source.invert',
    'source.smooth',
    'source.despeckle',
    'source.mix.contour',
    'source.mix.depth',
    'source.mix.detail',
    'source.depthId',
    'source.depthModel',
    'source.boost',
    'source.boostRadius',
    'source.levels',
    'source.levelSoftness',
    'source.detailMode',
    'source.darkThreshold',
    'source.snap',
    'source.maxSlope',
    'source.finalSmooth',
    'split.pinPositions',
  ],
  normalise(raw) {
    const migrated = migrateShape(raw) as unknown as ShapeState
    const smooth = Math.max(0, Math.min(MAX_SMOOTH, migrated.relief.smooth ?? 0))
    return {
      ...migrated,
      relief: { ...migrated.relief, smooth },
    }
  },
  validate(state) {
    const check = validateKeychain(shapeParams(state))
    return {
      errors: check.errors.map((e) => ({
        field: e.field,
        key: e.key,
        message: translateEn(e.key),
      })),
      warnings: [],
    }
  },
  describe(state) {
    return pickBySchema(state, keychainShapeSchema)
  },
}
