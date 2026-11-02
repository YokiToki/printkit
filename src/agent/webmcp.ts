import {
  errResult,
  type AgentTool,
  type ToolAnnotations,
  type ToolRegistry,
  type ToolResult,
} from './registry'
import type { JsonSchemaObject } from './schema'

export interface WebMcpToolDefinition {
  name: string
  description: string
  inputSchema: JsonSchemaObject
  annotations?: ToolAnnotations
  execute(input: unknown, ctx?: { signal?: AbortSignal } | AbortSignal): Promise<ToolResult>
}

export interface ModelContextLike {
  registerTool(
    tool: WebMcpToolDefinition,
    options?: { signal?: AbortSignal },
  ): Promise<void> | void
  dispatchEvent?(event: Event): boolean
  addEventListener?(type: string, listener: EventListener): void
  removeEventListener?(type: string, listener: EventListener): void
}

export interface WebMcpEnv {
  document?: { modelContext?: ModelContextLike }
  navigator?: { modelContext?: ModelContextLike }
}

export interface WebMcpOptions {
  env?: WebMcpEnv
  now?: () => number
  maxCallsPerSecond?: number
  onExecute?: (
    tool: AgentTool,
    input: Record<string, unknown>,
    invoke: () => Promise<ToolResult>,
  ) => Promise<ToolResult>
}

export interface WebMcpHandle {
  readonly context: ModelContextLike
  sync(): void
  dispose(): void
}

export const RATE_LIMIT_PER_SECOND = 20

/** Определяет точку входа WebMCP в браузере (`document.modelContext`, с запасом на `navigator.modelContext`). */
export function detectModelContext(env?: WebMcpEnv): ModelContextLike | null {
  const docMc = env
    ? env.document?.modelContext
    : typeof document !== 'undefined'
      ? (document as unknown as { modelContext?: ModelContextLike }).modelContext
      : undefined
  if (docMc && typeof docMc.registerTool === 'function') return docMc

  const navMc = env
    ? env.navigator?.modelContext
    : typeof navigator !== 'undefined'
      ? (navigator as unknown as { modelContext?: ModelContextLike }).modelContext
      : undefined
  if (navMc && typeof navMc.registerTool === 'function') return navMc

  return null
}

function extractSignal(ctx?: { signal?: AbortSignal } | AbortSignal): AbortSignal | undefined {
  if (!ctx) return undefined
  if (typeof AbortSignal !== 'undefined' && ctx instanceof AbortSignal) return ctx
  if (typeof ctx === 'object' && 'signal' in ctx) return ctx.signal
  return undefined
}

/** Регистрирует инструменты из `ToolRegistry` в WebMCP браузера и поддерживает их синхронизацию. */
export function installWebMcp(
  registry: ToolRegistry,
  options: WebMcpOptions = {},
): WebMcpHandle | null {
  const mc = detectModelContext(options.env)
  if (!mc) return null

  const now = options.now ?? (() => Date.now())
  const limit = options.maxCallsPerSecond ?? RATE_LIMIT_PER_SECOND
  const callTimes: number[] = []
  const controllers = new Map<string, { tool: AgentTool; controller: AbortController }>()
  let disposed = false

  const checkRateLimit = (): boolean => {
    const t = now()
    while (callTimes.length > 0 && t - callTimes[0] >= 1000) {
      callTimes.shift()
    }
    if (callTimes.length >= limit) return false
    callTimes.push(t)
    return true
  }

  const wrapExecute = (tool: AgentTool) => async (
    rawInput: unknown,
    rawCtx?: { signal?: AbortSignal } | AbortSignal,
  ): Promise<ToolResult> => {
    if (!checkRateLimit()) {
      return errResult('rate_limited', `Rate limit exceeded (max ${limit} calls per second)`)
    }
    const input =
      typeof rawInput === 'object' && rawInput !== null && !Array.isArray(rawInput)
        ? (rawInput as Record<string, unknown>)
        : {}
    const signal = extractSignal(rawCtx)
    const invoke = async (): Promise<ToolResult> => {
      try {
        return await tool.run(input, { signal })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return errResult('internal_error', message || 'Tool execution failed')
      }
    }
    try {
      return options.onExecute ? await options.onExecute(tool, input, invoke) : await invoke()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return errResult('internal_error', message || 'Tool execution failed')
    }
  }

  const emitToolChangeIfNeeded = (nativeFired: boolean) => {
    if (!nativeFired && typeof mc.dispatchEvent === 'function' && typeof Event !== 'undefined') {
      try {
        mc.dispatchEvent(new Event('toolchange'))
      } catch {
        /* ignore if target rejects synthetic event */
      }
    }
  }

  const sync = () => {
    if (disposed) return
    const desired = registry.list()
    const desiredMap = new Map(desired.map((t) => [t.name, t]))
    let changed = false
    let nativeFired = false
    const onNative = () => {
      nativeFired = true
    }
    mc.addEventListener?.('toolchange', onNative)

    try {
      for (const [name, entry] of controllers) {
        const nextTool = desiredMap.get(name)
        if (!nextTool || nextTool !== entry.tool) {
          entry.controller.abort()
          controllers.delete(name)
          changed = true
        }
      }
      for (const tool of desired) {
        if (controllers.has(tool.name)) continue
        const controller = new AbortController()
        controllers.set(tool.name, { tool, controller })
        changed = true
        try {
          const maybePromise = mc.registerTool(
            {
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
              annotations: {
                readOnlyHint: Boolean(tool.annotations?.readOnlyHint),
                consequentialHint: Boolean(tool.annotations?.consequentialHint),
                untrustedContentHint: Boolean(tool.annotations?.untrustedContentHint),
              },
              execute: wrapExecute(tool),
            },
            { signal: controller.signal },
          )
          if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
            ;(maybePromise as Promise<void>).catch(() => {})
          }
        } catch {
          controllers.delete(tool.name)
        }
      }
    } finally {
      mc.removeEventListener?.('toolchange', onNative)
    }

    if (changed) emitToolChangeIfNeeded(nativeFired)
  }

  const unsubscribe = registry.subscribe(sync)
  sync()

  return {
    context: mc,
    sync,
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      let hadTools = false
      let nativeFired = false
      const onNative = () => {
        nativeFired = true
      }
      mc.addEventListener?.('toolchange', onNative)
      try {
        for (const [, entry] of controllers) {
          entry.controller.abort()
          hadTools = true
        }
        controllers.clear()
      } finally {
        mc.removeEventListener?.('toolchange', onNative)
      }
      if (hadTools) emitToolChangeIfNeeded(nativeFired)
    },
  }
}
