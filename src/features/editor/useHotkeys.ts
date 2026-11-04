import { useEffect } from 'react'

export interface HotkeyDef {
  id: string
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  labelKey: string
  action: () => void
}

export function hotkeyCombo(def: Pick<HotkeyDef, 'key' | 'ctrl' | 'shift' | 'alt'>): string {
  const parts: string[] = []
  if (def.ctrl) parts.push('ctrl')
  if (def.alt) parts.push('alt')
  if (def.shift) parts.push('shift')
  parts.push(def.key.toLowerCase())
  return parts.join('+')
}

export function validateHotkeys(defs: HotkeyDef[]): void {
  const seen = new Map<string, string>()
  for (const def of defs) {
    const combo = hotkeyCombo(def)
    if (seen.has(combo)) {
      throw new Error(`Hotkey conflict: "${def.id}" conflicts with "${seen.get(combo)}" on "${combo}"`)
    }
    seen.set(combo, def.id)
  }
}

export function isInputFocused(): boolean {
  const active = document.activeElement
  if (!active) return false
  const tag = active.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((active as HTMLElement).isContentEditable) return true
  return false
}

export function useHotkeys(defs: HotkeyDef[], enabled = true) {
  validateHotkeys(defs)

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return

      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const alt = e.altKey
      const key = e.key.toLowerCase()

      for (const def of defs) {
        if (
          def.key.toLowerCase() === key &&
          !!def.ctrl === ctrl &&
          !!def.shift === shift &&
          !!def.alt === alt
        ) {
          e.preventDefault()
          def.action()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [defs, enabled])
}
