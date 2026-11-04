import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconPointer,
  IconLine,
  IconLineDashed,
  IconRectangle,
  IconCircle,
  IconVectorSpline,
  IconCapsule,
  IconPolygon,
  IconScissors,
  IconFlipHorizontal,
  IconRulerMeasure,
  IconCheck,
  IconChevronDown,
  IconUpload,
  IconArrowsHorizontal,
  IconArrowsVertical,
  IconEqual,
  IconPoint,
} from '@tabler/icons-react'
import type { SketchTool } from './toolStateMachine'
import type { Constraint } from '../../../editor/sketch/model'

export interface SketchToolbarProps {
  tool: SketchTool
  onToolChange: (tool: SketchTool) => void
  construction: boolean
  onToggleConstruction: () => void
  onAddConstraint?: (kind: Constraint['kind']) => void
  onImportSvg?: () => void
  onFinish: () => void
  sketchName: string
  dof?: number
  hasConflict?: boolean
}

export function SketchToolbar({
  tool,
  onToolChange,
  construction,
  onToggleConstruction,
  onAddConstraint,
  onImportSvg,
  onFinish,
  sketchName,
  dof = 0,
  hasConflict = false,
}: SketchToolbarProps) {
  const { t } = useTranslation()
  const [rectMenuOpen, setRectMenuOpen] = useState(false)
  const [constraintsMenuOpen, setConstraintsMenuOpen] = useState(false)

  const isRect = tool === 'rect-2pt' || tool === 'rect-center'

  return (
    <div className="flex h-10 w-full items-center justify-between border-b border-border bg-surface-1 px-3 py-1 select-none overflow-x-auto text-xs">
      {/* Left section: Drawing & editing tools */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Select */}
        <button
          type="button"
          data-testid="sketch-tool-select"
          aria-pressed={tool === 'select'}
          title={`${t('sketch.tool.select', 'Select')} (Esc)`}
          onClick={() => onToolChange('select')}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 font-medium cursor-pointer ${
            tool === 'select'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconPointer size={16} stroke={1.75} />
        </button>

        {/* Line */}
        <button
          type="button"
          data-testid="sketch-tool-line"
          aria-pressed={tool === 'line'}
          title={`${t('sketch.tool.line', 'Line')} (L)`}
          onClick={() => onToolChange('line')}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 font-medium cursor-pointer ${
            tool === 'line'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconLine size={16} stroke={1.75} />
        </button>

        {/* Rectangle Dropdown */}
        <div className="relative inline-flex h-8 items-center rounded-control border border-border bg-bg overflow-hidden">
          <button
            type="button"
            data-testid="sketch-tool-rect"
            aria-pressed={isRect}
            title={`${t('sketch.tool.rect', 'Rectangle')} (R)`}
            onClick={() => onToolChange(tool === 'rect-center' ? 'rect-center' : 'rect-2pt')}
            className={`inline-flex h-full items-center gap-1 px-2 cursor-pointer ${
              isRect ? 'bg-surface-3 text-text' : 'text-text-muted hover:text-text'
            }`}
          >
            <IconRectangle size={16} stroke={1.75} />
          </button>
          <button
            type="button"
            data-testid="sketch-tool-rect-menu"
            aria-expanded={rectMenuOpen}
            onClick={() => setRectMenuOpen(!rectMenuOpen)}
            className="h-full px-1 border-l border-border text-text-muted hover:text-text cursor-pointer"
          >
            <IconChevronDown size={12} />
          </button>

          {rectMenuOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-30 min-w-40 rounded-card border border-border-strong bg-surface-1 p-1 shadow-float"
              onClick={() => setRectMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => onToolChange('rect-2pt')}
                className="flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                {t('sketch.tool.rect2pt', '2-Point Rectangle')}
              </button>
              <button
                type="button"
                onClick={() => onToolChange('rect-center')}
                className="flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                {t('sketch.tool.rectCenter', 'Center Rectangle')}
              </button>
            </div>
          )}
        </div>

        {/* Circle */}
        <button
          type="button"
          data-testid="sketch-tool-circle"
          aria-pressed={tool === 'circle'}
          title={`${t('sketch.tool.circle', 'Circle')} (C)`}
          onClick={() => onToolChange('circle')}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 font-medium cursor-pointer ${
            tool === 'circle'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconCircle size={16} stroke={1.75} />
        </button>

        {/* 3-Point Arc */}
        <button
          type="button"
          data-testid="sketch-tool-arc"
          aria-pressed={tool === 'arc-3pt'}
          title={`${t('sketch.tool.arc3pt', '3-Point Arc')} (A)`}
          onClick={() => onToolChange('arc-3pt')}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 font-medium cursor-pointer ${
            tool === 'arc-3pt'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconVectorSpline size={16} stroke={1.75} />
        </button>

        {/* Slot */}
        <button
          type="button"
          data-testid="sketch-tool-slot"
          aria-pressed={tool === 'slot'}
          title={t('sketch.tool.slot', 'Slot')}
          onClick={() => onToolChange('slot')}
          className={`inline-flex h-8 items-center gap-1.5 rounded-control px-2 font-medium cursor-pointer ${
            tool === 'slot'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconCapsule size={16} stroke={1.75} />
          <span className="hidden sm:inline">{t('sketch.tool.slot', 'Slot')}</span>
        </button>

        {/* Polygon */}
        <button
          type="button"
          data-testid="sketch-tool-polygon"
          aria-pressed={tool === 'polygon'}
          title={t('sketch.tool.polygon', 'Polygon')}
          onClick={() => onToolChange('polygon')}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 font-medium cursor-pointer ${
            tool === 'polygon'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconPolygon size={16} stroke={1.75} />
        </button>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Trim */}
        <button
          type="button"
          data-testid="sketch-tool-trim"
          aria-pressed={tool === 'trim'}
          title={`${t('sketch.tool.trim', 'Trim')} (T)`}
          onClick={() => onToolChange('trim')}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 font-medium cursor-pointer ${
            tool === 'trim'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconScissors size={16} stroke={1.75} />
        </button>

        {/* Mirror */}
        <button
          type="button"
          data-testid="sketch-tool-mirror"
          aria-pressed={tool === 'mirror'}
          title={t('sketch.tool.mirror', 'Mirror')}
          onClick={() => onToolChange('mirror')}
          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-control px-2 font-medium cursor-pointer ${
            tool === 'mirror'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconFlipHorizontal size={16} stroke={1.75} />
        </button>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Construction toggle */}
        <button
          type="button"
          data-testid="sketch-tool-construction"
          aria-pressed={construction}
          title={`${t('sketch.toggleConstruction', 'Toggle construction geometry')} (X)`}
          onClick={onToggleConstruction}
          className={`inline-flex h-8 items-center gap-1.5 rounded-control px-2 font-medium cursor-pointer ${
            construction
              ? 'bg-accent-muted text-white shadow-[inset_0_0_0_1px_var(--color-accent)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconLineDashed size={16} stroke={1.75} />
          <span className="hidden sm:inline">{t('sketch.tool.construction', 'Construction')}</span>
        </button>

        {/* Dimension */}
        <button
          type="button"
          data-testid="sketch-tool-dimension"
          aria-pressed={tool === 'dimension'}
          title={`${t('sketch.tool.dimension', 'Dimension')} (D)`}
          onClick={() => onToolChange('dimension')}
          className={`inline-flex h-8 items-center gap-1.5 rounded-control px-2 font-medium cursor-pointer ${
            tool === 'dimension'
              ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <IconRulerMeasure size={16} stroke={1.75} />
          <span className="hidden sm:inline">{t('sketch.tool.dimension', 'Dimension')}</span>
        </button>

        {/* Constraints Dropdown */}
        <div className="relative inline-flex h-8 items-center">
          <button
            type="button"
            data-testid="sketch-tool-constraints-menu"
            aria-expanded={constraintsMenuOpen}
            onClick={() => setConstraintsMenuOpen(!constraintsMenuOpen)}
            className="inline-flex h-full items-center gap-1 rounded-control border border-border px-2 text-text-muted hover:text-text cursor-pointer"
          >
            <span>{t('sketch.constraint.title', 'Constraints')}</span>
            <IconChevronDown size={12} />
          </button>

          {constraintsMenuOpen && (
            <div
              className="absolute left-0 top-full mt-1 z-30 min-w-48 rounded-card border border-border-strong bg-surface-1 p-1 shadow-float"
              onClick={() => setConstraintsMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => onAddConstraint?.('horizontal')}
                className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <IconArrowsHorizontal size={14} className="text-text-muted" />
                  <span>{t('sketch.constraint.horizontal', 'Horizontal')}</span>
                </span>
                <span className="font-mono text-text-subtle">H</span>
              </button>
              <button
                type="button"
                onClick={() => onAddConstraint?.('vertical')}
                className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <IconArrowsVertical size={14} className="text-text-muted" />
                  <span>{t('sketch.constraint.vertical', 'Vertical')}</span>
                </span>
                <span className="font-mono text-text-subtle">V</span>
              </button>
              <button
                type="button"
                onClick={() => onAddConstraint?.('coincident')}
                className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <IconPoint size={14} className="text-text-muted" />
                  <span>{t('sketch.constraint.coincident', 'Coincident')}</span>
                </span>
                <span className="font-mono text-text-subtle">●</span>
              </button>
              <button
                type="button"
                onClick={() => onAddConstraint?.('tangent')}
                className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <IconCircle size={14} className="text-text-muted" />
                  <span>{t('sketch.constraint.tangent', 'Tangent')}</span>
                </span>
                <span className="font-mono text-text-subtle">T</span>
              </button>
              <button
                type="button"
                onClick={() => onAddConstraint?.('parallel')}
                className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3.5 text-center font-mono font-bold text-text-muted">//</span>
                  <span>{t('sketch.constraint.parallel', 'Parallel')}</span>
                </span>
                <span className="font-mono text-text-subtle">//</span>
              </button>
              <button
                type="button"
                onClick={() => onAddConstraint?.('perpendicular')}
                className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span className="w-3.5 text-center font-mono font-bold text-text-muted">⊥</span>
                  <span>{t('sketch.constraint.perpendicular', 'Perpendicular')}</span>
                </span>
                <span className="font-mono text-text-subtle">⊥</span>
              </button>
              <button
                type="button"
                onClick={() => onAddConstraint?.('equal')}
                className="flex w-full items-center justify-between rounded-control px-2.5 py-1.5 text-left text-text hover:bg-surface-2 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <IconEqual size={14} className="text-text-muted" />
                  <span>{t('sketch.constraint.equal', 'Equal')}</span>
                </span>
                <span className="font-mono text-text-subtle">=</span>
              </button>
            </div>
          )}
          {onImportSvg && (
            <button
              type="button"
              data-testid="sketch-tool-import-svg"
              title={t('editor.sketch.importSvg', 'Import SVG...')}
              onClick={onImportSvg}
              className="inline-flex h-8 w-8 items-center justify-center rounded-control text-text-muted hover:bg-surface-3 hover:text-text cursor-pointer"
            >
              <IconUpload size={18} stroke={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Right section: Status line & Finish */}
      <div className="flex items-center gap-3 shrink-0">
        <div data-testid="sketch-dof-status" className="font-mono text-[11px] text-text-muted">
          <span className="font-medium text-text">{sketchName}</span>
          <span className="mx-1.5">·</span>
          {hasConflict ? (
            <span className="text-(--color-error-text) font-semibold">{t('sketch.conflict.badge', 'Conflict')}</span>
          ) : dof === 0 ? (
            <span className="text-(--color-success-text) font-medium">{t('sketch.properties.fullyDefined', 'Fully defined')}</span>
          ) : (
            <span>{t('sketch.properties.dofStatus', { count: dof, defaultValue: `${dof} DoF` })}</span>
          )}
        </div>

        <button
          type="button"
          data-testid="sketch-tool-finish"
          onClick={onFinish}
          className="inline-flex h-8 items-center gap-1.5 rounded-control bg-accent px-3 font-semibold text-accent-on hover:brightness-110 shadow-xs cursor-pointer"
        >
          <IconCheck size={16} stroke={2.5} />
          <span>{t('sketch.tool.finish', 'Finish')}</span>
        </button>
      </div>
    </div>
  )
}
