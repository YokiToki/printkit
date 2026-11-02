import { agentHistory } from '../history'
import { applyPatch, diffNormalised, flattenPatchPaths } from '../patch'
import { errResult, okResult, type AgentTool } from '../registry'
import { validateSchema, type JsonSchemaObject } from '../schema'
import { DialogCoordinator } from './confirm'
import {
  isModeWritable,
  noActiveModeError,
  readOnlyModeError,
  type AgentToolEnvironment,
} from './types'

const emptySchema: JsonSchemaObject = {
  type: 'object',
  description: 'No arguments',
  properties: {},
  additionalProperties: false,
}

const defaultDialogs = new DialogCoordinator()

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Формирует краткую человекочитаемую сводку изменённых путей патча для журнала активности и стека отмены. */
export function summarizePatch(patch: Record<string, unknown>, modePrefix?: string, maxItems = 4): string {
  const flat = flattenPatchPaths(patch)
  if (flat.length === 0) return modePrefix ? `${modePrefix}: (no changes)` : '(no changes)'
  const parts = flat.slice(0, maxItems).map(({ path, value }) => {
    const fullPath = modePrefix ? `${modePrefix}.${path}` : path
    const formatted = Array.isArray(value)
      ? `[${value.length}]`
      : typeof value === 'string'
        ? value
        : JSON.stringify(value)
    return `${fullPath} = ${formatted}`
  })
  const extra = flat.length > maxItems ? ` (+${flat.length - maxItems})` : ''
  return `${parts.join(', ')}${extra}`
}

export function createGetParametersTool(env: AgentToolEnvironment): AgentTool {
  return {
    name: 'get_parameters',
    description:
      'Get current parameters (in millimetres), parameter JSON schema, defaults, and validation state for the active mode.',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    run(input = {}) {
      const finishJob = env.onToolStart?.('get_parameters', 'get_parameters')
      try {
        const handle = env.getModeHandle()
        if (!handle) {
          env.onToolFinish?.({ tool: 'get_parameters', summary: 'no_active_mode', ok: false })
          return noActiveModeError()
        }
        const issues = validateSchema(input ?? {}, emptySchema)
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'get_parameters', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }
        const { descriptor } = handle
        const state = handle.getState()
        const defaults = handle.defaults ?? descriptor.defaults
        const validation = descriptor.validate(state)
        env.onToolFinish?.({
          tool: 'get_parameters',
          summary: `${descriptor.product}/${descriptor.mode}`,
          ok: true,
        })
        return okResult({
          product: descriptor.product,
          mode: descriptor.mode,
          writable: isModeWritable(handle),
          unit: 'mm' as const,
          parameters: descriptor.describe(state),
          defaults: descriptor.describe(defaults),
          schema: descriptor.schema,
          errors: validation.errors,
          warnings: validation.warnings,
        })
      } finally {
        finishJob?.()
      }
    },
  }
}

export function createSetParametersTool(env: AgentToolEnvironment): AgentTool {
  const activeHandle = env.getModeHandle()
  const activeDescriptor = activeHandle?.descriptor
  const inputSchema: JsonSchemaObject = activeDescriptor
    ? {
        type: 'object',
        description: `Partial parameter patch for ${activeDescriptor.product}/${activeDescriptor.mode} (all lengths in mm). Pass fields in "patch" or at top level.`,
        properties: {
          patch: activeDescriptor.schema,
          ...activeDescriptor.schema.properties,
        },
        additionalProperties: false,
      }
    : {
        type: 'object',
        description: 'Partial parameter patch for the active mode (all lengths in mm).',
        properties: {
          patch: {
            type: 'object',
            properties: {},
          },
        },
        additionalProperties: false,
      }

  return {
    name: 'set_parameters',
    description:
      'Apply a validated partial parameter patch (all lengths in mm) to the active writable mode and return the updated parameters, normalisation diffs, and validation messages.',
    inputSchema,
    annotations: { consequentialHint: true },
    run(input) {
      const finishJob = env.onToolStart?.('set_parameters', 'set_parameters')
      try {
        const handle = env.getModeHandle()
        if (!handle) {
          env.onToolFinish?.({ tool: 'set_parameters', summary: 'no_active_mode', ok: false })
          return noActiveModeError()
        }
        if (!isModeWritable(handle)) {
          env.onToolFinish?.({ tool: 'set_parameters', summary: 'read_only_mode', ok: false })
          return readOnlyModeError(handle)
        }
        const { descriptor } = handle
        let candidatePatch: unknown = input
        if (isPlainObject(input) && 'patch' in input) {
          const keys = Object.keys(input)
          if (keys.length === 1) {
            candidatePatch = input.patch
          } else {
            const envelopeSchema: JsonSchemaObject = {
              type: 'object',
              properties: { patch: descriptor.schema },
              required: ['patch'],
              additionalProperties: false,
            }
            const envelopeIssues = validateSchema(input, envelopeSchema, { partial: true })
            env.onToolFinish?.({ tool: 'set_parameters', summary: 'invalid_input', ok: false })
            return errResult('invalid_input', envelopeIssues[0]?.message ?? 'Invalid patch', {
              issues: envelopeIssues,
            })
          }
        }

        const issues = validateSchema(candidatePatch, descriptor.schema, { partial: true })
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'set_parameters', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }

        const patchObj = candidatePatch as Record<string, unknown>
        const before = handle.getState()
        const patched = applyPatch(before, patchObj)
        const next = descriptor.normalise(patched as Record<string, unknown>)
        const normalised = diffNormalised(patched, next, patchObj)
        const { errors, warnings } = descriptor.validate(next)

        handle.setState?.(next)

        const summary = summarizePatch(patchObj, descriptor.mode)
        const logEntryId = env.onToolFinish?.({
          tool: 'set_parameters',
          summary,
          ok: true,
        })
        const history = env.history ?? agentHistory
        history.record({
          modeId: descriptor.id,
          label: summary,
          before,
          after: next,
          ...(typeof logEntryId === 'number' ? { logEntryId } : {}),
        })

        return okResult({
          applied: true,
          unit: 'mm' as const,
          parameters: descriptor.describe(next),
          normalised,
          errors,
          warnings,
        })
      } finally {
        finishJob?.()
      }
    },
  }
}

export function createResetParametersTool(env: AgentToolEnvironment): AgentTool {
  return {
    name: 'reset_parameters',
    description:
      'Ask the user to confirm resetting the active mode parameters to their defaults. Resolves with status "reset", "declined", or "timeout".',
    inputSchema: emptySchema,
    annotations: { consequentialHint: true },
    async run(input = {}, ctx) {
      const finishJob = env.onToolStart?.('reset_parameters', 'reset_parameters')
      try {
        const handle = env.getModeHandle()
        if (!handle) {
          env.onToolFinish?.({ tool: 'reset_parameters', summary: 'no_active_mode', ok: false })
          return noActiveModeError()
        }
        if (!isModeWritable(handle)) {
          env.onToolFinish?.({ tool: 'reset_parameters', summary: 'read_only_mode', ok: false })
          return readOnlyModeError(handle)
        }
        const issues = validateSchema(input ?? {}, emptySchema)
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'reset_parameters', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }
        const { descriptor } = handle
        const dialogs = env.dialogs ?? defaultDialogs
        const decision = await dialogs.request(
          {
            kind: 'reset',
            modeId: descriptor.id,
            product: descriptor.product,
            mode: descriptor.mode,
          },
          ctx.signal,
        )
        if (decision !== 'confirmed') {
          env.onToolFinish?.({
            tool: 'reset_parameters',
            summary: `${descriptor.mode}: ${decision}`,
            ok: true,
          })
          return okResult({
            status: decision,
            reset: false,
            unit: 'mm' as const,
            parameters: descriptor.describe(handle.getState()),
          })
        }

        const before = handle.getState()
        const defaults = handle.defaults ?? descriptor.defaults
        const next = descriptor.normalise(applyPatch(defaults, {}) as Record<string, unknown>)
        if (handle.onReset) {
          handle.onReset()
        } else {
          handle.setState?.(next)
        }

        const summary = `${descriptor.mode}: reset to defaults`
        const logEntryId = env.onToolFinish?.({
          tool: 'reset_parameters',
          summary,
          ok: true,
        })
        const history = env.history ?? agentHistory
        history.record({
          modeId: descriptor.id,
          label: summary,
          before,
          after: next,
          ...(typeof logEntryId === 'number' ? { logEntryId } : {}),
        })

        return okResult({
          status: 'reset' as const,
          reset: true,
          unit: 'mm' as const,
          parameters: descriptor.describe(next),
        })
      } finally {
        finishJob?.()
      }
    },
  }
}
