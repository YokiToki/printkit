import { useSyncExternalStore } from 'react'
import { log, startJob, type Job } from '../app/activityLog'
import { getExportSettings, updateExportSettings } from '../export/settings'
import { agentHistory, type AgentHistoryEntry, type UndoOutcome } from './history'
import { ToolRegistry } from './registry'
import { getAgentSettings, subscribeAgentSettings } from './settings'
import { syncAgentTools } from './tools'
import { DialogCoordinator } from './tools/confirm'
import type {
  AgentModeHandle,
  AgentToolCallRecord,
  AgentToolEnvironment,
} from './tools/types'
import { installWebMcp, type WebMcpHandle, type WebMcpOptions } from './webmcp'

export class AgentBridge {
  readonly registry = new ToolRegistry()
  readonly history = agentHistory
  readonly dialogs = new DialogCoordinator()
  private activeHandle: AgentModeHandle | null = null
  private webmcp: WebMcpHandle | null = null
  private hostEnv: Partial<AgentToolEnvironment> = {}
  private env: AgentToolEnvironment
  private activeJobs = new Map<string, Job>()
  private listeners = new Set<() => void>()
  private lastOptions: WebMcpOptions = {}
  private version = 0

  constructor() {
    this.env = {
      registry: this.registry,
      history: this.history,
      dialogs: this.dialogs,
      getModeHandle: () => this.activeHandle,
      getUnit: () => this.hostEnv.getUnit?.() ?? 'mm',
      getLanguage: () => this.hostEnv.getLanguage?.() ?? 'en',
      navigate: (path) => this.hostEnv.navigate?.(path),
      getExportSettings: () => (this.hostEnv.getExportSettings ?? getExportSettings)(),
      setExportSettings: (patch) => (this.hostEnv.setExportSettings ?? updateExportSettings)(patch),
      onToolStart: (tool, summary) => this.handleToolStart(tool, summary),
      onToolFinish: (rec) => this.handleToolFinish(rec),
      saveFiles: (files, meta) => this.hostEnv.saveFiles?.(files, meta),
    }
    syncAgentTools(this.env)
    subscribeAgentSettings(() => this.syncWebMcp())
  }

  getEnvironment(): AgentToolEnvironment {
    return this.env
  }

  registerMode(handle: AgentModeHandle): void {
    this.activeHandle = handle
    syncAgentTools(this.env)
    this.notify()
  }

  unregisterMode(handle: AgentModeHandle): void {
    if (this.activeHandle === handle) {
      this.activeHandle = null
      syncAgentTools(this.env)
      this.notify()
    }
  }

  getModeHandle(): AgentModeHandle | null {
    return this.activeHandle
  }

  attachHost(env: Partial<AgentToolEnvironment>): () => void {
    this.hostEnv = { ...this.hostEnv, ...env }
    return () => {
      this.hostEnv = {}
    }
  }

  install(options: WebMcpOptions = {}): void {
    if (Object.keys(options).length > 0) this.lastOptions = options
    if (this.webmcp) return
    if (!getAgentSettings().enabled) return
    this.webmcp = installWebMcp(this.registry, this.lastOptions)
  }

  dispose(): void {
    if (this.webmcp) {
      this.webmcp.dispose()
      this.webmcp = null
    }
  }

  syncWebMcp(): void {
    const enabled = getAgentSettings().enabled
    if (!enabled && this.webmcp) {
      this.dispose()
    } else if (enabled && !this.webmcp) {
      this.install()
    } else {
      this.webmcp?.sync()
    }
  }

  getWebMcp(): WebMcpHandle | null {
    return this.webmcp
  }

  getVersion(): number {
    return this.version
  }

  undo(
    logEntryId?: number,
    options: { force?: boolean } = {},
  ): UndoOutcome {
    if (!this.activeHandle) return { status: 'empty' }

    let targetEntry: AgentHistoryEntry | undefined
    if (logEntryId !== undefined) {
      targetEntry = this.history.findByLogEntry(logEntryId)
      if (!targetEntry || targetEntry.modeId !== this.activeHandle.descriptor.id) {
        return { status: 'empty' }
      }
      const top = this.history.peek(this.activeHandle.descriptor.id)
      if (top?.id !== targetEntry.id) {
        return { status: 'empty' }
      }
    }

    const currentState = this.activeHandle.getState()
    const outcome = this.history.undo(this.activeHandle.descriptor.id, currentState, options)

    if (outcome.status === 'restored') {
      this.activeHandle.setState?.(outcome.state)
      log.info('agent', 'log.agent.undone', { label: outcome.entry.label })
      this.notify()
    }

    return outcome
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private handleToolStart(tool: string, _summary?: string): () => void {
    const job = startJob({
      source: 'agent',
      key: 'log.agent.running',
      params: { tool },
    })
    this.activeJobs.set(tool, job)
    return () => {
      job.discard()
      this.activeJobs.delete(tool)
    }
  }

  private handleToolFinish(rec: AgentToolCallRecord): number | undefined {
    const job = this.activeJobs.get(rec.tool)
    job?.discard()
    this.activeJobs.delete(rec.tool)

    const customEntry = this.hostEnv.onToolFinish?.(rec)
    if (typeof customEntry === 'number') return customEntry

    if (rec.ok) {
      const entry = log.info('agent', 'log.agent.call', { tool: rec.tool, summary: rec.summary })
      return entry.id
    } else {
      const entry = log.warn('agent', 'log.agent.callFailed', { tool: rec.tool, summary: rec.summary })
      return entry.id
    }
  }

  private notify(): void {
    this.version++
    this.listeners.forEach((l) => l())
  }
}

export const agentBridge = new AgentBridge()

export function useAgentHistory(modeId?: string) {
  useSyncExternalStore(
    (l) => {
      const u1 = agentHistory.subscribe(l)
      const u2 = agentBridge.subscribe(l)
      return () => {
        u1()
        u2()
      }
    },
    () => `${agentHistory.getVersion()}:${agentBridge.getVersion()}`,
    () => '0:0',
  )
  const activeHandle = agentBridge.getModeHandle()
  const activeModeId = modeId ?? activeHandle?.descriptor.id
  const top = activeModeId ? agentHistory.peek(activeModeId) : undefined
  const canUndo = Boolean(top && activeHandle && activeHandle.descriptor.id === activeModeId && activeHandle.setState)
  return { activeModeId, top, canUndo }
}
