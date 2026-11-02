// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import i18n from '../i18n'
import { defaultParams, type BaseplateParams } from '../geometry/baseplate'
import { agentBridge } from './bridge'
import { AgentHost } from './AgentHost'
import { baseplateDescriptor } from './modes'
import { type ActiveAgentDialog, type ExportFilePreview } from './tools/confirm'
import type { AgentToolEnvironment } from './tools/types'

function makeMockMesh(
  min: [number, number, number],
  max: [number, number, number],
  volume = 1000,
) {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const vertProperties = new Float32Array([
    x0, y0, z0,
    x1, y0, z0,
    x1, y1, z0,
    x0, y1, z0,
    x0, y0, z1,
    x1, y0, z1,
    x1, y1, z1,
    x0, y1, z1,
  ])
  const triVerts = new Uint32Array([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ])
  return {
    vertProperties,
    triVerts,
    numProp: 3,
    min,
    max,
    volume,
  }
}

describe('agent dialogs: export and reset confirmations (task 4.3)', () => {
  let currentState: BaseplateParams
  let saveFilesMock: ReturnType<typeof vi.fn<NonNullable<AgentToolEnvironment['saveFiles']>>>

  beforeEach(async () => {
    await i18n.changeLanguage('en')
    agentBridge.dispose()
    const handle = agentBridge.getModeHandle()
    if (handle) agentBridge.unregisterMode(handle)

    currentState = { ...defaultParams }
    saveFilesMock = vi.fn<NonNullable<AgentToolEnvironment['saveFiles']>>()

    agentBridge.registerMode({
      descriptor: baseplateDescriptor,
      getState: () => currentState,
      setState: (next) => {
        currentState = next as BaseplateParams
      },
      getModel: () => ({
        ready: true,
        model: {
          parts: [
            {
              label: 'A1',
              col: 0,
              row: 0,
              oversize: false,
              mesh: makeMockMesh([0, 0, 0], [42, 42, 10], 5000) as any,
            },
          ],
        },
        busy: false,
        pending: false,
        error: null,
      }),
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

  it('no download without a click; Download runs normal export and resolves with saved', async () => {
    agentBridge.attachHost({ saveFiles: saveFilesMock })

    const { unmount } = render(
      <MemoryRouter>
        <AgentHost />
      </MemoryRouter>,
    )

    const requestExportTool = agentBridge.registry.get('request_export')
    expect(requestExportTool).toBeDefined()

    const exportPromise = requestExportTool!.run(
      { format: 'stl', name: 'my_baseplate' },
      { signal: new AbortController().signal },
    )

    // Wait for dialog to open
    const dialog = await screen.findByRole('dialog', { name: 'Save model' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/An agent wants to save the model files/)).toBeInTheDocument()

    // File list and sizes are visible
    const fileList = screen.getByTestId('agent-export-file-list')
    expect(within(fileList).getByText('my_baseplate.stl')).toBeInTheDocument()

    // Download has NOT happened yet
    expect(saveFilesMock).not.toHaveBeenCalled()

    // Focus is initially on the safe Cancel button
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    expect(document.activeElement).toBe(cancelBtn)

    // Click Download
    const downloadBtn = screen.getByRole('button', { name: 'Download' })
    act(() => {
      fireEvent.click(downloadBtn)
    })

    const res = await exportPromise
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect((res.data as any).status).toBe('saved')
    }

    expect(saveFilesMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Save model' })).toBeNull()

    unmount()
  })

  it('decline via Cancel button resolves with declined and does not download', async () => {
    agentBridge.attachHost({ saveFiles: saveFilesMock })

    const { unmount } = render(
      <MemoryRouter>
        <AgentHost />
      </MemoryRouter>,
    )

    const requestExportTool = agentBridge.registry.get('request_export')
    const exportPromise = requestExportTool!.run({}, { signal: new AbortController().signal })

    await screen.findByRole('dialog', { name: 'Save model' })

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    act(() => {
      fireEvent.click(cancelBtn)
    })

    const res = await exportPromise
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect((res.data as any).status).toBe('declined')
    }

    expect(saveFilesMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Save model' })).toBeNull()

    unmount()
  })

  it('decline via Esc key resolves with declined', async () => {
    agentBridge.attachHost({ saveFiles: saveFilesMock })

    const { unmount } = render(
      <MemoryRouter>
        <AgentHost />
      </MemoryRouter>,
    )

    const requestExportTool = agentBridge.registry.get('request_export')
    const exportPromise = requestExportTool!.run({}, { signal: new AbortController().signal })

    await screen.findByRole('dialog', { name: 'Save model' })

    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    const res = await exportPromise
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect((res.data as any).status).toBe('declined')
    }

    expect(saveFilesMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Save model' })).toBeNull()

    unmount()
  })

  it('timeout resolves call and closes dialog', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <AgentHost />
      </MemoryRouter>,
    )

    const controller = new AbortController()
    const requestExportTool = agentBridge.registry.get('request_export')
    const exportPromise = requestExportTool!.run({}, { signal: controller.signal })

    await screen.findByRole('dialog', { name: 'Save model' })

    act(() => {
      controller.abort()
    })

    const res = await exportPromise
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect((res.data as any).status).toBe('timeout')
    }

    expect(screen.queryByRole('dialog', { name: 'Save model' })).toBeNull()

    unmount()
  })

  it('nothing opens when model has errors', async () => {
    agentBridge.registerMode({
      descriptor: baseplateDescriptor,
      getState: () => currentState,
      setState: () => {},
      getModel: () => ({
        ready: false,
        model: null,
        busy: false,
        pending: false,
        error: 'model_failed',
      }),
      defaults: defaultParams,
      writable: true,
    })

    render(
      <MemoryRouter>
        <AgentHost />
      </MemoryRouter>,
    )

    const requestExportTool = agentBridge.registry.get('request_export')
    const res = await requestExportTool!.run({}, { signal: new AbortController().signal })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('nothing_to_export')
    }

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(agentBridge.dialogs.getActive()).toBeNull()
  })

  it('reset_parameters confirmation dialog prompts and restores defaults on confirm', async () => {
    currentState = {
      ...defaultParams,
      x: { mode: 'units', value: 5, align: 'center' },
    }

    const { unmount } = render(
      <MemoryRouter>
        <AgentHost />
      </MemoryRouter>,
    )

    const resetTool = agentBridge.registry.get('reset_parameters')
    expect(resetTool).toBeDefined()

    const resetPromise = resetTool!.run({}, { signal: new AbortController().signal })

    const heading = await screen.findByRole('heading', { name: 'Reset parameters' })
    expect(heading).toBeInTheDocument()
    expect(
      screen.getByText('An agent wants to reset parameters to defaults.'),
    ).toBeInTheDocument()

    // Cancel initially focused
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    expect(document.activeElement).toBe(cancelBtn)

    // Confirm reset
    const confirmBtn = screen.getByRole('button', { name: 'Reset' })
    act(() => {
      fireEvent.click(confirmBtn)
    })

    const res = await resetPromise
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect((res.data as any).status).toBe('reset')
      expect((res.data as any).reset).toBe(true)
    }

    expect(currentState.x.value).toBe(defaultParams.x.value)
    expect(screen.queryByRole('heading', { name: 'Reset parameters' })).toBeNull()

    unmount()
  })

  it('only allows one dialog at a time', async () => {
    render(
      <MemoryRouter>
        <AgentHost />
      </MemoryRouter>,
    )

    const resetTool = agentBridge.registry.get('reset_parameters')
    const requestExportTool = agentBridge.registry.get('request_export')

    // Open reset dialog
    const resetPromise = resetTool!.run({}, { signal: new AbortController().signal })
    await screen.findByRole('heading', { name: 'Reset parameters' })

    // Second dialog request while first is busy resolves immediately with declined
    const secondRes = await requestExportTool!.run({}, { signal: new AbortController().signal })
    expect(secondRes.ok).toBe(true)
    if (secondRes.ok) {
      expect((secondRes.data as any).status).toBe('declined')
    }

    // Dismiss first dialog
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    await resetPromise
  })
})
