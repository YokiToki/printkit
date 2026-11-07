import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconGripVertical,
  IconEye,
  IconEyeOff,
  IconTrash,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconArrowUp,
  IconArrowDown,
  IconBoxModel,
  IconRotate,
  IconLayersIntersect,
  IconFlipHorizontal,
  IconCopy,
  IconRotate2,
  IconArrowsMaximize,
  IconBox,
  IconAdjustments,
} from '@tabler/icons-react'
import type { Op } from '../../../editor/stack'
import { opSummary } from '../../../editor/stack'

export interface OpRowProps {
  op: Op
  index: number
  total: number
  isDimmed: boolean
  failedInfo?: { reason: string; params?: Record<string, string | number> }
  expanded: boolean
  onToggleExpand: () => void
  onToggleEnabled: () => void
  onDelete: () => void
  onMove: (fromIndex: number, toIndex: number) => void
  onRepair?: () => void
  children?: ReactNode
}

function getOpIcon(kind: string) {
  switch (kind) {
    case 'extrude':
      return <IconBoxModel size={15} className="text-accent shrink-0" />
    case 'revolve':
      return <IconRotate size={15} className="text-accent shrink-0" />
    case 'boolean':
      return <IconLayersIntersect size={15} className="text-accent shrink-0" />
    case 'mirror':
      return <IconFlipHorizontal size={15} className="text-accent shrink-0" />
    case 'linearPattern':
      return <IconCopy size={15} className="text-accent shrink-0" />
    case 'circularPattern':
      return <IconRotate2 size={15} className="text-accent shrink-0" />
    case 'offset':
      return <IconArrowsMaximize size={15} className="text-accent shrink-0" />
    case 'hollow':
      return <IconBox size={15} className="text-accent shrink-0" />
    default:
      return <IconAdjustments size={15} className="text-text-muted shrink-0" />
  }
}

export function OpRow({
  op,
  index,
  total,
  isDimmed,
  failedInfo,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onDelete,
  onMove,
  onRepair,
  children,
}: OpRowProps) {
  const { t } = useTranslation()
  const summary = opSummary(op)
  const isFailed = !!failedInfo

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault()
      if (index > 0) onMove(index, index - 1)
    } else if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      if (index < total - 1) onMove(index, index + 1)
    }
  }

  return (
    <div
      tabIndex={0}
      data-testid={`op-row-${index}`}
      data-op-id={op.id}
      onKeyDown={handleKeyDown}
      className={`rounded border transition-colors outline-none ${
        isFailed
          ? 'border-error-text/50 bg-error-surface/10'
          : 'border-border bg-surface-2'
      } ${isDimmed ? 'opacity-40' : ''} ${!op.enabled ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between p-1.5 gap-1 select-none">
        {/* Left: Drag grip & reorder buttons */}
        <div className="flex items-center gap-0.5">
          <div
            data-testid={`op-drag-handle-${index}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(index))
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const from = Number(e.dataTransfer.getData('text/plain'))
              if (!Number.isNaN(from) && from !== index) {
                onMove(from, index)
              }
            }}
            className="cursor-grab text-text-muted hover:text-text p-0.5"
            title={t('editor.op.reorder', 'Reorder')}
          >
            <IconGripVertical size={14} />
          </div>

          {/* Move up / down buttons */}
          <div className="flex flex-col">
            <button
              type="button"
              data-testid={`op-move-up-${index}`}
              disabled={index === 0}
              onClick={() => onMove(index, index - 1)}
              title={t('editor.op.moveUp')}
              className="text-text-muted hover:text-text disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
            >
              <IconArrowUp size={10} />
            </button>
            <button
              type="button"
              data-testid={`op-move-down-${index}`}
              disabled={index === total - 1}
              onClick={() => onMove(index, index + 1)}
              title={t('editor.op.moveDown')}
              className="text-text-muted hover:text-text disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
            >
              <IconArrowDown size={10} />
            </button>
          </div>

          {/* Eye toggle */}
          <button
            type="button"
            data-testid={`op-toggle-enabled-${index}`}
            onClick={onToggleEnabled}
            title={op.enabled ? t('editor.op.suppress') : t('editor.op.unsuppress')}
            className="p-1 text-text-muted hover:text-text rounded cursor-pointer"
          >
            {op.enabled ? <IconEye size={14} /> : <IconEyeOff size={14} className="text-text-muted" />}
          </button>
        </div>

        {/* Center: Icon, Summary & Failure */}
        <div
          data-testid={`op-summary-${index}`}
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-1.5 min-w-0 cursor-pointer"
        >
          {getOpIcon(op.kind)}
          <div className="flex flex-col min-w-0">
            <span
              className={`text-xs font-medium truncate ${
                !op.enabled ? 'line-through text-text-muted' : 'text-text'
              }`}
            >
              {t(`editor.op.${op.kind}`, op.kind)}
            </span>
            <span className="text-[10px] text-text-muted truncate">
              {t(summary.key, summary.params ?? {})}
            </span>
          </div>

          {isFailed && (
            <div className="flex items-center gap-1 ml-auto shrink-0">
              <span
                data-testid={`op-failed-mark-${index}`}
                title={t(failedInfo.reason, failedInfo.params ?? {})}
                className="inline-flex items-center text-error-text"
              >
                <IconAlertTriangle size={14} />
              </span>
              {failedInfo.reason === 'stack.error.notSolid' && onRepair && (
                <button
                  type="button"
                  data-testid={`op-repair-btn-${index}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRepair()
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25 font-medium cursor-pointer"
                >
                  {t('mesh.repairAction', 'Repair')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Expand chevron & Delete */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            data-testid={`op-expand-btn-${index}`}
            onClick={onToggleExpand}
            title={expanded ? t('common.collapse') : t('common.expand')}
            className="p-1 text-text-muted hover:text-text rounded cursor-pointer"
          >
            {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>

          <button
            type="button"
            data-testid={`op-delete-btn-${index}`}
            onClick={onDelete}
            title={t('editor.op.delete')}
            className="p-1 text-text-muted hover:text-error-text rounded cursor-pointer"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>

      {/* Expanded Op form */}
      {expanded && children && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-border/50 bg-surface-1/40">
          {children}
        </div>
      )}
    </div>
  )
}
