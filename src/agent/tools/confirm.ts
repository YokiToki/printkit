import type { ExportFormat } from '../../export/settings'

export const CONFIRM_TIMEOUT_MS = 120_000

export type ConfirmDecision = 'confirmed' | 'declined' | 'timeout'

export interface ExportFilePreview {
  name: string
  bytes: number
  blob: Blob
}

export interface ExportDialogPrompt {
  kind: 'export'
  modeName: string
  format: ExportFormat
  files: ExportFilePreview[]
  plates: number
  overflow: boolean
}

export interface ResetDialogPrompt {
  kind: 'reset'
  modeId: string
  product: string
  mode: string
}

export type ActiveAgentDialog = ExportDialogPrompt | ResetDialogPrompt

/** Координатор диалогов подтверждения действий агента (не более одного активного окна, таймаут 120 с). */
export class DialogCoordinator {
  private current: {
    prompt: ActiveAgentDialog
    finish: (decision: ConfirmDecision) => void
  } | null = null
  private listeners = new Set<() => void>()
  private timeoutMs: number

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? CONFIRM_TIMEOUT_MS
  }

  isBusy(): boolean {
    return this.current !== null
  }

  getActive(): ActiveAgentDialog | null {
    return this.current?.prompt ?? null
  }

  request(prompt: ActiveAgentDialog, signal?: AbortSignal): Promise<ConfirmDecision> {
    if (this.current) {
      return Promise.resolve('declined')
    }
    if (signal?.aborted) {
      return Promise.resolve('timeout')
    }
    return new Promise<ConfirmDecision>((resolve) => {
      let settled = false
      const settle = (decision: ConfirmDecision) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        this.current = null
        this.notify()
        resolve(decision)
      }
      const onAbort = () => settle('timeout')
      const timer = setTimeout(() => settle('timeout'), this.timeoutMs)
      signal?.addEventListener('abort', onAbort, { once: true })
      this.current = { prompt, finish: settle }
      this.notify()
    })
  }

  confirm(): void {
    this.current?.finish('confirmed')
  }

  decline(): void {
    this.current?.finish('declined')
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
