import type { JsonSchemaObject } from './schema'

export type ToolErrorCode =
  | 'invalid_input'
  | 'no_active_mode'
  | 'read_only_mode'
  | 'unknown_mode'
  | 'unknown_printer'
  | 'nothing_to_export'
  | 'busy'
  | 'rate_limited'
  | 'internal_error'

export interface ToolError {
  code: ToolErrorCode
  message: string
  details?: unknown
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ToolError }

export interface ToolAnnotations {
  readOnlyHint?: boolean
  consequentialHint?: boolean
  untrustedContentHint?: boolean
}

export interface ToolContext {
  signal?: AbortSignal
}

export interface AgentTool<I = Record<string, unknown>, O = unknown> {
  name: string
  description: string
  inputSchema: JsonSchemaObject
  annotations?: ToolAnnotations
  run(input: I, ctx: ToolContext): Promise<ToolResult<O>> | ToolResult<O>
}

export const okResult = <T>(data: T): ToolResult<T> => ({ ok: true, data })

export const errResult = (
  code: ToolErrorCode,
  message: string,
  details?: unknown,
): ToolResult<never> => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
})

/** Реестр инструментов агента (базовые + активного режима), без зависимостей от React и браузера. */
export class ToolRegistry {
  private base = new Map<string, AgentTool>()
  private mode = new Map<string, AgentTool>()
  private listeners = new Set<() => void>()

  setBaseTools(tools: AgentTool[]): void {
    this.base = new Map(tools.map((t) => [t.name, t]))
    this.notify()
  }

  setModeTools(tools: AgentTool[]): void {
    this.mode = new Map(tools.map((t) => [t.name, t]))
    this.notify()
  }

  list(): AgentTool[] {
    const merged = new Map<string, AgentTool>(this.base)
    for (const [k, v] of this.mode) merged.set(k, v)
    return Array.from(merged.values())
  }

  get(name: string): AgentTool | undefined {
    return this.mode.get(name) ?? this.base.get(name)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    this.listeners.forEach((l) => l())
  }
}
