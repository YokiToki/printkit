import { useMemo } from 'react'
import { useModel, type UseModelOptions } from '../../app/useModel'
import type { EditorModelParams, PartMesh } from '../../geometry/model'
import type { SceneDoc } from '../../editor/scene'
import { matrixOf } from '../../editor/scene'

export interface UseEditorModelOptions extends UseModelOptions {}

/**
 * Хук генерации геометрии сцены редактора.
 * Вызывает `useModel('editor', ...)` со всеми объектами, их стеками операций и матрицами.
 * Возвращает сетки деталей, индексированные по id объекта, и результаты валидации стека.
 */
export function useEditorModel(doc: SceneDoc, opts: UseEditorModelOptions = {}) {
  const hasBooleanOps = doc.objects.some((o) =>
    (o.stack ?? []).some((op) => op.enabled && op.kind === 'boolean')
  )

  const sourcesKey = useMemo(
    () =>
      JSON.stringify({
        objects: doc.objects.map((o) => ({
          id: o.id,
          name: o.name,
          visible: o.visible,
          source: o.source,
          stack: o.stack,
          rollback: o.rollback,
          matrix: hasBooleanOps ? matrixOf(o.transform) : undefined,
        })),
        sketches: doc.sketches,
        cuts: doc.cuts,
      }),
    [doc.objects, doc.sketches, doc.cuts, hasBooleanOps]
  )

  const params: EditorModelParams = useMemo(
    () => ({
      objects: doc.objects.map((o) => ({
        id: o.id,
        name: o.name,
        visible: o.visible,
        source: o.source,
        stack: o.stack,
        rollback: o.rollback,
        matrix: matrixOf(o.transform),
      })),
      sketches: doc.sketches,
      cuts: doc.cuts,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourcesKey]
  )

  const { model, pending, error } = useModel('editor', params, opts)

  const partsById = useMemo(() => {
    const map = new Map<string, PartMesh>()
    if (model) {
      for (const p of model.parts) {
        map.set(p.label, p)
      }
    }
    return map
  }, [model])

  return {
    model,
    partsById,
    pending,
    error,
  }
}
