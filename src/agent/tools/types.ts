import type { ExportFormat, ExportSettings } from '../../export/settings'
import type { ModelResult } from '../../geometry/model'
import type { AgentHistory } from '../history'
import type { AgentModeDescriptor } from '../modes/types'
import { errResult, type ToolRegistry, type ToolResult } from '../registry'
import { MODE_DESCRIPTORS } from '../modes'
import type { DialogCoordinator, ExportFilePreview } from './confirm'

export interface AgentModelSnapshot {
  model: ModelResult | null
  pending: boolean
  busy?: boolean
  error?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AgentModeHandle<T = any> {
  descriptor: AgentModeDescriptor<T>
  /** Разрешена ли запись в этом режиме (по умолчанию берётся из `descriptor.writable`). */
  writable?: boolean
  getState(): T
  setState?(next: T): void
  defaults?: T
  onReset?(): void
  getModel(): AgentModelSnapshot
  subscribeModel?(listener: () => void): () => void
  /** Базовое имя файла экспорта для режима (например, `baseplate_84x84`). */
  getExportName?(): string
}

export interface AgentToolCallRecord {
  tool: string
  summary: string
  ok: boolean
}

export interface AgentToolEnvironment {
  registry: ToolRegistry
  history?: AgentHistory
  dialogs?: DialogCoordinator
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getModeHandle(): AgentModeHandle<any> | null
  getUnit?(): 'mm' | 'in'
  getLanguage?(): string
  navigate?(path: string): void
  getExportSettings?(): ExportSettings
  setExportSettings?(patch: Partial<ExportSettings>): void
  saveFiles?(
    files: ExportFilePreview[],
    meta: { format: ExportFormat; settings: ExportSettings; plates: number; overflow: boolean },
  ): void
  onToolStart?(tool: string, summary?: string): (() => void) | void
  onToolFinish?(record: AgentToolCallRecord): number | void
  /** Лимит ожидания завершения сборки модели в `get_model_info` (по умолчанию 20 000 мс). */
  modelTimeoutMs?: number
  /** Интервал опроса состояния сборки в `get_model_info` (по умолчанию 25 мс). */
  modelPollMs?: number
}

export function isModeWritable(handle: AgentModeHandle): boolean {
  return handle.writable ?? handle.descriptor.writable
}

export function availableModesSummary() {
  return MODE_DESCRIPTORS.map((d) => ({
    product: d.product,
    mode: d.mode,
    path: d.path,
    writable: d.writable,
  }))
}

export function noActiveModeError(): ToolResult<never> {
  return errResult(
    'no_active_mode',
    'No mode is currently open. Call open_mode with one of the available modes first.',
    {
      tool: 'open_mode',
      modes: availableModesSummary(),
    },
  )
}

export function readOnlyModeError(handle: AgentModeHandle): ToolResult<never> {
  return errResult(
    'read_only_mode',
    `Mode "${handle.descriptor.product}/${handle.descriptor.mode}" is read-only for browser agents.`,
    {
      product: handle.descriptor.product,
      mode: handle.descriptor.mode,
      writableModes: MODE_DESCRIPTORS.filter((d) => d.writable).map((d) => ({
        product: d.product,
        mode: d.mode,
      })),
    },
  )
}
