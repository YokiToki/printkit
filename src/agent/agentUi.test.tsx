// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import i18n from '../i18n'
import en from '../i18n/en.json'
import ru from '../i18n/ru.json'
import { defaultParams, type BaseplateParams } from '../geometry/baseplate'
import { openLog, resetActivityLog } from '../app/activityLog'
import { ActivityLogPanel } from '../app/ActivityLogPanel'
import { agentBridge } from './bridge'
import { baseplateDescriptor } from './modes'
import { resetAgentSettings, updateAgentSettings, AGENT_SETTINGS_KEY } from './settings'
import { type ModelContextLike, type WebMcpToolDefinition } from './webmcp'

class FakeModelContext extends EventTarget implements ModelContextLike {
  readonly tools = new Map<string, WebMcpToolDefinition>()

  registerTool(tool: WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return Promise.resolve()
    this.tools.set(tool.name, tool)
    options?.signal?.addEventListener(
      'abort',
      () => {
        this.tools.delete(tool.name)
      },
      { once: true },
    )
    return Promise.resolve()
  }
}

describe('agent UI and activity log integration (task 4.2)', () => {
  let currentState: BaseplateParams

  beforeEach(async () => {
    localStorage.clear()
    resetAgentSettings()
    resetActivityLog()
    agentBridge.history.reset()
    agentBridge.dispose()
    const handle = agentBridge.getModeHandle()
    if (handle) agentBridge.unregisterMode(handle)
    await i18n.changeLanguage('en')

    currentState = {
      ...defaultParams,
      x: { mode: 'units', value: 2, align: 'center' },
      y: { mode: 'units', value: 2, align: 'center' },
    }

    agentBridge.registerMode({
      descriptor: baseplateDescriptor,
      getState: () => currentState,
      setState: (next) => {
        currentState = next as BaseplateParams
      },
      getModel: () => ({ ready: true, model: null, busy: false, pending: false, error: null }),
      defaults: defaultParams,
      writable: true,
    })
  })

  afterEach(() => {
    const handle = agentBridge.getModeHandle()
    if (handle) agentBridge.unregisterMode(handle)
    agentBridge.dispose()
    vi.restoreAllMocks()
  })

  it('verifies i18n key parity for agent and log.agent', () => {
    const enAgentKeys = Object.keys(en.agent).sort()
    const ruAgentKeys = Object.keys(ru.agent).sort()
    expect(ruAgentKeys).toEqual(enAgentKeys)

    const enLogAgentKeys = Object.keys(en.log.agent).sort()
    const ruLogAgentKeys = Object.keys(ru.log.agent).sort()
    expect(ruLogAgentKeys).toEqual(enLogAgentKeys)

    expect((en.log.sources as Record<string, string>).agent).toBe('Agent')
    expect((ru.log.sources as Record<string, string>).agent).toBe('Агент')
  })

  it('formats activity log entry text for agent tool calls in en and ru', async () => {
    const setTool = agentBridge.registry.get('set_parameters')
    expect(setTool).toBeDefined()

    const res = await setTool!.run({ patch: { x: { value: 3 } } }, { signal: new AbortController().signal })
    expect(res.ok).toBe(true)

    render(<ActivityLogPanel />)
    act(() => openLog({ source: 'agent' }))

    const dialog = screen.getByRole('dialog', { name: 'Activity log' })
    expect(within(dialog).getByText(/Agent: set_parameters baseplate\.x\.value = 3/)).toBeInTheDocument()

    await i18n.changeLanguage('ru')
    expect(within(dialog).getByText(/Агент: set_parameters baseplate\.x\.value = 3/)).toBeInTheDocument()
  })

  it('undo restores previous parameters and updates activity log', async () => {
    const setTool = agentBridge.registry.get('set_parameters')
    expect(setTool).toBeDefined()

    await setTool!.run({ patch: { x: { value: 4 } } }, { signal: new AbortController().signal })
    expect(currentState.x.value).toBe(4)

    render(<ActivityLogPanel />)
    act(() => openLog({ source: 'agent' }))

    const undoButtons = screen.getAllByRole('button', { name: /Undo agent change/i })
    expect(undoButtons.length).toBeGreaterThanOrEqual(1)

    act(() => {
      fireEvent.click(undoButtons[0])
    })

    expect(currentState.x.value).toBe(2)

    const dialog = screen.getByRole('dialog', { name: 'Activity log' })
    expect(within(dialog).getByText(/Agent change reverted: baseplate\.x\.value = 4/)).toBeInTheDocument()
  })

  it('prompts on changed-since and restores when confirmed', async () => {
    const setTool = agentBridge.registry.get('set_parameters')
    await setTool!.run({ patch: { x: { value: 4 } } }, { signal: new AbortController().signal })
    expect(currentState.x.value).toBe(4)

    // Manual edit after agent change
    currentState = {
      ...currentState,
      x: { ...currentState.x, value: 5 },
    }

    render(<ActivityLogPanel />)
    act(() => openLog({ source: 'agent' }))

    const undoBtn = screen.getAllByRole('button', { name: /Undo agent change/i })[0]
    act(() => {
      fireEvent.click(undoBtn)
    })

    // Confirm dialog should appear
    expect(screen.getByRole('heading', { name: 'Undo agent change' })).toBeInTheDocument()
    expect(screen.getByText(/Parameters have been edited since the agent change/i)).toBeInTheDocument()

    // Cancel leaves modified state
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(currentState.x.value).toBe(5)
    expect(screen.queryByRole('heading', { name: 'Undo agent change' })).toBeNull()

    // Clicking Undo again and confirming restores the state
    act(() => {
      fireEvent.click(undoBtn)
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    })

    expect(currentState.x.value).toBe(2)
  })

  it('persists switch "Allow browser agents" and unregisters/re-registers WebMCP tools', () => {
    const fakeContext = new FakeModelContext()
    agentBridge.install({ env: { document: { modelContext: fakeContext } } })

    expect(agentBridge.getWebMcp()).not.toBeNull()
    expect(fakeContext.tools.size).toBeGreaterThan(0)
    expect(fakeContext.tools.has('get_app_state')).toBe(true)

    render(<ActivityLogPanel />)
    act(() => openLog())

    const toggle = screen.getByRole('switch', { name: 'Allow browser agents' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    // Flip off
    act(() => {
      fireEvent.click(toggle)
    })

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(localStorage.getItem(AGENT_SETTINGS_KEY)).toBe(JSON.stringify({ enabled: false }))
    expect(agentBridge.getWebMcp()).toBeNull()
    expect(fakeContext.tools.size).toBe(0)

    // Flip back on
    act(() => {
      fireEvent.click(toggle)
    })

    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem(AGENT_SETTINGS_KEY)).toBe(JSON.stringify({ enabled: true }))
    expect(agentBridge.getWebMcp()).not.toBeNull()
    expect(fakeContext.tools.size).toBeGreaterThan(0)
  })

  it('Header agent button opens log for agent and shows busy marker', async () => {
    const { Header } = await import('../app/Header')
    const { MemoryRouter } = await import('react-router')
    const { startJob } = await import('../app/activityLog')

    const { unmount } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )

    const agentBtn = screen.getByRole('button', { name: 'Browser agents' })
    expect(agentBtn).toBeInTheDocument()
    expect(screen.queryByTestId('agent-busy')).toBeNull()

    // When an agent job runs, busy dot appears
    let job!: ReturnType<typeof startJob>
    act(() => {
      job = startJob({ source: 'agent', key: 'log.agent.running', params: { tool: 'set_parameters' } })
    })
    expect(screen.getByTestId('agent-busy')).toBeInTheDocument()

    // Clicking opens log filtered to agent
    act(() => {
      fireEvent.click(agentBtn)
    })
    const { getLogSnapshot } = await import('../app/activityLog')
    expect(getLogSnapshot().open).toBe(true)
    expect(getLogSnapshot().openSource).toBe('agent')

    act(() => {
      job.discard()
    })
    expect(screen.queryByTestId('agent-busy')).toBeNull()
    unmount()
  })
})
