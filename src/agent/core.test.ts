import { describe, expect, it } from 'vitest'
import { ToolRegistry, errResult, okResult } from './registry'
import { MAX_INPUT_BYTES, validateSchema, type JsonSchemaObject } from './schema'
import { applyPatch, diffNormalised, flattenPatchPaths, pickBySchema } from './patch'

const SAMPLE_SCHEMA: JsonSchemaObject = {
  type: 'object',
  properties: {
    pitch: { type: 'number', minimum: 10, maximum: 100 },
    units: { type: 'integer', minimum: 1, maximum: 12 },
    enabled: { type: 'boolean' },
    align: { type: 'string', enum: ['center', 'start', 'end'] as const },
    label: { type: 'string', maxLength: 10 },
    x: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['units', 'mm'] as const },
        value: { type: 'number', minimum: 1, maximum: 1000 },
      },
      required: ['mode', 'value'],
      additionalProperties: false,
    },
    tags: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer', minimum: 0 },
          corner: { type: 'integer', minimum: 0, maximum: 3 },
        },
        required: ['i', 'corner'],
        additionalProperties: false,
      },
    },
  },
  required: ['pitch', 'units', 'enabled', 'align', 'x', 'tags'],
  additionalProperties: false,
}

describe('agent/schema', () => {
  it('accepts valid full object and partial patch', () => {
    const full = {
      pitch: 42,
      units: 2,
      enabled: true,
      align: 'center',
      x: { mode: 'units', value: 4 },
      tags: [{ i: 0, corner: 1 }],
    }
    expect(validateSchema(full, SAMPLE_SCHEMA)).toEqual([])
    expect(validateSchema({ x: { value: 6 } }, SAMPLE_SCHEMA, { partial: true })).toEqual([])
  })

  it('rejects unknown fields with their JSON paths', () => {
    const issues = validateSchema(
      { extraTop: 1, x: { value: 4, bogus: true } },
      SAMPLE_SCHEMA,
      { partial: true },
    )
    expect(issues.map((i) => ({ path: i.path, reason: i.reason }))).toEqual([
      { path: 'extraTop', reason: 'unknown_field' },
      { path: 'x.bogus', reason: 'unknown_field' },
    ])
  })

  it('rejects wrong types including non-integer for integer', () => {
    const issues = validateSchema(
      {
        pitch: '42',
        units: 2.5,
        enabled: 1,
        align: 123,
        x: [1, 2],
      },
      SAMPLE_SCHEMA,
      { partial: true },
    )
    expect(issues.map((i) => ({ path: i.path, reason: i.reason }))).toEqual([
      { path: 'pitch', reason: 'type' },
      { path: 'units', reason: 'type' },
      { path: 'enabled', reason: 'type' },
      { path: 'align', reason: 'type' },
      { path: 'x', reason: 'type' },
    ])
  })

  it('rejects out-of-range numbers, invalid enums, and long strings', () => {
    const issues = validateSchema(
      {
        pitch: 5,
        units: 20,
        align: 'diagonal',
        label: '01234567890',
        x: { value: 2000 },
      },
      SAMPLE_SCHEMA,
      { partial: true },
    )
    expect(issues.map((i) => ({ path: i.path, reason: i.reason }))).toEqual([
      { path: 'pitch', reason: 'minimum' },
      { path: 'units', reason: 'maximum' },
      { path: 'align', reason: 'enum' },
      { path: 'label', reason: 'maxLength' },
      { path: 'x.value', reason: 'maximum' },
    ])
  })

  it('validates arrays, maxItems, and array item schemas', () => {
    const tooMany = validateSchema(
      {
        tags: [
          { i: 0, corner: 0 },
          { i: 0, corner: 1 },
          { i: 0, corner: 2 },
          { i: 0, corner: 3 },
        ],
      },
      SAMPLE_SCHEMA,
      { partial: true },
    )
    expect(tooMany).toEqual([
      expect.objectContaining({ path: 'tags', reason: 'maxItems' }),
    ])

    const badItem = validateSchema(
      {
        tags: [{ i: 0, corner: 9 }, { i: 1 }],
      },
      SAMPLE_SCHEMA,
      { partial: true },
    )
    expect(badItem.map((i) => ({ path: i.path, reason: i.reason }))).toEqual([
      { path: 'tags[0].corner', reason: 'maximum' },
      { path: 'tags[1].corner', reason: 'required' },
    ])
  })

  it('rejects oversized inputs exceeding MAX_INPUT_BYTES', () => {
    const huge = { label: 'x'.repeat(MAX_INPUT_BYTES + 100) }
    const issues = validateSchema(huge, SAMPLE_SCHEMA, { partial: true })
    expect(issues).toEqual([
      expect.objectContaining({ path: '$', reason: 'oversized' }),
    ])
  })
})

describe('agent/patch', () => {
  it('deep-merges nested objects and replaces arrays whole without mutating inputs', () => {
    const base = {
      pitch: 42,
      x: { mode: 'units', value: 2, align: 'center' },
      tags: [{ i: 0, corner: 0 }, { i: 1, corner: 2 }],
    }
    const patch = {
      x: { value: 5 },
      tags: [{ i: 3, corner: 1 }],
    }
    const next = applyPatch(base, patch)
    expect(next).toEqual({
      pitch: 42,
      x: { mode: 'units', value: 5, align: 'center' },
      tags: [{ i: 3, corner: 1 }],
    })
    expect(base.x.value).toBe(2)
    expect(base.tags).toHaveLength(2)
  })

  it('reports normalisation diffs for clamped or adjusted fields', () => {
    const patched = {
      pitch: 42,
      x: { mode: 'units', value: 99 },
      thickness: { floor: -1, rim: 2 },
    }
    const normalised = {
      pitch: 42,
      x: { mode: 'units', value: 50 },
      thickness: { floor: 0, rim: 2 },
    }
    const diffs = diffNormalised(patched, normalised, {
      x: { value: 99 },
      thickness: { floor: -1, rim: 2 },
    })
    expect(diffs).toEqual([
      { path: 'x.value', sent: 99, used: 50 },
      { path: 'thickness.floor', sent: -1, used: 0 },
    ])
  })

  it('flattens patch paths and picks schema fields', () => {
    expect(
      flattenPatchPaths({ x: { value: 4 }, tags: [{ i: 0, corner: 1 }] }),
    ).toEqual([
      { path: 'x.value', value: 4 },
      { path: 'tags', value: [{ i: 0, corner: 1 }] },
    ])

    const picked = pickBySchema(
      {
        pitch: 42,
        units: 2,
        enabled: true,
        align: 'center',
        x: { mode: 'units', value: 4, secret: 'ignore' },
        tags: [],
        internalPreview: { bedX: 256 },
      },
      SAMPLE_SCHEMA,
    )
    expect(picked).toEqual({
      pitch: 42,
      units: 2,
      enabled: true,
      align: 'center',
      x: { mode: 'units', value: 4 },
      tags: [],
    })
  })
})

describe('agent/registry', () => {
  it('constructs results and merges base and mode tools', () => {
    expect(okResult({ a: 1 })).toEqual({ ok: true, data: { a: 1 } })
    expect(errResult('invalid_input', 'bad', { field: 'x' })).toEqual({
      ok: false,
      error: { code: 'invalid_input', message: 'bad', details: { field: 'x' } },
    })
    const reg = new ToolRegistry()
    const changes: number[] = []
    reg.subscribe(() => changes.push(reg.list().length))
    reg.setBaseTools([
      {
        name: 'get_app_state',
        description: 'state',
        inputSchema: { type: 'object', properties: {} },
        run: () => okResult({}),
      },
    ])
    reg.setModeTools([
      {
        name: 'get_parameters',
        description: 'params',
        inputSchema: { type: 'object', properties: {} },
        run: () => okResult({}),
      },
    ])
    expect(reg.list().map((t) => t.name)).toEqual(['get_app_state', 'get_parameters'])
    reg.setModeTools([])
    expect(reg.list().map((t) => t.name)).toEqual(['get_app_state'])
    expect(changes).toEqual([1, 2, 1])
  })
})
