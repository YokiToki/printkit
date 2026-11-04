import { useState, useEffect, useRef, useId, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconUpload, IconFileCode, IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '../../../ui/Button'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { Banner } from '../../../ui/Banner'
import { parseSvg, type SvgParseResult } from '../../../geometry/svg'
import type { Sketch, PlaneDefinition, BasePlane } from '../../../editor/sketch/model'

export interface SvgImportDialogProps {
  initialFile?: File | null
  initialSvgText?: string | null
  activeSketch?: Sketch | null
  onImport: (
    sketch: Sketch,
    isNew: boolean,
    meta: { name: string; size: number; curves: number }
  ) => void
  onClose: () => void
}

export function SvgImportDialog({
  initialFile,
  initialSvgText,
  activeSketch,
  onImport,
  onClose,
}: SvgImportDialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string>(initialFile?.name ?? 'drawing.svg')
  const [fileSize, setFileSize] = useState<number>(initialFile?.size ?? (initialSvgText?.length ?? 0))
  const [svgContent, setSvgContent] = useState<string>(initialSvgText ?? '')
  const [targetMode, setTargetMode] = useState<'active' | 'new'>(activeSketch ? 'active' : 'new')
  const [basePlane, setBasePlane] = useState<BasePlane>('XY')
  const [planeOffset, setPlaneOffset] = useState<number>(0)
  const [scaleMode, setScaleMode] = useState<'fitWidth' | 'dpi'>('fitWidth')
  const [fitWidthMm, setFitWidthMm] = useState<number>(60)
  const [dpi, setDpi] = useState<number>(96)

  const [parseResult, setParseResult] = useState<SvgParseResult | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  // Load initial file if provided
  useEffect(() => {
    if (initialFile && !svgContent) {
      const reader = new FileReader()
      reader.onload = () => {
        const text = reader.result as string
        setSvgContent(text)
        setFileName(initialFile.name)
        setFileSize(initialFile.size)
      }
      reader.readAsText(initialFile)
    }
  }, [initialFile, svgContent])

  // Parse SVG whenever parameters change
  useEffect(() => {
    if (!svgContent) {
      setParseResult(null)
      setErrorKey(null)
      return
    }

    try {
      const plane: PlaneDefinition = { base: basePlane, offset: planeOffset }
      const res = parseSvg(svgContent, {
        existingSketch: targetMode === 'active' && activeSketch ? activeSketch : undefined,
        plane,
        scaleMode,
        fitWidthMm: scaleMode === 'fitWidth' ? fitWidthMm : undefined,
        dpi: scaleMode === 'dpi' ? dpi : undefined,
        sketchName: fileName.replace(/\.svg$/i, ''),
      })
      setParseResult(res)
      setErrorKey(null)
    } catch (err: unknown) {
      setParseResult(null)
      if (err instanceof Error) {
        setErrorKey(err.message)
      } else {
        setErrorKey('sketch.error.invalidSvg')
      }
    }
  }, [svgContent, targetMode, activeSketch, basePlane, planeOffset, scaleMode, fitWidthMm, dpi, fileName])

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setFileSize(file.size)
    const reader = new FileReader()
    reader.onload = () => {
      setSvgContent(reader.result as string)
    }
    reader.readAsText(file)
  }

  const handleConfirm = () => {
    if (!parseResult) return
    onImport(parseResult.sketch, targetMode === 'new', {
      name: fileName,
      size: fileSize,
      curves: parseResult.segmentCount,
    })
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overscroll-contain"
      data-testid="svg-import-dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-md flex-col gap-4 rounded-card border border-border-strong bg-surface-1 p-5 shadow-float overscroll-contain text-text"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 id={titleId} className="m-0 text-base font-semibold">
            {t('editor.sketch.importSvgTitle')}
          </h2>
        </div>

        {/* File chooser */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-text-muted">{t('editor.sketch.svgFile')}</span>
          <div className="flex items-center justify-between gap-2 rounded-control border border-border bg-surface-2 p-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <IconFileCode size={20} className="shrink-0 text-accent" />
              <div className="flex flex-col min-w-0">
                <span className="truncate text-xs font-medium">{fileName}</span>
                <span className="text-[11px] text-text-muted">
                  {(fileSize / 1024).toFixed(1)} KB
                  {parseResult ? ` · ${parseResult.segmentCount} ${t('editor.sketch.svgSegments')}` : ''}
                </span>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg"
              data-testid="svg-file-input"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              data-testid="svg-choose-file-btn"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-7 items-center gap-1 rounded-control border border-border-strong bg-surface-3 px-2 text-xs font-medium hover:bg-surface-2 cursor-pointer shrink-0"
            >
              <IconUpload size={14} />
              <span>{t('editor.sketch.chooseFile')}</span>
            </button>
          </div>
        </div>

        {/* Target Sketch */}
        {activeSketch && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-muted">{t('editor.sketch.svgTarget')}</span>
            <SegmentedControl
              ariaLabel={t('editor.sketch.svgTarget')}
              value={targetMode}
              onChange={setTargetMode}
              fill
              options={[
                { value: 'active', label: `${t('editor.sketch.svgTargetActive')} (${activeSketch.name})` },
                { value: 'new', label: t('editor.sketch.svgTargetNew') },
              ]}
            />
          </div>
        )}

        {/* Plane options when new sketch */}
        {targetMode === 'new' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-text-muted">{t('editor.sketch.svgPlane')}</span>
              <SegmentedControl
                ariaLabel={t('editor.sketch.svgPlane')}
                value={basePlane}
                onChange={setBasePlane}
                fill
                options={[
                  { value: 'XY', label: 'XY' },
                  { value: 'XZ', label: 'XZ' },
                  { value: 'YZ', label: 'YZ' },
                ]}
              />
            </div>
            <div>
              <LengthField
                label={t('sketch.planeOffset')}
                value={planeOffset}
                onChange={setPlaneOffset}
                min={-1000}
                max={1000}
                step={1}
              />
            </div>
          </div>
        )}

        {/* Scaling options */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-text-muted">{t('editor.sketch.svgScale')}</span>
          <SegmentedControl
            ariaLabel={t('editor.sketch.svgScale')}
            value={scaleMode}
            onChange={setScaleMode}
            fill
            options={[
              { value: 'fitWidth', label: t('editor.sketch.svgScaleFitWidth') },
              { value: 'dpi', label: t('editor.sketch.svgScaleDpi') },
            ]}
          />
          {scaleMode === 'fitWidth' ? (
            <LengthField
              label={t('editor.sketch.svgFitWidth')}
              value={fitWidthMm}
              onChange={setFitWidthMm}
              min={1}
              max={1000}
              step={5}
            />
          ) : (
            <NumberField
              label={t('editor.sketch.svgDpi')}
              value={dpi}
              onChange={setDpi}
              min={10}
              max={1200}
              step={1}
            />
          )}
        </div>

        {/* Notices and warnings */}
        {parseResult && parseResult.notices.length > 0 && (
          <Banner kind="warn">
            {t('sketch.notice.unsupportedSvgElement', {
              tags: parseResult.notices.join(', '),
            })}
          </Banner>
        )}

        {errorKey && (
          <Banner kind="error">
            {t(errorKey)}
          </Banner>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            data-testid="svg-cancel-btn"
            onClick={onClose}
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface-2 px-3.5 font-medium text-text hover:bg-surface-3"
          >
            {t('confirm.cancel')}
          </button>
          <Button
            primary
            data-testid="svg-confirm-btn"
            disabled={!parseResult || !!errorKey || parseResult.segmentCount === 0}
            onClick={handleConfirm}
          >
            {t('editor.sketch.svgImportAction')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
