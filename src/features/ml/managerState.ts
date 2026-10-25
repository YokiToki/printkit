import { useSyncExternalStore } from 'react'

// Открыт ли менеджер моделей: кнопка в шапке, ссылки «Модели…» в окнах ИИ и сам менеджер читают одно состояние.
let open = false
const listeners = new Set<() => void>()
const set = (v: boolean) => { open = v; listeners.forEach((l) => l()) }
export const openModelManager = () => set(true)
export const closeModelManager = () => set(false)
export const useModelManagerOpen = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => open, () => open)
