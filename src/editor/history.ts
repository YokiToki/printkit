export interface HistoryStep<T> {
  label: string
  before: T
  after: T
  timestamp: number
  mergeKey?: string
}

export interface HistoryOptions {
  capacity?: number
  mergeWindowMs?: number
}

export class History<T> {
  private undoStack: HistoryStep<T>[] = []
  private redoStack: HistoryStep<T>[] = []
  readonly capacity: number
  readonly mergeWindowMs: number

  constructor(options: HistoryOptions = {}) {
    this.capacity = options.capacity ?? 100
    this.mergeWindowMs = options.mergeWindowMs ?? 800
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  currentUndoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.label
  }

  currentRedoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.label
  }

  push(label: string, before: T, after: T, mergeKey?: string, now = Date.now()): void {
    this.redoStack = []

    const last = this.undoStack[this.undoStack.length - 1]
    if (
      last &&
      mergeKey !== undefined &&
      last.mergeKey === mergeKey &&
      now - last.timestamp <= this.mergeWindowMs
    ) {
      last.after = after
      last.label = label
      last.timestamp = now
      return
    }

    this.undoStack.push({
      label,
      before,
      after,
      timestamp: now,
      mergeKey,
    })

    if (this.undoStack.length > this.capacity) {
      this.undoStack.shift()
    }
  }

  undo(): { state: T; label: string } | null {
    const step = this.undoStack.pop()
    if (!step) return null
    this.redoStack.push(step)
    return { state: step.before, label: step.label }
  }

  redo(): { state: T; label: string } | null {
    const step = this.redoStack.pop()
    if (!step) return null
    this.undoStack.push(step)
    return { state: step.after, label: step.label }
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  getUndoCount(): number {
    return this.undoStack.length
  }

  getRedoCount(): number {
    return this.redoStack.length
  }
}
