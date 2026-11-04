import { useCallback, useRef, useState } from 'react'
import { log } from '../../app/activityLog'
import { History } from '../../editor/history'
import type { SceneDoc } from '../../editor/scene'

export interface UseEditorDispatchReturn {
  doc: SceneDoc
  dispatch: (label: string, updater: (prev: SceneDoc) => SceneDoc, mergeKey?: string) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  undoLabel?: string
  redoLabel?: string
  history: History<SceneDoc>
}

export function useEditorDispatch(
  initialDoc: SceneDoc,
  onDocChange?: (doc: SceneDoc) => void
): UseEditorDispatchReturn {
  const [doc, setDocState] = useState<SceneDoc>(initialDoc)
  const historyRef = useRef<History<SceneDoc>>(new History<SceneDoc>())

  // Force re-render on history stack changes for button enable/disable
  const [, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)

  const docRef = useRef(doc)
  docRef.current = doc

  const setDoc = useCallback(
    (next: SceneDoc) => {
      setDocState(next)
      onDocChange?.(next)
    },
    [onDocChange]
  )

  const dispatch = useCallback(
    (label: string, updater: (prev: SceneDoc) => SceneDoc, mergeKey?: string) => {
      const prev = docRef.current
      const next = updater(prev)
      if (next === prev) return

      historyRef.current.push(label, prev, next, mergeKey)
      setDoc(next)
      bump()

      // Пишет в журнал для отображения имени шага в строке состояния
      log.info('editor', 'log.editor.step', { name: label })
    },
    [setDoc]
  )

  const undo = useCallback(() => {
    const step = historyRef.current.undo()
    if (!step) return
    setDoc(step.state)
    bump()
    log.info('editor', 'log.editor.undoStep', { name: step.label })
  }, [setDoc])

  const redo = useCallback(() => {
    const step = historyRef.current.redo()
    if (!step) return
    setDoc(step.state)
    bump()
    log.info('editor', 'log.editor.redoStep', { name: step.label })
  }, [setDoc])

  return {
    doc,
    dispatch,
    undo,
    redo,
    canUndo: historyRef.current.canUndo(),
    canRedo: historyRef.current.canRedo(),
    undoLabel: historyRef.current.currentUndoLabel(),
    redoLabel: historyRef.current.currentRedoLabel(),
    history: historyRef.current,
  }
}
