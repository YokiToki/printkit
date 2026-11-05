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
  IconPencil,
  IconChevronDown,
  IconChevronRight,
  IconLine,
  IconBoxModel,
  IconRotate,
  IconPlus,
  IconLayersIntersect,
} from '@tabler/icons-react'
import type { EditorObject } from '../../editor/scene'
import type { Sketch } from '../../editor/sketch/model'
import type { MeshHealth } from '../../editor/health'
import { ConfirmDialog } from '../../ui/ConfirmDialog'

export interface OutlinerProps {
  objects: EditorObject[]
  selection: string[]
  sketches?: Sketch[]
  activeSketchId?: string | null
  onSelect: (ids: string[], additive?: boolean) => void
  onToggleVisible: (id: string) => void
  onToggleLock: (id: string) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (ids: string[]) => void
  onIsolate: (id: string) => void
  onShowAll: () => void
  onEditSketch?: (id: string) => void
  onToggleSketchVisible?: (id: string) => void
  onRenameSketch?: (id: string, name: string) => void
  onDeleteSketch?: (id: string) => void
  onEditFeature?: (objectId: string, featureIndex: number) => void
  onDeleteFeature?: (objectId: string, featureIndex: number) => void
  onCombine?: (targetId: string, toolIds: string[], mode: 'union' | 'subtract' | 'intersect') => void
  onReleaseTool?: (toolId: string) => void
  healthMap?: Map<string, MeshHealth>
}

export function Outliner({
  objects,
  selection,
  sketches = [],
  activeSketchId,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onRename,
  onDuplicate,
  onDelete,
  onIsolate,
  onShowAll,
  onEditSketch,
  onToggleSketchVisible,
  onRenameSketch,
  onDeleteSketch,
  onEditFeature,
  onDeleteFeature,
  onCombine,
  onReleaseTool,
  healthMap,
}: OutlinerProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const [editingSketchId, setEditingSketchId] = useState<string | null>(null)
  const [editSketchName, setEditSketchName] = useState('')
  const editSketchInputRef = useRef<HTMLInputElement>(null)

  const [confirmDeleteSketchId, setConfirmDeleteSketchId] = useState<string | null>(null)

  const [sketchesOpen, setSketchesOpen] = useState(true)
  const [bodiesOpen, setBodiesOpen] = useState(true)
  const [expandedBodyIds, setExpandedBodyIds] = useState<Set<string>>(new Set())

  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  // Build map of tool id -> target object
  const toolToTargetMap = new Map<string, EditorObject>()
  for (const o of objects) {
    for (const op of o.stack ?? []) {
      if (op.enabled && op.kind === 'boolean') {
        const tools = (op as any).params?.tools
        if (Array.isArray(tools)) {
          for (const tId of tools) {
            toolToTargetMap.set(tId, o)
          }
        }
      }
    }
  }

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  useEffect(() => {
    if (editingSketchId && editSketchInputRef.current) {
      editSketchInputRef.current.focus()
      editSketchInputRef.current.select()
    }
  }, [editingSketchId])

  const handleDeleteSketchClick = (sketchId: string) => {
    // Check if any object depends on this sketch
    const hasDependency = objects.some(
      (o) =>
        o.source.kind === 'feature' &&
        o.source.features.some((f) => f.sketch === sketchId || f.sketchId === sketchId),
    )
    if (hasDependency) {
      setConfirmDeleteSketchId(sketchId)
    } else {
      onDeleteSketch?.(sketchId)
    }
  }

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

      <div className="flex-1 overflow-y-auto p-1 space-y-2">
        {/* Sketches section */}
        {sketches.length > 0 && (
          <div className="flex flex-col space-y-0.5">
            <button
              type="button"
              data-testid="outliner-sketches-toggle"
              onClick={() => setSketchesOpen(!sketchesOpen)}
              className="flex items-center justify-between px-2 py-1 text-text-muted hover:text-text font-semibold uppercase text-[10px] tracking-wider cursor-pointer"
            >
              <div className="flex items-center gap-1">
                {sketchesOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                <span>{t('sketch.outliner.sketches', 'Sketches')}</span>
              </div>
              <span className="font-mono text-[10px]">{sketches.length}</span>
            </button>

            {sketchesOpen &&
              sketches.map((sk) => {
                const isEditingThisSketch = activeSketchId === sk.id
                const isRenaming = editingSketchId === sk.id

                return (
                  <div
                    key={sk.id}
                    data-testid={`outliner-sketch-row-${sk.id}`}
                    onDoubleClick={() => onEditSketch?.(sk.id)}
                    className={`group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                      isEditingThisSketch
                        ? 'bg-accent-muted/40 text-text font-medium ring-1 ring-accent'
                        : 'text-text-muted hover:bg-surface-2 hover:text-text'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {/* Visibility Toggle */}
                      <button
                        type="button"
                        data-testid={`outliner-toggle-sketch-vis-${sk.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleSketchVisible?.(sk.id)
                        }}
                        className="p-0.5 text-text-muted hover:text-text rounded cursor-pointer shrink-0"
                        title={sk.visible ? t('editor.outliner.hide') : t('editor.outliner.show')}
                      >
                        {sk.visible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                      </button>

                      <IconLine size={14} className="text-accent shrink-0" />

                      {isRenaming ? (
                        <input
                          ref={editSketchInputRef}
                          type="text"
                          value={editSketchName}
                          onChange={(e) => setEditSketchName(e.target.value)}
                          onBlur={() => {
                            if (editSketchName.trim()) {
                              onRenameSketch?.(sk.id, editSketchName.trim())
                            }
                            setEditingSketchId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editSketchName.trim()) {
                                onRenameSketch?.(sk.id, editSketchName.trim())
                              }
                              setEditingSketchId(null)
                            } else if (e.key === 'Escape') {
                              setEditingSketchId(null)
                            }
                          }}
                          className="h-5 px-1 py-0 text-xs bg-bg border border-accent rounded text-text outline-none w-full"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="truncate flex-1"
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setEditingSketchId(sk.id)
                            setEditSketchName(sk.name)
                          }}
                        >
                          {sk.name}
                        </span>
                      )}

                      {isEditingThisSketch && (
                        <span className="text-[10px] px-1 py-0.2 bg-accent/20 text-accent font-medium rounded shrink-0">
                          Editing
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        data-testid={`outliner-edit-sketch-${sk.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditSketch?.(sk.id)
                        }}
                        title={t('sketch.outliner.edit', 'Edit Sketch')}
                        className="p-1 hover:text-accent rounded cursor-pointer"
                      >
                        <IconPencil size={13} />
                      </button>
                      <button
                        type="button"
                        data-testid={`outliner-delete-sketch-${sk.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteSketchClick(sk.id)
                        }}
                        title={t('common.delete', 'Delete')}
                        className="p-1 hover:text-(--color-error-text) rounded cursor-pointer"
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {/* Bodies / Objects section */}
        <div className="flex flex-col space-y-0.5">
          {sketches.length > 0 && (
            <button
              type="button"
              data-testid="outliner-bodies-toggle"
              onClick={() => setBodiesOpen(!bodiesOpen)}
              className="flex items-center justify-between px-2 py-1 text-text-muted hover:text-text font-semibold uppercase text-[10px] tracking-wider cursor-pointer"
            >
              <div className="flex items-center gap-1">
                {bodiesOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                <span>{t('sketch.outliner.bodies', 'Bodies')}</span>
              </div>
              <span className="font-mono text-[10px]">{objects.length}</span>
            </button>
          )}

          {bodiesOpen && (
            objects.length === 0 ? (
              <div className="p-4 text-center text-text-muted italic">
                {t('editor.outliner.empty')}
              </div>
            ) : (
              objects.map((obj, index) => {
                const isSelected = selection.includes(obj.id)
                const health = healthMap?.get(obj.id)
                const isMissingMesh = obj.source.kind === 'mesh' && !health
                const isOpen = health && !health.closed
                const isFeatureBody = obj.source.kind === 'feature'
                const features = obj.source.kind === 'feature' ? obj.source.features : []
                const isExpanded = expandedBodyIds.has(obj.id)

            return (
              <div key={obj.id} className="flex flex-col space-y-0.5">
                <div
                  tabIndex={0}
                  data-testid={`outliner-row-${obj.id}`}
                  onClick={(e) => handleRowClick(e, obj.id)}
                  onContextMenu={(e) => handleContextMenu(e, obj.id)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors outline-none
                    ${isSelected ? 'bg-surface-3 text-text font-medium ring-1 ring-border-strong' : 'text-text-muted hover:bg-surface-2 hover:text-text'}
                    ${!obj.visible ? 'opacity-40' : ''}`}
                >
                  {/* Feature Body Expand / Collapse */}
                  {isFeatureBody && (
                    <button
                      type="button"
                      data-testid={`outliner-body-expand-${obj.id}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedBodyIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(obj.id)) next.delete(obj.id)
                          else next.add(obj.id)
                          return next
                        })
                      }}
                      className="p-0.5 text-text-muted hover:text-text rounded cursor-pointer"
                    >
                      {isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                    </button>
                  )}

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

                  {/* Chips: Ops count and Tool of */}
                  {(obj.stack?.length ?? 0) > 0 && (
                    <span
                      data-testid={`outliner-ops-chip-${obj.id}`}
                      className="shrink-0 px-1.5 py-0.2 rounded text-[10px] bg-surface-3 text-text-muted font-mono"
                    >
                      {t('editor.stack.opsCount', { count: obj.stack!.length })}
                    </span>
                  )}
                  {toolToTargetMap.get(obj.id) && (
                    <span
                      data-testid={`outliner-tool-chip-${obj.id}`}
                      className="shrink-0 px-1.5 py-0.2 rounded text-[10px] bg-accent/15 text-accent font-medium border border-accent/30"
                    >
                      {t('editor.stack.toolOf', { name: toolToTargetMap.get(obj.id)!.name })}
                    </span>
                  )}

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

                {/* Features list under body */}
                {isFeatureBody && isExpanded && (
                  <div className="pl-6 flex flex-col space-y-0.5">
                    {features.map((feat, fIdx) => (
                      <div
                        key={feat.id ?? fIdx}
                        data-testid={`outliner-feature-row-${obj.id}-${fIdx}`}
                        className="group/feat flex items-center justify-between px-2 py-1 rounded text-text-muted hover:bg-surface-2 hover:text-text cursor-default text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {feat.kind === 'extrude' ? (
                            <IconBoxModel size={13} className="text-accent shrink-0" />
                          ) : (
                            <IconRotate size={13} className="text-accent shrink-0" />
                          )}
                          <span className="truncate">
                            {feat.kind === 'extrude'
                              ? t('sketch.feature.extrude', 'Extrude')
                              : t('sketch.feature.revolve', 'Revolve')}
                            {` (${feat.op})`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/feat:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            data-testid={`outliner-edit-feature-${obj.id}-${fIdx}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onEditFeature?.(obj.id, fIdx)
                            }}
                            title={t('common.edit', 'Edit')}
                            className="p-0.5 hover:text-accent rounded cursor-pointer"
                          >
                            <IconPencil size={12} />
                          </button>
                          {features.length > 1 && (
                            <button
                              type="button"
                              data-testid={`outliner-delete-feature-${obj.id}-${fIdx}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteFeature?.(obj.id, fIdx)
                              }}
                              title={t('common.delete', 'Delete')}
                              className="p-0.5 hover:text-error-text rounded cursor-pointer"
                            >
                              <IconTrash size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        ))}
      </div>
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
          {toolToTargetMap.has(contextMenu.id) && (
            <>
              <div className="h-px bg-border my-1" />
              <button
                type="button"
                data-testid="outliner-action-release-tool"
                onClick={() => {
                  onReleaseTool?.(contextMenu.id)
                  setContextMenu(null)
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-surface-3 text-text cursor-pointer"
              >
                <IconLayersIntersect size={14} className="text-accent" />
                <span>{t('editor.stack.releaseTool')}</span>
              </button>
            </>
          )}
          {selection.length > 1 && selection.includes(contextMenu.id) && (
            <>
              <div className="h-px bg-border my-1" />
              <button
                type="button"
                data-testid="outliner-action-combine-union"
                onClick={() => {
                  onCombine?.(
                    contextMenu.id,
                    selection.filter((id) => id !== contextMenu.id),
                    'union'
                  )
                  setContextMenu(null)
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-surface-3 text-text cursor-pointer"
              >
                <IconPlus size={14} />
                <span>{t('editor.stack.combine')} · {t('editor.op.union')}</span>
              </button>
              <button
                type="button"
                data-testid="outliner-action-combine-subtract"
                onClick={() => {
                  onCombine?.(
                    contextMenu.id,
                    selection.filter((id) => id !== contextMenu.id),
                    'subtract'
                  )
                  setContextMenu(null)
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-surface-3 text-text cursor-pointer"
              >
                <IconLayersIntersect size={14} />
                <span>{t('editor.stack.combine')} · {t('editor.op.subtract')}</span>
              </button>
              <button
                type="button"
                data-testid="outliner-action-combine-intersect"
                onClick={() => {
                  onCombine?.(
                    contextMenu.id,
                    selection.filter((id) => id !== contextMenu.id),
                    'intersect'
                  )
                  setContextMenu(null)
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-surface-3 text-text cursor-pointer"
              >
                <IconLayersIntersect size={14} />
                <span>{t('editor.stack.combine')} · {t('editor.op.intersect')}</span>
              </button>
            </>
          )}
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

      {/* Confirm delete sketch dialog */}
      {confirmDeleteSketchId && (
        <ConfirmDialog
          title={t('sketch.delete.confirmTitle', 'Delete sketch?')}
          confirmLabel={t('common.delete', 'Delete')}
          cancelLabel={t('common.cancel', 'Cancel')}
          danger
          onConfirm={() => {
            onDeleteSketch?.(confirmDeleteSketchId)
            setConfirmDeleteSketchId(null)
          }}
          onCancel={() => setConfirmDeleteSketchId(null)}
        >
          {t(
            'sketch.delete.confirmMessage',
            'Bodies and features using this sketch will fail to rebuild. Are you sure you want to delete it?',
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
