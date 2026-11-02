import { describe, expect, it } from 'vitest'
import { ToolRegistry, okResult, type AgentTool } from './registry'
import {
  detectModelContext,
  installWebMcp,
  type ModelContextLike,
  type WebMcpToolDefinition,
} from './webmcp'

class FakeModelContext extends EventTarget implements ModelContextLike {
  readonly tools = new Map<string, WebMcpToolDefinition>()
  toolChanges = 0

  constructor(private readonly autoDispatchChange = false) {
    super()
    this.addEventListener('toolchange', () => {
      this.toolChanges++
    })
  }

  registerTool(tool: WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return Promise.resolve()
    this.tools.set(tool.name, tool)
    if (this.autoDispatchChange) this.dispatchEvent(new Event('toolchange'))
    options?.signal?.addEventListener(
      'abort',
      () => {
        this.tools.delete(tool.name)
        if (this.autoDispatchChange) this.dispatchEvent(new Event('toolchange'))
      },
      { once: true },
    )
    return Promise.resolve()
  }
}

const makeTool = (name: string, impl?: AgentTool['run']): AgentTool => ({
  name,
  description: `Tool ${name}`,
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  run: impl ?? (() => okResult({ name })),
})

describe('agent/webmcp', () => {
  it('returns null without throwing when no WebMCP API exists', () => {
    const reg = new ToolRegistry()
    reg.setBaseTools([makeTool('get_app_state')])
    expect(detectModelContext({ document: {}, navigator: {} })).toBeNull()
    expect(installWebMcp(reg, { env: { document: {}, navigator: {} } })).toBeNull()
  })

  it('detects both document.modelContext and navigator.modelContext entry points', () => {
    const docMc = new FakeModelContext()
    const navMc = new FakeModelContext()
    expect(detectModelContext({ document: { modelContext: docMc }, navigator: { modelContext: navMc } })).toBe(docMc)
    expect(detectModelContext({ document: {}, navigator: { modelContext: navMc } })).toBe(navMc)
  })

  it('registers, updates, and removes tools via AbortSignal and emits toolchange', async () => {
    const mc = new FakeModelContext(false)
    const reg = new ToolRegistry()
    reg.setBaseTools([makeTool('get_app_state')])

    const handle = installWebMcp(reg, { env: { document: { modelContext: mc } } })
    expect(handle).not.toBeNull()
    expect(Array.from(mc.tools.keys())).toEqual(['get_app_state'])
    expect(mc.toolChanges).toBe(1)

    reg.setModeTools([makeTool('get_parameters'), makeTool('set_parameters')])
    expect(Array.from(mc.tools.keys())).toEqual([
      'get_app_state',
      'get_parameters',
      'set_parameters',
    ])
    expect(mc.toolChanges).toBe(2)

    reg.setModeTools([makeTool('get_parameters')])
    expect(Array.from(mc.tools.keys())).toEqual(['get_app_state', 'get_parameters'])
    expect(mc.toolChanges).toBe(3)

    const res = await mc.tools.get('get_parameters')!.execute({})
    expect(res).toEqual({ ok: true, data: { name: 'get_parameters' } })

    handle!.dispose()
    expect(mc.tools.size).toBe(0)
    expect(mc.toolChanges).toBe(4)
  })

  it('turns a thrown handler exception into a structured internal_error result', async () => {
    const mc = new FakeModelContext(true)
    const reg = new ToolRegistry()
    reg.setBaseTools([
      makeTool('boom', () => {
        throw new Error('unexpected failure')
      }),
    ])
    installWebMcp(reg, { env: { navigator: { modelContext: mc } } })

    const res = await mc.tools.get('boom')!.execute({})
    expect(res).toEqual({
      ok: false,
      error: { code: 'internal_error', message: 'unexpected failure' },
    })
  })

  it('enforces the per-second call rate limit', async () => {
    let time = 1000
    const mc = new FakeModelContext()
    const reg = new ToolRegistry()
    reg.setBaseTools([makeTool('ping')])
    installWebMcp(reg, {
      env: { document: { modelContext: mc } },
      now: () => time,
      maxCallsPerSecond: 3,
    })

    const tool = mc.tools.get('ping')!
    expect((await tool.execute({})).ok).toBe(true)
    expect((await tool.execute({})).ok).toBe(true)
    expect((await tool.execute({})).ok).toBe(true)

    const limited = await tool.execute({})
    expect(limited).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'rate_limited' }),
    })

    time += 1000
    expect((await tool.execute({})).ok).toBe(true)
  })
})
