export const MAX_AGENT_HISTORY = 10

export interface AgentHistoryEntry<T = unknown> {
  id: number
  modeId: string
  label: string
  before: T
  after: T
  logEntryId?: number
}

export type UndoOutcome<T = unknown> =
  | { status: 'restored'; entry: AgentHistoryEntry<T>; state: T }
  | { status: 'changed_since'; entry: AgentHistoryEntry<T>; state: T }
  | { status: 'empty' }

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const cloneDeep = <T>(v: T): T => {
  if (Array.isArray(v)) return v.map((item) => cloneDeep(item)) as unknown as T
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = cloneDeep(val)
    return out as T
  }
  return v
}

export function statesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => statesEqual(v, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => k in b && statesEqual(a[k], b[k]))
  }
  return false
}

/** Стек последних 10 изменений агента для каждого режима с проверкой ручных правок после агента. */
export class AgentHistory {
  private stacks = new Map<string, AgentHistoryEntry[]>()
  private listeners = new Set<() => void>()
  private nextId = 1
  private version = 0

  record<T>(input: {
    modeId: string
    label: string
    before: T
    after: T
    logEntryId?: number
  }): AgentHistoryEntry<T> {
    const entry: AgentHistoryEntry<T> = {
      id: this.nextId++,
      modeId: input.modeId,
      label: input.label,
      before: cloneDeep(input.before),
      after: cloneDeep(input.after),
      ...(input.logEntryId !== undefined && { logEntryId: input.logEntryId }),
    }
    const prev = this.stacks.get(input.modeId) ?? []
    const next = [...prev, entry as AgentHistoryEntry]
    while (next.length > MAX_AGENT_HISTORY) next.shift()
    this.stacks.set(input.modeId, next)
    this.bump()
    return entry
  }

  list<T = unknown>(modeId: string): readonly AgentHistoryEntry<T>[] {
    return (this.stacks.get(modeId) ?? []) as readonly AgentHistoryEntry<T>[]
  }

  peek<T = unknown>(modeId: string): AgentHistoryEntry<T> | undefined {
    const stack = this.stacks.get(modeId)
    return stack && stack.length > 0
      ? (stack[stack.length - 1] as AgentHistoryEntry<T>)
      : undefined
  }

  findByLogEntry<T = unknown>(logEntryId: number): AgentHistoryEntry<T> | undefined {
    for (const stack of this.stacks.values()) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].logEntryId === logEntryId) return stack[i] as AgentHistoryEntry<T>
      }
    }
    return undefined
  }

  hasChangedSince(modeId: string, currentState: unknown): boolean {
    const top = this.peek(modeId)
    if (!top) return false
    return !statesEqual(currentState, top.after)
  }

  undo<T = unknown>(
    modeId: string,
    currentState: T,
    options: { force?: boolean } = {},
  ): UndoOutcome<T> {
    const stack = this.stacks.get(modeId)
    if (!stack || stack.length === 0) return { status: 'empty' }
    const top = stack[stack.length - 1] as AgentHistoryEntry<T>
    if (!options.force && !statesEqual(currentState, top.after)) {
      return {
        status: 'changed_since',
        entry: top,
        state: cloneDeep(top.before),
      }
    }
    const next = stack.slice(0, -1)
    if (next.length === 0) this.stacks.delete(modeId)
    else this.stacks.set(modeId, next)
    this.bump()
    return {
      status: 'restored',
      entry: top,
      state: cloneDeep(top.before),
    }
  }

  clear(modeId?: string): void {
    if (modeId) this.stacks.delete(modeId)
    else this.stacks.clear()
    this.bump()
  }

  reset(): void {
    this.stacks.clear()
    this.nextId = 1
    this.bump()
  }

  getVersion(): number {
    return this.version
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private bump(): void {
    this.version++
    this.listeners.forEach((l) => l())
  }
}

export const agentHistory = new AgentHistory()
