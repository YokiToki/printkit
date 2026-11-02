import type { AgentTool } from '../registry'
import { createGetAppStateTool, createOpenModeTool } from './app'
import {
  createGetExportSettingsTool,
  createRequestExportTool,
  createSetExportSettingsTool,
  normaliseExportFileName,
  VALID_PRINTER_IDS,
} from './export'
import { createGetModelInfoTool, MODEL_POLL_INTERVAL_MS, MODEL_WAIT_TIMEOUT_MS } from './model'
import {
  createGetParametersTool,
  createResetParametersTool,
  createSetParametersTool,
  summarizePatch,
} from './params'
import {
  availableModesSummary,
  isModeWritable,
  noActiveModeError,
  readOnlyModeError,
  type AgentModeHandle,
  type AgentModelSnapshot,
  type AgentToolCallRecord,
  type AgentToolEnvironment,
} from './types'

/** Базовые инструменты, доступные всегда независимо от открытого режима. */
export function buildBaseTools(env: AgentToolEnvironment): AgentTool[] {
  return [
    createGetAppStateTool(env),
    createOpenModeTool(env),
    createGetExportSettingsTool(env),
    createSetExportSettingsTool(env),
  ]
}

/** Инструменты активного режима (в режимах только для чтения не создаются `set_parameters` и `reset_parameters`). */
export function buildModeTools(
  env: AgentToolEnvironment,
  handle: AgentModeHandle | null = env.getModeHandle(),
): AgentTool[] {
  if (!handle) return []
  const writable = isModeWritable(handle)
  if (!writable) {
    return [
      createGetParametersTool(env),
      createGetModelInfoTool(env),
      createRequestExportTool(env),
    ]
  }
  return [
    createGetParametersTool(env),
    createSetParametersTool(env),
    createResetParametersTool(env),
    createGetModelInfoTool(env),
    createRequestExportTool(env),
  ]
}

/** Синхронизирует базовые и режимные инструменты в `env.registry` по текущему `env.getModeHandle()`. */
export function syncAgentTools(env: AgentToolEnvironment): void {
  env.registry.setBaseTools(buildBaseTools(env))
  env.registry.setModeTools(buildModeTools(env, env.getModeHandle()))
}

export {
  availableModesSummary,
  createGetAppStateTool,
  createGetExportSettingsTool,
  createGetModelInfoTool,
  createGetParametersTool,
  createOpenModeTool,
  createRequestExportTool,
  createResetParametersTool,
  createSetExportSettingsTool,
  createSetParametersTool,
  isModeWritable,
  MODEL_POLL_INTERVAL_MS,
  MODEL_WAIT_TIMEOUT_MS,
  noActiveModeError,
  normaliseExportFileName,
  readOnlyModeError,
  summarizePatch,
  VALID_PRINTER_IDS,
}
export type {
  AgentModeHandle,
  AgentModelSnapshot,
  AgentToolCallRecord,
  AgentToolEnvironment,
}
export {
  CONFIRM_TIMEOUT_MS,
  DialogCoordinator,
  type ActiveAgentDialog,
  type ConfirmDecision,
  type ExportDialogPrompt,
  type ExportFilePreview,
  type ResetDialogPrompt,
} from './confirm'
