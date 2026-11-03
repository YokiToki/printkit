import { useSyncExternalStore } from 'react'
import { openLog, closeLog, useActivityLog } from '../../app/activityLog'

// Открыт ли менеджер моделей: кнопка в шапке, ссылки «Модели…» в окнах ИИ и сам менеджер читают одно состояние.
let legacyOpen = false
const listeners = new Set<() => void>()
const set = (v: boolean) => { legacyOpen = v; listeners.forEach((l) => l()) }

export const openModelManager = () => {
  set(true)
  openLog({ tab: 'models' })
}

export const closeModelManager = () => {
  set(false)
  closeLog()
}

export const useModelManagerOpen = () => {
  const log = useActivityLog()
  const legacy = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => legacyOpen, () => legacyOpen)
  return (log.open && log.openTab === 'models') || legacy
}
