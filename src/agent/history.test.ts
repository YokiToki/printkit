import { describe, expect, it } from 'vitest'
import { AgentHistory, MAX_AGENT_HISTORY } from './history'

describe('agent/history', () => {
  it('stores at most 10 entries per mode and isolates modes', () => {
    const h = new AgentHistory()
    for (let i = 1; i <= 12; i++) {
      h.record({
        modeId: 'baseplate',
        label: `step ${i}`,
        before: { x: i - 1 },
        after: { x: i },
      })
    }
    h.record({
      modeId: 'box',
      label: 'box step 1',
      before: { w: 1 },
      after: { w: 2 },
    })

    const bpList = h.list<{ x: number }>('baseplate')
    expect(bpList).toHaveLength(MAX_AGENT_HISTORY)
    expect(bpList[0].label).toBe('step 3')
    expect(bpList[bpList.length - 1].label).toBe('step 12')
    expect(h.list('box')).toHaveLength(1)
  })

  it('undoes in LIFO order when state still matches after', () => {
    const h = new AgentHistory()
    h.record({
      modeId: 'baseplate',
      label: 'set x = 3',
      before: { x: 2, y: 2 },
      after: { x: 3, y: 2 },
    })
    h.record({
      modeId: 'baseplate',
      label: 'set y = 4',
      before: { x: 3, y: 2 },
      after: { x: 3, y: 4 },
    })

    const u1 = h.undo('baseplate', { x: 3, y: 4 })
    expect(u1).toEqual({
      status: 'restored',
      entry: expect.objectContaining({ label: 'set y = 4' }),
      state: { x: 3, y: 2 },
    })

    const u2 = h.undo('baseplate', u1.status === 'restored' ? u1.state : { x: 0, y: 0 })
    expect(u2).toEqual({
      status: 'restored',
      entry: expect.objectContaining({ label: 'set x = 3' }),
      state: { x: 2, y: 2 },
    })

    expect(h.undo('baseplate', { x: 2, y: 2 })).toEqual({ status: 'empty' })
  })

  it('detects manual edits after the agent change and restores when forced', () => {
    const h = new AgentHistory()
    h.record({
      modeId: 'box',
      label: 'set width',
      before: { x: 2 },
      after: { x: 4 },
    })

    expect(h.hasChangedSince('box', { x: 4 })).toBe(false)
    expect(h.hasChangedSince('box', { x: 5 })).toBe(true)

    const blocked = h.undo('box', { x: 5 })
    expect(blocked).toEqual({
      status: 'changed_since',
      entry: expect.objectContaining({ label: 'set width' }),
      state: { x: 2 },
    })
    expect(h.list('box')).toHaveLength(1)

    const forced = h.undo('box', { x: 5 }, { force: true })
    expect(forced).toEqual({
      status: 'restored',
      entry: expect.objectContaining({ label: 'set width' }),
      state: { x: 2 },
    })
    expect(h.list('box')).toHaveLength(0)
  })
})
