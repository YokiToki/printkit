import { availability, type Capabilities } from './capabilities'
import type { ModelStore } from './modelStore'
import { MODELS, type MlKind, type ModelSpec } from './models'

/** Модель вида `kind`, которой можно воспользоваться сейчас: выбранная пользователем, иначе первая готовая и доступная на устройстве. */
export function usableModel(store: Pick<ModelStore, 'status' | 'activeFor'>, caps: Capabilities | null, kind: MlKind = 'matte', registry: readonly ModelSpec[] = MODELS): ModelSpec | null {
  const ok = (m: ModelSpec) => m.kind === kind && store.status(m.id).state === 'ready' && !!caps && availability(m, caps).ok
  const chosen = registry.find((m) => m.id === store.activeFor(kind))
  return (chosen && ok(chosen) ? chosen : registry.find(ok)) ?? null
}
