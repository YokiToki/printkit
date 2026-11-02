import { findModeDescriptor, WRITABLE_MODES } from '../modes'
import { errResult, okResult, type AgentTool } from '../registry'
import { validateSchema, type JsonSchemaObject } from '../schema'
import { availableModesSummary, isModeWritable, type AgentToolEnvironment } from './types'

const emptySchema: JsonSchemaObject = {
  type: 'object',
  description: 'No arguments',
  properties: {},
  additionalProperties: false,
}

const openModeSchema: JsonSchemaObject = {
  type: 'object',
  description: 'Navigate to a PrintKit product and mode',
  properties: {
    product: {
      type: 'string',
      description: 'Product identifier (gridfinity, keychain, or rack)',
    },
    mode: {
      type: 'string',
      description:
        'Mode identifier within the product (e.g. baseplate, box, cutout, panel, case, shelf, shape, image)',
    },
  },
  required: ['product', 'mode'],
  additionalProperties: false,
}

export function createGetAppStateTool(env: AgentToolEnvironment): AgentTool {
  return {
    name: 'get_app_state',
    description:
      'Get current PrintKit application state: active product and mode, display unit, language, writable modes, and available tools.',
    inputSchema: emptySchema,
    annotations: { readOnlyHint: true },
    run(input = {}) {
      const finishJob = env.onToolStart?.('get_app_state', 'get_app_state')
      try {
        const issues = validateSchema(input ?? {}, emptySchema)
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'get_app_state', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }
        const handle = env.getModeHandle()
        const unit = env.getUnit?.() ?? 'mm'
        const language = env.getLanguage?.() ?? 'en'
        const data = {
          product: handle ? handle.descriptor.product : null,
          mode: handle ? handle.descriptor.mode : null,
          modeId: handle ? handle.descriptor.id : null,
          writable: handle ? isModeWritable(handle) : false,
          unit,
          units: unit,
          parameterUnit: 'mm' as const,
          language,
          writableModes: WRITABLE_MODES,
          availableModes: availableModesSummary(),
          tools: env.registry.list().map((t) => t.name),
        }
        env.onToolFinish?.({
          tool: 'get_app_state',
          summary: handle ? `${handle.descriptor.product}/${handle.descriptor.mode}` : 'none',
          ok: true,
        })
        return okResult(data)
      } finally {
        finishJob?.()
      }
    },
  }
}

export function createOpenModeTool(env: AgentToolEnvironment): AgentTool {
  return {
    name: 'open_mode',
    description:
      'Open a PrintKit product and mode by navigating to its route. Returns an error with valid mode identifiers if unknown.',
    inputSchema: openModeSchema,
    run(input) {
      const finishJob = env.onToolStart?.('open_mode', 'open_mode')
      try {
        const issues = validateSchema(input, openModeSchema)
        if (issues.length > 0) {
          env.onToolFinish?.({ tool: 'open_mode', summary: 'invalid_input', ok: false })
          return errResult('invalid_input', issues[0].message, { issues })
        }
        const { product, mode } = input as { product: string; mode: string }
        const descriptor = findModeDescriptor(product, mode)
        if (!descriptor) {
          env.onToolFinish?.({
            tool: 'open_mode',
            summary: `${product}/${mode} (unknown)`,
            ok: false,
          })
          return errResult('unknown_mode', `Unknown mode "${product}/${mode}".`, {
            validModes: availableModesSummary(),
          })
        }
        env.navigate?.(descriptor.path)
        env.onToolFinish?.({
          tool: 'open_mode',
          summary: `${descriptor.product}/${descriptor.mode}`,
          ok: true,
        })
        return okResult({
          product: descriptor.product,
          mode: descriptor.mode,
          path: descriptor.path,
          writable: descriptor.writable,
        })
      } finally {
        finishJob?.()
      }
    },
  }
}
