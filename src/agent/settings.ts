import { useSyncExternalStore } from 'react'
import { loadPersisted } from '../app/usePersistedState'

export interface AgentSettings {
  enabled: boolean
}

export const defaultAgentSettings: AgentSettings = {
  enabled: true,
}

export const AGENT_SETTINGS_KEY = 'gridfinity.agent'

let state: AgentSettings | null = null
const listeners = new Set<() => void>()

function normalizeAgentSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw }
  if (typeof out.enabled !== 'boolean') delete out.enabled
  return out
}

export function getAgentSettings(): AgentSettings {
  return (state ??= loadPersisted(AGENT_SETTINGS_KEY, defaultAgentSettings, normalizeAgentSettings))
}

export function updateAgentSettings(patch: Partial<AgentSettings>): void {
  state = { ...getAgentSettings(), ...patch }
  try {
    localStorage.setItem(AGENT_SETTINGS_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable
  }
  listeners.forEach((l) => l())
}

export function resetAgentSettings(): void {
  state = null
  listeners.forEach((l) => l())
}

export function subscribeAgentSettings(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useAgentSettings(): [AgentSettings, (patch: Partial<AgentSettings>) => void] {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getAgentSettings,
    () => defaultAgentSettings,
  )
  return [s, updateAgentSettings]
}
