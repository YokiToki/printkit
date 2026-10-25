import { useEffect, useState, useSyncExternalStore } from 'react'
import { detectCapabilities, type Capabilities } from './capabilities'
import { modelStore, type ModelStatus, type ModelStore } from './modelStore'

/** Подписка на хранилище моделей: компонент перерисовывается при каждом изменении (прогресс, готово, удалено). */
export function useModelStore(store: ModelStore = modelStore): ModelStore {
  useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion)
  useEffect(() => { void store.refresh() }, [store])
  return store
}

export const useModelStatus = (id: string | undefined, store: ModelStore = modelStore): ModelStatus => {
  useModelStore(store)
  return id ? store.status(id) : { state: 'absent' }
}

/** Возможности устройства (WebGPU, shader-f16): определяются один раз, до ответа — «нет». */
export function useCapabilities(): Capabilities | null {
  const [caps, setCaps] = useState<Capabilities | null>(null)
  useEffect(() => { let on = true; void detectCapabilities().then((c) => { if (on) setCaps(c) }); return () => { on = false } }, [])
  return caps
}
