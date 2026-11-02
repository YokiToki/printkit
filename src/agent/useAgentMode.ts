import { useEffect, useRef } from 'react'
import type { ModelResult } from '../geometry/model'
import { agentBridge } from './bridge'
import type { AgentModeDescriptor } from './modes/types'
import type { AgentModeHandle, AgentModelSnapshot } from './tools/types'

export interface UseAgentModeOptions<T> {
  state: T
  setState?: (next: T) => void
  defaults?: T
  onReset?: () => void
  model?: ModelResult | null
  pending?: boolean
  busy?: boolean
  error?: string | null
  writable?: boolean
  exportName?: string
}

export function useAgentMode<T>(
  descriptor: AgentModeDescriptor<T>,
  options: UseAgentModeOptions<T>,
): void {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const descriptorRef = useRef(descriptor)
  descriptorRef.current = descriptor

  useEffect(() => {
    const handle: AgentModeHandle<T> = {
      descriptor: descriptorRef.current,
      get writable() {
        return optionsRef.current.writable ?? descriptorRef.current.writable
      },
      getState: () => optionsRef.current.state,
      setState: (next) => optionsRef.current.setState?.(next),
      get defaults() {
        return optionsRef.current.defaults ?? descriptorRef.current.defaults
      },
      onReset: () => optionsRef.current.onReset?.(),
      getModel: (): AgentModelSnapshot => ({
        model: optionsRef.current.model ?? null,
        pending: optionsRef.current.pending ?? false,
        busy: optionsRef.current.busy,
        error: optionsRef.current.error,
      }),
      getExportName: () => optionsRef.current.exportName ?? '',
    }

    agentBridge.registerMode(handle)
    return () => {
      agentBridge.unregisterMode(handle)
    }
  }, [descriptor])
}
