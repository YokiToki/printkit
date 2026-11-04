import { useState, useRef, useEffect, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconEye,
  IconEyeOff,
  IconLock,
  IconLockOpen,
  IconAlertTriangle,
  IconCopy,
  IconTrash,
  IconEyeCheck,
  IconFocusCentered,
  IconDotsVertical,
} from '@tabler/icons-react'
import type { EditorObject } from '../../editor/scene'
import type { MeshHealth } from '../../editor/health'

export interface OutlinerProps {
  objects: EditorObject[]
  selection: string[]
  onSelect: (ids: string[], additive?: boolean) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (ids: string[]) => void
  onIsolate: (id: string) => void
  onShowAll: () => void
  healthMap?: Map<string, MeshHealth>
}

export function Outliner({
  objects,
  selection,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onRename,
  onDuplicate,
  onDelete,
  onIsolate,
  onShowAll,
  healthMap,
}: OutlinerProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null)
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [])

  const startRename = (obj: EditorObject) => {
    setEditingId(obj.id)
    setEditName(obj.name)
    setContextMenu(null)
  }

  const commitRename = () => {
    if (editingId) {
      const trimmed = editName.trim()
      if (trimmed) onRename(editingId, trimmed)
      setEditingId(null)
    }
  }

  const handleRowClick = (e: MouseEvent, id: string) => {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey
    onSelect([id], additive)
  }

  const handleContextMenu = (e: MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ id, x: e.clientX, y: e.clientY })
    if (!selection.includes(id)) {
      onSelect([id], false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (editingId) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = Math.min(objects.length - 1, index + 1)
      onSelect([objects[nextIndex].id], false)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = Math.max(0, index - 1)
      onSelect([objects[prevIndex].id], false)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onDelete(selection)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      startRename(objects[index])
    }
  }

  return (
    <div
      data-testid="outliner"
      className="flex flex-col h-full bg-surface-1 border-r border-border select-none text-xs"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-1 font-medium text-text">
        <span>{t('editor.outliner.title')}</span>
        <span className="text-text-muted text-[11px]">{objects.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
        {objects.length === 0 ? (
          <div className="p-4 text-center text-text-muted italic">
            {t('editor.outliner.empty')}
          </div>
        ) : (
          objects.map((obj, index) => {
            const isSelected = selection.includes(obj.id)
            const health = healthMap?.get(obj.id)
            const isMissingMesh = obj.source.kind === 'mesh' && !health
            const isOpen = health && !health.closed

            return (
              <div
                key={obj.id}
                tabIndex={0}
                data-testid={`outliner-row-${obj.id}`}
                onClick={(e) => handleRowClick(e, obj.id)}
                onContextMenu={(e) => handleContextMenu(e, obj.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors outline-none
                  ${isSelected ? 'bg-surface-3 text-text font-medium ring-1 ring-border-strong' : 'text-text-muted hover:bg-surface-2 hover:text-text'}
                  ${!obj.visible ? 'opacity-40' : ''}`}
              >
                {/* Visibility Toggle */}
                <button
                  type="button"
                  data-testid={`outliner-toggle-vis-${obj.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleVisible(obj.id)
                  }}
                  className="p-0.5 text-text-muted hover:text-text rounded cursor-pointer"
                  title={obj.visible ? t('editor.outliner.hide') : t('editor.outliner.show')}
                >
                  {obj.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                </button>

                {/* Lock Toggle */}
                <button
                  type="button"
                  data-testid={`outliner-toggle-lock-${obj.id}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleLock(obj.id)
                  }}
                  className="p-0.5 text-text-muted hover:text-text rounded cursor-pointer"
                  title={obj.locked ? t('editor.outliner.unlock') : t('editor.outliner.lock')}
                >
                  {obj.locked ? <IconLock size={14} className="text-warn-text" /> : <IconLockOpen size={14} />}
                </button>

                {/* Object Name or Inline Rename */}
                <div className="flex-1 min-w-0 flex items-center gap-1.5" onDoubleClick={() => startRename(obj)}>
                  {editingId === obj.id ? (
                    <input
                      ref={editInputRef}
                      data-testid={`outliner-rename-input-${obj.id}`}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="w-full bg-surface-3 border border-accent rounded px-1 py-0.5 text-xs text-text outline-none"
                    />
                  ) : (
                    <span className="truncate">{obj.name}</span>
                  )}
                </div>

                {/* Mesh Health / Missing Flags */}
                {isMissingMesh && (
                  <span
                    data-testid={`outliner-flag-missing-${obj.id}`}
                    className="text-error-text"
                    title={t('editor.health.missing')}
                  >
                    <IconAlertTriangle size={14} />
                  </span>
                )}
                {isOpen && (
                  <span
                    data-testid={`outliner-flag-open-${obj.id}`}
                    className="text-warn-text"
                    title={t('editor.health.open')}
                  >
                    <IconAlertTriangle size={14} />
                  </span>
                )}

                {/* Context Menu Trigger */}
                <button
                  type="button"
                  data-testid={`outliner-menu-btn-${obj.id}`}
                  onClick={(e) => handleContextMenu(e, obj.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-text rounded cursor-pointer"
                >
                  <IconDotsVertical size={13} />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Context Menu Popover */}
      {contextMenu && (
        <div
          data-testid="outliner-context-menu"
          className="fixed z-50 min-w-[140px] bg-surface-2 border border-border-strong rounded-md shadow-lg p-1 text-xs"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-testid="outliner-action-duplicate"
            onClick={() => {
              onDuplicate(contextMenu.id)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-surface-3 text-text cursor-pointer"
          >
            <IconCopy size={14} />
            <span>{t('editor.outliner.duplicate')}</span>
          </button>
          <button
            type="button"
            data-testid="outliner-action-isolate"
            onClick={() => {
              onIsolate(contextMenu.id)
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-surface-3 text-text cursor-pointer"
          >
            <IconFocusCentered size={14} />
            <span>{t('editor.outliner.isolate')}</span>
          </button>
          <button
            type="button"
            data-testid="outliner-action-showall"
            onClick={() => {
              onShowAll()
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-surface-3 text-text cursor-pointer"
          >
            <IconEyeCheck size={14} />
            <span>{t('editor.outliner.showAll')}</span>
          </button>
          <div className="h-px bg-border my-1" />
          <button
            type="button"
            data-testid="outliner-action-delete"
            onClick={() => {
              onDelete([contextMenu.id])
              setContextMenu(null)
            }}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-error-bg text-error-text cursor-pointer"
          >
            <IconTrash size={14} />
            <span>{t('editor.outliner.delete')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
