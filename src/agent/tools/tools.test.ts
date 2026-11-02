import { beforeEach, describe, expect, it } from 'vitest'
import { defaultExportSettings, resetExportSettings, type ExportSettings } from '../../export/settings'
import type { ModelResult, PartMesh } from '../../geometry/model'
import { agentHistory } from '../history'
import { baseplateDescriptor, cutoutDescriptor, rackCaseDescriptor } from '../modes'
import { ToolRegistry } from '../registry'
import { DialogCoordinator } from './confirm'
import {
  buildModeTools,
  createGetAppStateTool,
  createGetExportSettingsTool,
  createGetModelInfoTool,
  createGetParametersTool,
  createOpenModeTool,
  createRequestExportTool,
  createResetParametersTool,
  createSetExportSettingsTool,
  createSetParametersTool,
  normaliseExportFileName,
  syncAgentTools,
  type AgentModeHandle,
  type AgentModelSnapshot,
  type AgentToolEnvironment,
} from './index'

function makeMockMesh(min: [number, number, number], max: [number, number, number], volume = 100) {
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

describe('agent tools suite (task 3.2)', () => {
  let registry: ToolRegistry
  let exportState: ExportSettings
  let unit: 'mm' | 'in'
  let lang: string
  let currentHandle: AgentModeHandle | null
  let dialogs: DialogCoordinator
  let navigated: string | null

  beforeEach(() => {
    registry = new ToolRegistry()
    resetExportSettings()
    exportState = { ...defaultExportSettings }
    unit = 'mm'
    lang = 'en'
    currentHandle = null
    dialogs = new DialogCoordinator({ timeoutMs: 50 })
    navigated = null
    agentHistory.reset()
  })

  function createEnv(): AgentToolEnvironment {
    return {
      registry,
      history: agentHistory,
      dialogs,
      getModeHandle: () => currentHandle,
      getUnit: () => unit,
      getLanguage: () => lang,
      navigate: (path) => {
        navigated = path
      },
      getExportSettings: () => exportState,
      setExportSettings: (patch) => {
        exportState = { ...exportState, ...patch }
      },
      modelTimeoutMs: 100,
      modelPollMs: 10,
    }
  }

  describe('app state and navigation', () => {
    it('get_app_state returns app info, units, language, and tool list', async () => {
      const env = createEnv()
      syncAgentTools(env)
      const tool = createGetAppStateTool(env)

      unit = 'in'
      lang = 'ru'
      const res = await tool.run({}, {})
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data).toMatchObject({
        product: null,
        mode: null,
        writable: false,
        unit: 'in',
        units: 'in',
        parameterUnit: 'mm',
        language: 'ru',
      })
      expect((res.data as any).tools).toContain('get_app_state')
      expect((res.data as any).tools).toContain('open_mode')
    })

    it('open_mode navigates on valid mode, returns unknown_mode error on unknown mode', async () => {
      const env = createEnv()
      const tool = createOpenModeTool(env)

      const validRes = await tool.run({ product: 'gridfinity', mode: 'baseplate' }, {})
      expect(validRes.ok).toBe(true)
      expect(navigated).toBe('/gridfinity/baseplate')

      const invalidRes = await tool.run({ product: 'foo', mode: 'bar' }, {})
      expect(invalidRes.ok).toBe(false)
      if (invalidRes.ok) return
      expect(invalidRes.error.code).toBe('unknown_mode')
      expect(invalidRes.error.details).toHaveProperty('validModes')
    })
  })

  describe('read-only modes and mode lifecycle', () => {
    it('omits set_parameters and reset_parameters in read-only mode tools', () => {
      let state = { ...cutoutDescriptor.defaults }
      const readOnlyHandle: AgentModeHandle = {
        descriptor: cutoutDescriptor,
        writable: false,
        getState: () => state,
        setState: (n) => {
          state = n
        },
        getModel: () => ({ model: null, pending: false }),
      }
      currentHandle = readOnlyHandle
      const env = createEnv()
      const tools = buildModeTools(env, readOnlyHandle)
      const names = tools.map((t) => t.name)

      expect(names).toContain('get_parameters')
      expect(names).toContain('get_model_info')
      expect(names).toContain('request_export')
      expect(names).not.toContain('set_parameters')
      expect(names).not.toContain('reset_parameters')
    })

    it('rejects set_parameters and reset_parameters when called against a read-only mode handle', async () => {
      let state = { ...cutoutDescriptor.defaults }
      const readOnlyHandle: AgentModeHandle = {
        descriptor: cutoutDescriptor,
        writable: false,
        getState: () => state,
        setState: (n) => {
          state = n
        },
        getModel: () => ({ model: null, pending: false }),
      }
      currentHandle = readOnlyHandle
      const env = createEnv()

      const setTool = createSetParametersTool(env)
      const setRes = await setTool.run({ pitch: 45 }, {})
      expect(setRes.ok).toBe(false)
      if (!setRes.ok) {
        expect(setRes.error.code).toBe('read_only_mode')
      }

      const resetTool = createResetParametersTool(env)
      const resetRes = await resetTool.run({}, {})
      expect(resetRes.ok).toBe(false)
      if (!resetRes.ok) {
        expect(resetRes.error.code).toBe('read_only_mode')
      }
    })

    it('returns no_active_mode when mode tools are run without an active mode', async () => {
      currentHandle = null
      const env = createEnv()

      const getParams = createGetParametersTool(env)
      expect((await getParams.run({}, {})).ok).toBe(false)

      const setParams = createSetParametersTool(env)
      expect((await setParams.run({}, {})).ok).toBe(false)

      const resetParams = createResetParametersTool(env)
      expect((await resetParams.run({}, {})).ok).toBe(false)

      const getModel = createGetModelInfoTool(env)
      expect((await getModel.run({}, {})).ok).toBe(false)

      const reqExport = createRequestExportTool(env)
      expect((await reqExport.run({}, {})).ok).toBe(false)
    })
  })

  describe('parameter patch validation, application, and units', () => {
    it('returns parameters in mm regardless of active display unit', async () => {
      let state = { ...baseplateDescriptor.defaults }
      currentHandle = {
        descriptor: baseplateDescriptor,
        getState: () => state,
        setState: (n) => {
          state = n
        },
        getModel: () => ({ model: null, pending: false }),
      }
      unit = 'in'
      const env = createEnv()
      const tool = createGetParametersTool(env)
      const res = await tool.run({}, {})
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.data).toMatchObject({
        unit: 'mm',
        product: 'gridfinity',
        mode: 'baseplate',
      })
      expect((res.data as any).parameters.pitch).toBe(42)
    })

    it('rejected patch leaves state unchanged when schema violation occurs', async () => {
      let state = { ...baseplateDescriptor.defaults, pitch: 42 }
      let wasCalled = false
      currentHandle = {
        descriptor: baseplateDescriptor,
        getState: () => state,
        setState: (n) => {
          wasCalled = true
          state = n
        },
        getModel: () => ({ model: null, pending: false }),
      }
      const env = createEnv()
      const tool = createSetParametersTool(env)

      // 1. Unknown field
      const res1 = await tool.run({ unknownField: 123 }, {})
      expect(res1.ok).toBe(false)
      expect(wasCalled).toBe(false)
      expect(state.pitch).toBe(42)

      // 2. Out of range value
      const res2 = await tool.run({ pitch: 99999 }, {})
      expect(res2.ok).toBe(false)
      expect(wasCalled).toBe(false)
      expect(state.pitch).toBe(42)
    })

    it('invalid-but-applied parameters are applied to state and return validation keys with English texts', async () => {
      let state = { ...rackCaseDescriptor.defaults }
      currentHandle = {
        descriptor: rackCaseDescriptor,
        getState: () => state,
        setState: (n) => {
          state = n
        },
        getModel: () => ({ model: null, pending: false }),
      }
      const env = createEnv()
      const tool = createSetParametersTool(env)

      // Make device width 220 mm (wider than 10-inch rack window 217.45 mm, within device limit 260 mm)
      const res = await tool.run({ device: { width: 220, depth: 100, height: 40 } }, {})
      expect(res.ok).toBe(true)
      if (!res.ok) return

      // State is applied so user can see it in UI
      expect(state.device.width).toBe(220)
      const data = res.data as any
      expect(data.applied).toBe(true)
      expect(data.errors.length).toBeGreaterThan(0)
      const tooWide = data.errors.find((e: any) => e.key === 'rack.error.tooWide')
      expect(tooWide).toBeDefined()
      expect(tooWide?.message).toContain('too wide for the 222.25 mm window')
    })

    it('reset_parameters asks user confirmation and resets to defaults on confirm', async () => {
      let state = { ...baseplateDescriptor.defaults, pitch: 50 }
      currentHandle = {
        descriptor: baseplateDescriptor,
        getState: () => state,
        setState: (n) => {
          state = n
        },
        getModel: () => ({ model: null, pending: false }),
      }
      const env = createEnv()
      const tool = createResetParametersTool(env)

      // Start reset request and immediately confirm through dialogs
      const runPromise = tool.run({}, {})
      expect(dialogs.isBusy()).toBe(true)
      expect(dialogs.getActive()?.kind).toBe('reset')
      dialogs.confirm()

      const res = await runPromise
      expect(res.ok).toBe(true)
      if (!res.ok) return
      const data = res.data as any
      expect(data.status).toBe('reset')
      expect(data.reset).toBe(true)
      expect(state.pitch).toBe(baseplateDescriptor.defaults.pitch)
    })
  })

  describe('get_model_info', () => {
    it('waits for pending model to settle, never returns mesh data, and reports part and plate info', async () => {
      const listeners = new Set<() => void>()
      let snapshot: AgentModelSnapshot = {
        model: null,
        pending: true,
      }

      currentHandle = {
        descriptor: baseplateDescriptor,
        getState: () => baseplateDescriptor.defaults,
        getModel: () => snapshot,
        subscribeModel: (l) => {
          listeners.add(l)
          return () => {
            listeners.delete(l)
          }
        },
      }

      const env = createEnv()
      const tool = createGetModelInfoTool(env)

      // Simulate model finishing after 20ms
      setTimeout(() => {
        const part: PartMesh = {
          label: 'A1',
          col: 0,
          row: 0,
          oversize: false,
          mesh: makeMockMesh([0, 0, 0], [42, 42, 10], 15000),
        }
        const model: ModelResult = {
          parts: [part],
        }
        snapshot = {
          model,
          pending: false,
          busy: false,
        }
        listeners.forEach((l) => l())
      }, 20)

      const res = await tool.run({}, {})
      expect(res.ok).toBe(true)
      if (!res.ok) return

      const data = res.data as any
      expect(data.ready).toBe(true)
      expect(data.parts.length).toBe(1)
      const p0 = data.parts[0]
      expect(p0.label).toBe('A1')
      expect(p0.volumeMm3).toBe(15000)
      expect(p0.bbox.size).toEqual([42, 42, 10])

      // Verify no raw mesh array data is returned
      expect(p0).not.toHaveProperty('mesh')
      expect(p0).not.toHaveProperty('vertProperties')
      expect(p0).not.toHaveProperty('triVerts')

      // Plate layout check
      expect(data.plate.plates.length).toBe(1)
      expect(data.plate.plates[0].items[0].label).toBe('A1')
      expect(data.plate.overflow.length).toBe(0)
    })

    it('times out with ready: false if model build does not settle within timeout limit', async () => {
      currentHandle = {
        descriptor: baseplateDescriptor,
        getState: () => baseplateDescriptor.defaults,
        getModel: () => ({
          model: null,
          pending: true,
          busy: true,
        }),
      }

      const env = createEnv()
      env.modelTimeoutMs = 30
      env.modelPollMs = 10
      const tool = createGetModelInfoTool(env)

      const res = await tool.run({}, {})
      expect(res.ok).toBe(true)
      if (!res.ok) return
      const data = res.data as any
      expect(data.ready).toBe(false)
      expect(data.parts).toEqual([])
    })
  })

  describe('export settings and request_export', () => {
    it('normalises file names removing invalid chars and spaces', () => {
      expect(normaliseExportFileName('  my test/file:name*?  ')).toBe('my_test_file_name_')
    })

    it('set_export_settings validates printer id and normalises fileName', async () => {
      const env = createEnv()
      const tool = createSetExportSettingsTool(env)

      // Unknown printer
      const badPrinter = await tool.run({ printerId: 'super-printer-9000' }, {})
      expect(badPrinter.ok).toBe(false)
      if (!badPrinter.ok) {
        expect(badPrinter.error.code).toBe('unknown_printer')
      }

      // Valid printer and fileName with special chars
      const okRes = await tool.run({
        printerId: 'a1-mini',
        fileName: 'bin v2 / final *',
        format: '3mf',
      }, {})
      expect(okRes.ok).toBe(true)
      if (!okRes.ok) return
      const data = okRes.data as any
      expect(data.settings.printerId).toBe('a1-mini')
      expect(data.settings.fileName).toBe('bin_v2___final__')
      expect(data.normalised.length).toBe(1)
      expect(data.normalised[0].used).toBe('bin_v2___final__')
    })

    it('request_export checks model readiness and errors before dialog', async () => {
      const env = createEnv()
      const tool = createRequestExportTool(env)

      // 1. Model with errors
      currentHandle = {
        descriptor: rackCaseDescriptor,
        getState: () => ({ ...rackCaseDescriptor.defaults, device: { width: 500, depth: 100, height: 40 } }),
        getModel: () => ({ model: null, pending: false }),
      }
      const errRes = await tool.run({}, {})
      expect(errRes.ok).toBe(false)
      if (!errRes.ok) {
        expect(errRes.error.code).toBe('nothing_to_export')
      }

      // 2. Model still pending
      currentHandle = {
        descriptor: baseplateDescriptor,
        getState: () => baseplateDescriptor.defaults,
        getModel: () => ({ model: null, pending: true }),
      }
      const pendingRes = await tool.run({}, {})
      expect(pendingRes.ok).toBe(false)
      if (!pendingRes.ok) {
        expect(pendingRes.error.code).toBe('nothing_to_export')
      }
    })

    it('request_export completes on user confirm, decline, or timeout', async () => {
      const part: PartMesh = {
        label: 'A1',
        col: 0,
        row: 0,
        oversize: false,
        mesh: makeMockMesh([0, 0, 0], [42, 42, 10], 1000),
      }
      const snapshot: AgentModelSnapshot = {
        model: { parts: [part] },
        pending: false,
      }

      currentHandle = {
        descriptor: baseplateDescriptor,
        getState: () => baseplateDescriptor.defaults,
        getModel: () => snapshot,
        getExportName: () => 'my_baseplate',
      }

      const env = createEnv()
      const tool = createRequestExportTool(env)

      // 1. Confirm
      const savedPromise = tool.run({ format: 'stl', name: 'custom plate' }, {})
      expect(dialogs.isBusy()).toBe(true)
      const prompt = dialogs.getActive()
      expect(prompt?.kind).toBe('export')
      if (prompt?.kind === 'export') {
        expect(prompt.files.length).toBe(1)
        expect(prompt.files[0].name).toBe('custom_plate.stl')
      }
      dialogs.confirm()
      const savedRes = await savedPromise
      expect(savedRes.ok).toBe(true)
      if (savedRes.ok) {
        const data = savedRes.data as any
        expect(data.status).toBe('saved')
        expect(data.files[0].name).toBe('custom_plate.stl')
      }

      // 2. Decline
      const declinePromise = tool.run({}, {})
      expect(dialogs.isBusy()).toBe(true)
      dialogs.decline()
      const declineRes = await declinePromise
      expect(declineRes.ok).toBe(true)
      if (declineRes.ok) {
        const data = declineRes.data as any
        expect(data.status).toBe('declined')
      }
    })
  })
})
