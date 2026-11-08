import { useState, useRef, type ChangeEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconUpload,
  IconPlus,
  IconPointer,
  IconArrowsMove,
  IconRotate,
  IconDimensions,
  IconMagnet,
  IconFocusCentered,
  IconKeyboard,
  IconChevronDown,
  IconRuler,
  IconEyeCheck,
  IconScissors,
  IconCircleDot,
  IconLetterT,
} from '@tabler/icons-react'
import type { PrimitiveShape } from '../../editor/scene'
import type { PlaneDefinition } from '../../editor/sketch/model'
import { loadEditorUi, saveEditorUi } from './editorUiStore'
import { SegmentedControl } from '../../ui/SegmentedControl'
import type { SelectionMode } from './face/FaceToolsPanel'

export type TransformTool =
  | 'select'
  | 'translate'
  | 'rotate'
  | 'scale'
  | 'measure'
  | 'cut'
  | 'hole'
  | 'text'

export interface ToolbarProps {
  tool: TransformTool
  onToolChange: (tool: TransformTool) => void
  snap: boolean
  onSnapChange: (snap: boolean) => void
  snapStepMm?: number
  snapStepDeg?: number
  onSnapStepChange?: (mm: number, deg: number) => void
  projection: 'persp' | 'ortho'
  onProjectionChange: (projection: 'persp' | 'ortho') => void
  onFit: () => void
  onAddPrimitive: (shape: PrimitiveShape) => void
  onImportFiles: (files: File[], unit: 'mm' | 'in') => void
  onAddSketch?: (plane: PlaneDefinition) => void
  onOpenFeatureDialog?: (kind: 'extrude' | 'revolve') => void
  onOpenSplitDialog?: () => void
  onImportSvgFile?: (file: File) => void
  onImportSvgClick?: () => void
  hasSketches?: boolean
  analysisOpen?: boolean
  onToggleAnalysis?: () => void
  /** Режим выбора: объект, грань или ребро. */
  selectionMode?: SelectionMode
  onSelectionModeChange?: (mode: SelectionMode) => void
}

const PRIMITIVE_LIST: PrimitiveShape[] = ['box', 'cylinder', 'sphere', 'cone', 'torus', 'wedge']

export function Toolbar({
  tool,
  onToolChange,
  snap,
  onSnapChange,
  snapStepMm = 5,
  snapStepDeg = 15,
  onSnapStepChange,
  projection,
  onProjectionChange,
  onFit,
  onAddPrimitive,
  onImportFiles,
  onAddSketch,
  onOpenFeatureDialog,
  onOpenSplitDialog,
  onImportSvgFile,
  onImportSvgClick,
  hasSketches = false,
  analysisOpen = false,
  onToggleAnalysis,
  selectionMode = 'object',
  onSelectionModeChange,
}: ToolbarProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [hotkeysOpen, setHotkeysOpen] = useState(false)
  const [snapMenuOpen, setSnapMenuOpen] = useState(false)

  // Unit choice dialog state
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<'mm' | 'in'>('mm')
  const [rememberChoice, setRememberChoice] = useState(false)

  const handleFiles = (files: File[]) => {
    if (!files.length) return
    const svgFile = files.find((f) => f.name.toLowerCase().endsWith('.svg') || f.type.includes('svg'))
    const stlFiles = files.filter((f) => f.name.toLowerCase().endsWith('.stl') || f.type.includes('stl'))

    if (svgFile && onImportSvgFile) {
      onImportSvgFile(svgFile)
    }

    if (stlFiles.length > 0) {
      const ui = loadEditorUi()
      if (ui.rememberUnit) {
        onImportFiles(stlFiles, ui.importUnit)
        return
      }
      setPendingFiles(stlFiles)
      setSelectedUnit(ui.importUnit)
      setRememberChoice(false)
    }
  }

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length > 0) {
      handleFiles(files)
    }
    // Reset file input so re-selecting the same file triggers change
    e.target.value = ''
  }

  const handleConfirmUnit = () => {
    if (!pendingFiles) return
    if (rememberChoice) {
      saveEditorUi({ importUnit: selectedUnit, rememberUnit: true })
    }
    onImportFiles(pendingFiles, selectedUnit)
    setPendingFiles(null)
  }

  const handleCancelUnit = () => {
    setPendingFiles(null)
  }

  return (
    <>
      <header
        data-testid="editor-toolbar"
        className="flex h-11 items-center justify-between gap-2 overflow-x-auto border-b border-border bg-surface-1 px-3 text-xs select-none"
      >
        {/* Left section: Import & Add */}
        <div className="flex items-center gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".stl,.svg"
            data-testid="stl-file-input"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <button
            type="button"
            data-testid="toolbar-import-button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong bg-surface-2 px-3 font-medium text-text hover:bg-surface-3 cursor-pointer"
          >
            <IconUpload size={16} stroke={1.75} />
            <span>{t('editor.toolbar.import')}</span>
          </button>

          {/* Add primitive menu */}
          <div className="relative">
            <button
              type="button"
              data-testid="toolbar-add-button"
              aria-expanded={addMenuOpen}
              onClick={() => setAddMenuOpen(!addMenuOpen)}
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong bg-surface-2 px-3 font-medium text-text hover:bg-surface-3 cursor-pointer"
            >
              <IconPlus size={16} stroke={1.75} />
              <span>{t('editor.toolbar.add')}</span>
              <IconChevronDown size={14} className="text-text-muted" />
            </button>

            {addMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setAddMenuOpen(false)}
                />
                <div
                  data-testid="toolbar-add-menu"
                  className="absolute left-0 top-full mt-1 z-40 min-w-44 rounded-card border border-border bg-surface-1 py-1 shadow-float"
                >
                  <div className="px-3 py-1 text-[10px] font-semibold text-text-subtle uppercase tracking-wider">
                    {t('sketch.menu.title', 'Sketch')}
                  </div>
                  <button
                    type="button"
                    data-testid="toolbar-add-sketch-xy"
                    onClick={() => {
                      onAddSketch?.({ base: 'XY', offset: 0 })
                      setAddMenuOpen(false)
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-text hover:bg-surface-3 cursor-pointer"
                  >
                    <span>{t('sketch.plane.xy', 'Sketch (XY Top)')}</span>
                    <span className="font-mono text-text-subtle text-[10px]">XY</span>
                  </button>
                  <button
                    type="button"
                    data-testid="toolbar-add-sketch-xz"
                    onClick={() => {
                      onAddSketch?.({ base: 'XZ', offset: 0 })
                      setAddMenuOpen(false)
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-text hover:bg-surface-3 cursor-pointer"
                  >
                    <span>{t('sketch.plane.xz', 'Sketch (XZ Front)')}</span>
                    <span className="font-mono text-text-subtle text-[10px]">XZ</span>
                  </button>
                  <button
                    type="button"
                    data-testid="toolbar-add-sketch-yz"
                    onClick={() => {
                      onAddSketch?.({ base: 'YZ', offset: 0 })
                      setAddMenuOpen(false)
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-text hover:bg-surface-3 cursor-pointer"
                  >
                    <span>{t('sketch.plane.yz', 'Sketch (YZ Right)')}</span>
                    <span className="font-mono text-text-subtle text-[10px]">YZ</span>
                  </button>
                  <button
                    type="button"
                    data-testid="toolbar-import-svg"
                    onClick={() => {
                      onImportSvgClick?.()
                      setAddMenuOpen(false)
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-text hover:bg-surface-3 cursor-pointer"
                  >
                    <span>{t('editor.sketch.importSvg', 'Import SVG...')}</span>
                  </button>

                  {hasSketches && (
                    <>
                      <div className="h-px bg-border my-1" />
                      <div className="px-3 py-1 text-[10px] font-semibold text-text-subtle uppercase tracking-wider">
                        {t('sketch.menu.features', 'Features')}
                      </div>
                      <button
                        type="button"
                        data-testid="toolbar-add-extrude"
                        onClick={() => {
                          onOpenFeatureDialog?.('extrude')
                          setAddMenuOpen(false)
                        }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-text hover:bg-surface-3 cursor-pointer"
                      >
                        <span>{t('sketch.feature.extrude', 'Extrude')}</span>
                      </button>
                      <button
                        type="button"
                        data-testid="toolbar-add-revolve"
                        onClick={() => {
                          onOpenFeatureDialog?.('revolve')
                          setAddMenuOpen(false)
                        }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-text hover:bg-surface-3 cursor-pointer"
                      >
                        <span>{t('sketch.feature.revolve', 'Revolve')}</span>
                      </button>
                    </>
                  )}

                  <div className="h-px bg-border my-1" />

                  <div className="px-3 py-1 text-[10px] font-semibold text-text-subtle uppercase tracking-wider">
                    {t('cut.menuTitle', 'Cut & Split')}
                  </div>
                  <button
                    type="button"
                    data-testid="toolbar-split-dialog"
                    onClick={() => {
                      onOpenSplitDialog?.()
                      setAddMenuOpen(false)
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-text hover:bg-surface-3 cursor-pointer"
                  >
                    <span>{t('cut.splitToBed', 'Split to bed...')}</span>
                  </button>

                  <div className="h-px bg-border my-1" />

                  <div className="px-3 py-1 text-[10px] font-semibold text-text-subtle uppercase tracking-wider">
                    {t('editor.toolbar.primitives', 'Primitives')}
                  </div>
                  {PRIMITIVE_LIST.map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      data-testid={`toolbar-add-${shape}`}
                      onClick={() => {
                        onAddPrimitive(shape)
                        setAddMenuOpen(false)
                      }}
                      className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text hover:bg-surface-3 cursor-pointer"
                    >
                      {t(`editor.primitive.${shape}`)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center section: Tool selector */}
        <div
          role="group"
          aria-label={t('editor.toolbar.select')}
          className="inline-flex h-8 items-center gap-0.5 rounded-control border border-border bg-bg p-0.5"
        >
          <button
            type="button"
            data-testid="toolbar-tool-select"
            aria-pressed={tool === 'select'}
            title={t('editor.toolbar.select')}
            onClick={() => onToolChange('select')}
            className={`inline-flex h-full min-w-7 items-center justify-center rounded-control px-2 text-xs font-medium cursor-pointer ${
              tool === 'select'
                ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <IconPointer size={16} stroke={1.75} />
          </button>
          <button
            type="button"
            data-testid="toolbar-tool-move"
            aria-pressed={tool === 'translate'}
            title={`${t('editor.toolbar.move')} (G)`}
            onClick={() => onToolChange('translate')}
            className={`inline-flex h-full min-w-7 items-center justify-center rounded-control px-2 text-xs font-medium cursor-pointer ${
              tool === 'translate'
                ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <IconArrowsMove size={16} stroke={1.75} />
          </button>
          <button
            type="button"
            data-testid="toolbar-tool-rotate"
            aria-pressed={tool === 'rotate'}
            title={`${t('editor.toolbar.rotate')} (R)`}
            onClick={() => onToolChange('rotate')}
            className={`inline-flex h-full min-w-7 items-center justify-center rounded-control px-2 text-xs font-medium cursor-pointer ${
              tool === 'rotate'
                ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <IconRotate size={16} stroke={1.75} />
          </button>
          <button
            type="button"
            data-testid="toolbar-tool-scale"
            aria-pressed={tool === 'scale'}
            title={`${t('editor.toolbar.scale')} (S)`}
            onClick={() => onToolChange('scale')}
            className={`inline-flex h-full min-w-7 items-center justify-center rounded-control px-2 text-xs font-medium cursor-pointer ${
              tool === 'scale'
                ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <IconDimensions size={16} stroke={1.75} />
          </button>
          <button
            type="button"
            data-testid="toolbar-tool-measure"
            aria-pressed={tool === 'measure'}
            title={`${t('mesh.measure.title')} (M)`}
            onClick={() => onToolChange('measure')}
            className={`inline-flex h-full min-w-7 items-center justify-center rounded-control px-2 text-xs font-medium cursor-pointer ${
              tool === 'measure'
                ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <IconRuler size={16} stroke={1.75} />
          </button>
          <button
            type="button"
            data-testid="toolbar-tool-cut"
            aria-pressed={tool === 'cut'}
            title={`${t('cut.title')} (C)`}
            onClick={() => onToolChange('cut')}
            className={`inline-flex h-full min-w-7 items-center justify-center rounded-control px-2 text-xs font-medium cursor-pointer ${
              tool === 'cut'
                ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <IconScissors size={16} stroke={1.75} />
          </button>
          <button
            type="button"
            data-testid="toolbar-tool-hole"
            aria-pressed={tool === 'hole'}
            title={`${t('hole.title')} (H)`}
            onClick={() => onToolChange('hole')}
            className={`inline-flex h-full min-w-7 items-center justify-center rounded-control px-2 text-xs font-medium cursor-pointer ${
              tool === 'hole'
                ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <IconCircleDot size={16} stroke={1.75} />
          </button>
          <button
            type="button"
            data-testid="toolbar-tool-text"
            aria-pressed={tool === 'text'}
            title={`${t('text.title')} (T)`}
            onClick={() => onToolChange('text')}
            className={`inline-flex h-full min-w-7 items-center justify-center rounded-control px-2 text-xs font-medium cursor-pointer ${
              tool === 'text'
                ? 'bg-surface-3 text-text shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                : 'text-text-muted hover:text-text'
            }`}
          >
            <IconLetterT size={16} stroke={1.75} />
          </button>
        </div>

        {/* Selection mode: object, face, edge */}
        <div className="flex items-center gap-1.5">
          <SegmentedControl
            ariaLabel={t('editor.toolbar.selectionMode', 'Selection mode')}
            value={selectionMode}
            onChange={(m) => onSelectionModeChange?.(m)}
            size="sm"
            options={[
              { value: 'object', label: t('editor.mode.object', 'Object') },
              { value: 'face', label: t('editor.mode.face', 'Face') },
              { value: 'edge', label: t('editor.mode.edge', 'Edge') },
            ]}
          />
        </div>

        {/* Right section: Snap, Projection, Fit, Hotkeys */}
        <div className="flex items-center gap-1.5">
          {/* Snap toggle and step popover */}
          <div className="relative">
            <div className="inline-flex h-8 items-center rounded-control border border-border bg-bg overflow-hidden">
              <button
                type="button"
                data-testid="toolbar-snap-toggle"
                aria-pressed={snap}
                title={`${t('editor.toolbar.snap')}: ${snapStepMm} mm, ${snapStepDeg}°`}
                onClick={() => onSnapChange(!snap)}
                className={`inline-flex h-full items-center gap-1 px-2 cursor-pointer ${
                  snap ? 'bg-accent-muted text-white' : 'text-text-muted hover:text-text'
                }`}
              >
                <IconMagnet size={15} stroke={1.75} />
                <span className="font-mono text-[11px]">{snapStepMm}mm</span>
              </button>
              <button
                type="button"
                data-testid="toolbar-snap-menu-btn"
                aria-expanded={snapMenuOpen}
                onClick={() => setSnapMenuOpen(!snapMenuOpen)}
                className="h-full px-1 border-l border-border text-text-muted hover:text-text cursor-pointer"
              >
                <IconChevronDown size={12} />
              </button>
            </div>

            {snapMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setSnapMenuOpen(false)} />
                <div
                  data-testid="toolbar-snap-menu"
                  className="absolute right-0 top-full mt-1 z-40 min-w-32 rounded-card border border-border bg-surface-1 p-2 shadow-float space-y-1.5"
                >
                  <div className="text-[11px] font-semibold text-text-muted">{t('editor.toolbar.snap')}</div>
                  <div className="flex flex-col gap-1">
                    {[1, 5, 10, 20].map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => {
                          onSnapStepChange?.(step, snapStepDeg)
                          setSnapMenuOpen(false)
                        }}
                        className={`px-2 py-1 text-left rounded text-xs cursor-pointer ${
                          snapStepMm === step ? 'bg-surface-3 font-semibold text-text' : 'text-text-muted hover:text-text'
                        }`}
                      >
                        {step} mm
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Projection toggle: Persp / Ortho */}
          <button
            type="button"
            data-testid="toolbar-analysis-toggle"
            aria-pressed={analysisOpen}
            title={t('mesh.analysis.title')}
            onClick={onToggleAnalysis}
            className={`inline-flex h-8 items-center gap-1 px-2 rounded-control border border-border bg-bg cursor-pointer ${
              analysisOpen ? 'bg-accent-muted text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            <IconEyeCheck size={15} stroke={1.75} />
            <span className="text-[11px] font-medium hidden sm:inline">{t('mesh.analysis.title')}</span>
          </button>

          {/* Projection toggle: Persp / Ortho */}
          <button
            type="button"
            data-testid="toolbar-projection-toggle"
            title={projection === 'persp' ? t('editor.toolbar.perspective') : t('editor.toolbar.orthographic')}
            onClick={() => onProjectionChange(projection === 'persp' ? 'ortho' : 'persp')}
            className="inline-flex h-8 items-center gap-1 rounded-control border border-border bg-bg px-2.5 font-mono text-[11px] font-medium text-text-muted hover:text-text cursor-pointer"
          >
            {projection === 'persp' ? 'Persp' : 'Ortho'}
          </button>

          {/* Fit button */}
          <button
            type="button"
            data-testid="toolbar-fit-button"
            title={`${t('editor.toolbar.fit')} (F)`}
            onClick={onFit}
            className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-bg text-text-muted hover:text-text cursor-pointer"
          >
            <IconFocusCentered size={16} stroke={1.75} />
          </button>

          {/* Hotkeys popover button */}
          <div className="relative">
            <button
              type="button"
              data-testid="toolbar-hotkeys-button"
              aria-expanded={hotkeysOpen}
              title={t('editor.toolbar.hotkeys')}
              onClick={() => setHotkeysOpen(!hotkeysOpen)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-border bg-bg text-text-muted hover:text-text cursor-pointer"
            >
              <IconKeyboard size={16} stroke={1.75} />
            </button>

            {hotkeysOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setHotkeysOpen(false)} />
                <div
                  data-testid="toolbar-hotkeys-popover"
                  className="absolute right-0 top-full mt-1 z-40 w-64 rounded-card border border-border bg-surface-1 p-3 shadow-float text-xs"
                >
                  <h4 className="font-semibold text-text pb-2 border-b border-border">
                    {t('editor.toolbar.hotkeys')}
                  </h4>
                  <div className="space-y-1.5 pt-2 text-text-muted text-[11px]">
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">Del</kbd>
                      <span>{t('editor.outliner.delete')}</span>
                    </div>
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">Ctrl+D</kbd>
                      <span>{t('editor.outliner.duplicate')}</span>
                    </div>
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">G / R / S</kbd>
                      <span>Move / Rotate / Scale</span>
                    </div>
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">F</kbd>
                      <span>{t('editor.view.fitSelection')}</span>
                    </div>
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">Shift+F</kbd>
                      <span>{t('editor.view.fitAll')}</span>
                    </div>
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">1 / 3 / 7</kbd>
                      <span>Front / Right / Top</span>
                    </div>
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">5</kbd>
                      <span>Perspective / Ortho</span>
                    </div>
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">H / Alt+H</kbd>
                      <span>Hide / Show all</span>
                    </div>
                    <div className="flex justify-between">
                      <kbd className="font-mono bg-surface-2 px-1 rounded border border-border">D</kbd>
                      <span>{t('editor.properties.dropToBed')}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Unit choice modal dialog */}
      {pendingFiles && (
        <div
          data-testid="unit-choice-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-card border border-border-strong bg-surface-1 p-4 shadow-float space-y-4">
            <h3 className="font-semibold text-text text-sm">{t('editor.unitDialog.title')}</h3>
            <p className="text-xs text-text-muted">{t('editor.unitDialog.prompt')}</p>

            <div className="flex gap-2">
              <button
                type="button"
                data-testid="unit-choice-mm"
                onClick={() => setSelectedUnit('mm')}
                className={`flex-1 py-2 px-3 rounded border text-xs font-medium cursor-pointer ${
                  selectedUnit === 'mm'
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {t('editor.unitDialog.mm')}
              </button>
              <button
                type="button"
                data-testid="unit-choice-in"
                onClick={() => setSelectedUnit('in')}
                className={`flex-1 py-2 px-3 rounded border text-xs font-medium cursor-pointer ${
                  selectedUnit === 'in'
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {t('editor.unitDialog.in')}
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                data-testid="unit-choice-remember"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="rounded border-border"
              />
              <span>{t('editor.unitDialog.remember')}</span>
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                data-testid="unit-choice-cancel"
                onClick={handleCancelUnit}
                className="px-3 py-1.5 rounded bg-surface-2 hover:bg-surface-3 text-xs text-text border border-border cursor-pointer"
              >
                {t('common.reset')}
              </button>
              <button
                type="button"
                data-testid="unit-choice-confirm"
                onClick={handleConfirmUnit}
                className="px-3 py-1.5 rounded bg-accent hover:bg-accent-hover text-xs text-white font-medium cursor-pointer"
              >
                {t('editor.unitDialog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Drop zone helper that wraps viewport area to accept STL file drops with visible overlay.
 */
export function EditorDropZone({
  children,
  onDropFiles,
  onDropSvgFile,
}: {
  children: React.ReactNode
  onDropFiles: (files: File[]) => void
  onDropSvgFile?: (file: File) => void
}) {
  const { t } = useTranslation()
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    dragCounter.current = 0
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const allFiles = Array.from(e.dataTransfer.files)
      const svgFile = allFiles.find(
        (f) => f.name.toLowerCase().endsWith('.svg') || f.type.includes('svg')
      )
      const stlFiles = allFiles.filter(
        (f) => f.name.toLowerCase().endsWith('.stl') || f.type.includes('stl')
      )
      if (svgFile && onDropSvgFile) {
        onDropSvgFile(svgFile)
      }
      if (stlFiles.length > 0) {
        onDropFiles(stlFiles)
      }
    }
  }

  return (
    <div
      data-testid="editor-dropzone"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative flex-1 min-h-0 w-full h-full overflow-hidden"
    >
      {children}

      {isDragOver && (
        <div
          data-testid="editor-drop-hint"
          className="absolute inset-0 z-40 flex items-center justify-center bg-bg/80 backdrop-blur-xs border-2 border-dashed border-accent pointer-events-none"
        >
          <div className="flex flex-col items-center gap-2 text-accent">
            <IconUpload size={36} stroke={1.75} />
            <span className="font-semibold text-sm">{t('editor.toolbar.dropHint')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
