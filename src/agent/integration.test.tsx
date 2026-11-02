// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultParams, type BaseplateParams } from '../geometry/baseplate'
import { defaultRackPanel, type RackPanelParams } from '../geometry/rack/panel'
import { agentBridge } from './bridge'
import { baseplateDescriptor, cutoutDescriptor, rackPanelDescriptor } from './modes'
import { useAgentMode } from './useAgentMode'

function BaseplateComponent({ state }: { state?: BaseplateParams }) {
  useAgentMode(baseplateDescriptor, {
    state: state ?? defaultParams,
    defaults: defaultParams,
    writable: true,
  })
  return <div>Baseplate Mode</div>
}

function CutoutComponent() {
  useAgentMode(cutoutDescriptor, {
    state: cutoutDescriptor.defaults,
    defaults: cutoutDescriptor.defaults,
    writable: false,
  })
  return <div>Cutout Mode</div>
}

function RackPanelComponent({ state }: { state?: RackPanelParams }) {
  useAgentMode(rackPanelDescriptor, {
    state: state ?? defaultRackPanel,
    defaults: defaultRackPanel,
    writable: true,
  })
  return <div>Rack Panel Mode</div>
}

describe('agent integration (task 4.1)', () => {
  beforeEach(() => {
    agentBridge.unregisterMode(agentBridge.getModeHandle() as any)
  })

  it('mounting a mode adds its tools', () => {
    expect(agentBridge.getModeHandle()).toBeNull()
    const baseToolNames = agentBridge.registry.list().map((t) => t.name)
    expect(baseToolNames).toContain('get_app_state')
    expect(baseToolNames).toContain('open_mode')
    expect(baseToolNames).not.toContain('set_parameters')

    const { unmount } = render(<BaseplateComponent />)

    expect(agentBridge.getModeHandle()?.descriptor.id).toBe('baseplate')
    const mountedToolNames = agentBridge.registry.list().map((t) => t.name)
    expect(mountedToolNames).toContain('get_app_state')
    expect(mountedToolNames).toContain('open_mode')
    expect(mountedToolNames).toContain('get_parameters')
    expect(mountedToolNames).toContain('set_parameters')
    expect(mountedToolNames).toContain('reset_parameters')
    expect(mountedToolNames).toContain('get_model_info')
    expect(mountedToolNames).toContain('request_export')

    unmount()
  })

  it('switching modes swaps them', () => {
    const { rerender, unmount } = render(<BaseplateComponent />)
    expect(agentBridge.getModeHandle()?.descriptor.id).toBe('baseplate')
    expect(agentBridge.registry.list().map((t) => t.name)).toContain('set_parameters')

    // Switch to read-only Cutout mode
    rerender(<CutoutComponent />)
    expect(agentBridge.getModeHandle()?.descriptor.id).toBe('cutout')
    const cutoutTools = agentBridge.registry.list().map((t) => t.name)
    expect(cutoutTools).toContain('get_parameters')
    expect(cutoutTools).toContain('get_model_info')
    expect(cutoutTools).toContain('request_export')
    expect(cutoutTools).not.toContain('set_parameters')
    expect(cutoutTools).not.toContain('reset_parameters')

    // Switch to Rack Panel mode
    rerender(<RackPanelComponent />)
    expect(agentBridge.getModeHandle()?.descriptor.id).toBe('rackPanel')
    const panelTools = agentBridge.registry.list().map((t) => t.name)
    expect(panelTools).toContain('set_parameters')
    expect(panelTools).toContain('reset_parameters')

    unmount()
  })

  it('unmount removes them', () => {
    const { unmount } = render(<BaseplateComponent />)
    expect(agentBridge.getModeHandle()).not.toBeNull()
    expect(agentBridge.registry.list().map((t) => t.name)).toContain('set_parameters')

    unmount()

    expect(agentBridge.getModeHandle()).toBeNull()
    const toolNames = agentBridge.registry.list().map((t) => t.name)
    expect(toolNames).not.toContain('set_parameters')
    expect(toolNames).not.toContain('get_parameters')
    expect(toolNames).not.toContain('reset_parameters')
    expect(toolNames).not.toContain('get_model_info')
    expect(toolNames).not.toContain('request_export')
    expect(toolNames).toContain('get_app_state')
    expect(toolNames).toContain('open_mode')
  })

  it('a tool called during a route change answers no_active_mode', async () => {
    const { unmount } = render(<BaseplateComponent />)
    const setParamsTool = agentBridge.registry.get('set_parameters')
    expect(setParamsTool).toBeDefined()
    if (!setParamsTool) return

    // Route change / unmount happens:
    unmount()
    expect(agentBridge.getModeHandle()).toBeNull()

    // Agent invokes the previously acquired tool:
    const res = await setParamsTool.run({ pitch: 50 }, {})
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('no_active_mode')
      expect(res.error.message).toContain('No mode is currently open')
      expect(res.error.details).toHaveProperty('modes')
    }
  })
})
