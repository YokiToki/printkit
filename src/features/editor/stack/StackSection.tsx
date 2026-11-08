import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPlus, IconSparkles } from '@tabler/icons-react'
import type { EditorObject } from '../../../editor/scene'
import type { Op, OpKind } from '../../../editor/stack'
import {
  DEFAULT_BOOLEAN_PARAMS,
  DEFAULT_MIRROR_PARAMS,
  DEFAULT_LINEAR_PATTERN_PARAMS,
  DEFAULT_CIRCULAR_PATTERN_PARAMS,
  DEFAULT_OFFSET_PARAMS,
  DEFAULT_HOLLOW_PARAMS,
} from '../../../editor/stack'
import type { ObjectStatus } from '../../../geometry/model'
import { Section } from '../../../ui/Section'
import { ConfirmDialog } from '../../../ui/ConfirmDialog'
import { OpRow } from './OpRow'
import { OpForm } from './OpForms'
import { RollbackDivider } from './RollbackDivider'

export interface StackSectionProps {
  object: EditorObject
  allObjects: EditorObject[]
  objectStatus?: ObjectStatus
  onAddOp: (op: Op) => void
  onUpdateOp: (opId: string, patch: Partial<Op>, mergeKey?: string) => void
  onRemoveOp: (opId: string) => void
  onToggleOp: (opId: string, enabled?: boolean) => void
  onMoveOp: (fromIndex: number, toIndex: number) => void
  onSetRollback: (index: number | null) => void
  onFlatten: () => void
  onEditFeature?: (featureIndex: number) => void
  onRePickOp?: (opId: string) => void
  onRepairMesh?: (targetObjectId?: string) => void
}

export function StackSection({
  object,
  allObjects,
  objectStatus,
  onAddOp,
  onUpdateOp,
  onRemoveOp,
  onToggleOp,
  onMoveOp,
  onSetRollback,
  onFlatten,
  onEditFeature,
  onRepairMesh,
  onRePickOp,
}: StackSectionProps) {
  const { t } = useTranslation()
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [confirmFlatten, setConfirmFlatten] = useState(false)

  const stack = object.stack ?? []
  const rollback = object.rollback

  const handleCreateOp = (kind: OpKind) => {
    setAddMenuOpen(false)
    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    let newOp: Op
    switch (kind) {
      case 'boolean':
        newOp = { id, kind, enabled: true, params: { ...DEFAULT_BOOLEAN_PARAMS } }
        break
      case 'mirror':
        newOp = { id, kind, enabled: true, params: { ...DEFAULT_MIRROR_PARAMS } }
        break
      case 'linearPattern':
        newOp = { id, kind, enabled: true, params: { ...DEFAULT_LINEAR_PATTERN_PARAMS } }
        break
      case 'circularPattern':
        newOp = { id, kind, enabled: true, params: { ...DEFAULT_CIRCULAR_PATTERN_PARAMS } }
        break
      case 'offset':
        newOp = { id, kind, enabled: true, params: { ...DEFAULT_OFFSET_PARAMS } }
        break
      case 'hollow':
        newOp = { id, kind, enabled: true, params: { ...DEFAULT_HOLLOW_PARAMS } }
        break
      default:
        newOp = { id, kind: 'unknown', enabled: false, params: {} }
    }

    onAddOp(newOp)
    setExpandedOpId(id)
  }

  return (
    <Section title={t('editor.stack.title')}>
      <div className="space-y-2 pt-2 text-xs" data-testid="stack-section">
        {/* Operations list with rollback dividers */}
        {stack.length === 0 ? (
          <div className="p-3 text-center text-text-muted italic border border-dashed border-border rounded">
            {t('editor.stack.empty', 'No operations')}
          </div>
        ) : (
          <div className="flex flex-col space-y-0.5">
            <RollbackDivider
              index={0}
              isActive={rollback}
              onSetRollback={onSetRollback}
            />

            {stack.map((op, idx) => {
              const isDimmed = rollback !== null && rollback !== undefined && idx >= rollback
              const opStatus = objectStatus?.ops?.find((s) => s.opId === op.id)
              const failedInfo =
                opStatus && opStatus.status === 'failed'
                  ? { reason: opStatus.reason ?? 'error', params: opStatus.params }
                  : undefined
              const isExpanded = expandedOpId === op.id

              return (
                <div key={op.id} className="flex flex-col">
                  <OpRow
                    op={op}
                    index={idx}
                    total={stack.length}
                    isDimmed={isDimmed}
                    failedInfo={failedInfo}
                    expanded={isExpanded}
                    onToggleExpand={() => setExpandedOpId(isExpanded ? null : op.id)}
                    onToggleEnabled={() => onToggleOp(op.id)}
                    onDelete={() => onRemoveOp(op.id)}
                    onMove={onMoveOp}
                    onRepair={
                      onRepairMesh
                        ? () => onRepairMesh((op.params as any)?.targetId ?? object.id)
                        : undefined
                    }
                    onRePick={onRePickOp ? () => onRePickOp(op.id) : undefined}
                  >
                    <OpForm
                      op={op}
                      allObjects={allObjects}
                      currentObjectId={object.id}
                      onChange={(patch, mergeKey) => onUpdateOp(op.id, patch, mergeKey)}
                      onEditFeature={
                        (op.kind === 'extrude' || op.kind === 'revolve') && onEditFeature
                          ? () => onEditFeature(idx)
                          : undefined
                      }
                    />
                  </OpRow>

                  <RollbackDivider
                    index={idx + 1}
                    isActive={rollback}
                    onSetRollback={onSetRollback}
                  />
                </div>
              )
            })}
          </div>
        )}

        {/* Add Operation Menu */}
        <div className="relative pt-1">
          <button
            type="button"
            data-testid="stack-add-op-btn"
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-control border border-border bg-surface-2 hover:bg-surface-3 text-text cursor-pointer text-xs font-medium"
          >
            <IconPlus size={14} />
            <span>{t('editor.stack.add')}</span>
          </button>

          {addMenuOpen && (
            <div
              data-testid="stack-add-menu"
              className="absolute left-0 right-0 top-full mt-1 z-30 p-1 bg-surface-1 border border-border rounded-lg shadow-float flex flex-col space-y-0.5"
            >
              <button
                type="button"
                data-testid="add-op-boolean"
                onClick={() => handleCreateOp('boolean')}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 text-text text-xs cursor-pointer"
              >
                {t('editor.op.boolean')}
              </button>
              <button
                type="button"
                data-testid="add-op-mirror"
                onClick={() => handleCreateOp('mirror')}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 text-text text-xs cursor-pointer"
              >
                {t('editor.op.mirror')}
              </button>
              <button
                type="button"
                data-testid="add-op-linearPattern"
                onClick={() => handleCreateOp('linearPattern')}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 text-text text-xs cursor-pointer"
              >
                {t('editor.op.linearPattern')}
              </button>
              <button
                type="button"
                data-testid="add-op-circularPattern"
                onClick={() => handleCreateOp('circularPattern')}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 text-text text-xs cursor-pointer"
              >
                {t('editor.op.circularPattern')}
              </button>
              <button
                type="button"
                data-testid="add-op-offset"
                onClick={() => handleCreateOp('offset')}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 text-text text-xs cursor-pointer"
              >
                {t('editor.op.offset')}
              </button>
              <button
                type="button"
                data-testid="add-op-hollow"
                onClick={() => handleCreateOp('hollow')}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-2 text-text text-xs cursor-pointer"
              >
                {t('editor.op.hollow')}
              </button>
            </div>
          )}
        </div>

        {/* Flatten Stack Button */}
        {stack.length > 0 && (
          <div className="pt-1 border-t border-border/50">
            <button
              type="button"
              data-testid="stack-flatten-btn"
              onClick={() => setConfirmFlatten(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-control border border-border bg-surface-2 hover:bg-surface-3 text-text cursor-pointer text-xs font-medium"
            >
              <IconSparkles size={14} className="text-accent" />
              <span>{t('editor.stack.flatten')}</span>
            </button>
          </div>
        )}

        {/* Flatten confirmation dialog */}
        {confirmFlatten && (
          <ConfirmDialog
            title={t('editor.stack.flattenConfirmTitle')}
            confirmLabel={t('editor.stack.flatten')}
            cancelLabel={t('common.cancel')}
            onConfirm={() => {
              setConfirmFlatten(false)
              onFlatten()
            }}
            onCancel={() => setConfirmFlatten(false)}
          >
            {t('editor.stack.flattenConfirmMessage')}
          </ConfirmDialog>
        )}
      </div>
    </Section>
  )
}
