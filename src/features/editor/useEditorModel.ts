import { useMemo } from 'react'
import { useModel, type UseModelOptions } from '../../app/useModel'
import type { EditorModelParams, PartMesh } from '../../geometry/model'
import type { SceneDoc } from '../../editor/scene'

export interface UseEditorModelOptions extends UseModelOptions {}

/**
 * Хук генерации геометрии сцены редактора.
 * Вызывает `useModel('editor', ...)` только с описаниями источников (без матриц трансформации),
 * поэтому изменение позиции/поворота/масштаба никогда не запускает пересчёт геометрии в воркере.
 * Возвращает сетки деталей, индексированные по id объекта.
 */
export function useEditorModel(doc: SceneDoc, opts: UseEditorModelOptions = {}) {
  const sourcesKey = useMemo(
    () =>
      JSON.stringify({
        objects: doc.objects.map((o) => ({
          id: o.id,
          source: o.source,
        })),
        sketches: doc.sketches,
      }),
    [doc.objects, doc.sketches]
  )

  const params: EditorModelParams = useMemo(
    () => ({
      objects: doc.objects.map((o) => ({
        id: o.id,
        source: o.source,
      })),
      sketches: doc.sketches,
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
