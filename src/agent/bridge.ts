import { getExportSettings, updateExportSettings } from '../export/settings'
import { agentHistory } from './history'
import { ToolRegistry } from './registry'
import { DialogCoordinator } from './tools/confirm'
import { syncAgentTools } from './tools'
import type {
  AgentModeHandle,
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
  private listeners = new Set<() => void>()

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
      onToolStart: (tool, summary) => this.hostEnv.onToolStart?.(tool, summary),
      onToolFinish: (rec) => this.hostEnv.onToolFinish?.(rec),
      saveFiles: (files, meta) => this.hostEnv.saveFiles?.(files, meta),
    }
    syncAgentTools(this.env)
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
    if (this.webmcp) return
    this.webmcp = installWebMcp(this.registry, options)
  }

  dispose(): void {
    if (this.webmcp) {
      this.webmcp.dispose()
      this.webmcp = null
    }
  }

  getWebMcp(): WebMcpHandle | null {
    return this.webmcp
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

export const agentBridge = new AgentBridge()
