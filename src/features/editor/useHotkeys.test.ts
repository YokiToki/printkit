// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHotkeys, validateHotkeys, type HotkeyDef } from './useHotkeys'

describe('editor/useHotkeys', () => {
  it('throws on conflicting hotkey definitions', () => {
    const defs: HotkeyDef[] = [
      { id: 'del1', key: 'Delete', labelKey: 'delete', action: vi.fn() },
      { id: 'del2', key: 'delete', labelKey: 'delete', action: vi.fn() },
    ]

    expect(() => validateHotkeys(defs)).toThrow(/Hotkey conflict/)
  })

  it('runs command when matching hotkey is pressed', () => {
    const actDelete = vi.fn()
    const actDuplicate = vi.fn()

    const defs: HotkeyDef[] = [
      { id: 'delete', key: 'Delete', labelKey: 'delete', action: actDelete },
      { id: 'duplicate', key: 'd', ctrl: true, labelKey: 'dup', action: actDuplicate },
    ]

    renderHook(() => useHotkeys(defs))

    fireEvent.keyDown(window, { key: 'Delete' })
    expect(actDelete).toHaveBeenCalledTimes(1)
    expect(actDuplicate).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
    expect(actDuplicate).toHaveBeenCalledTimes(1)
  })

  it('ignores hotkeys while an input or textarea has focus', () => {
    const action = vi.fn()
    const defs: HotkeyDef[] = [
      { id: 'move', key: 'g', labelKey: 'move', action },
    ]

    renderHook(() => useHotkeys(defs))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireEvent.keyDown(input, { key: 'g' })
    expect(action).not.toHaveBeenCalled()

    input.blur()
    fireEvent.keyDown(window, { key: 'g' })
    expect(action).toHaveBeenCalledTimes(1)

    document.body.removeChild(input)
  })
})
