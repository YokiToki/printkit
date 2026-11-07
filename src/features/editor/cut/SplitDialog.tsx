import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { LengthField } from '../../../ui/LengthField'
import { Button } from '../../../ui/Button'
import { Toggle } from '../../../ui/Toggle'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import type { CutConnectorConfig } from '../../../geometry/cut/connectors'
import { autoCutsAxis } from '../../../geometry/cut/split'
import { ConnectorEditor } from './ConnectorEditor'
import { IconLayoutGrid, IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react'

export interface SplitDialogProps {
  objectBounds: { min: [number, number, number]; max: [number, number, number] }
  onApply: (params: {
    grid: { x: number[]; y: number[]; z: number[] }
    bed: { width: number; depth: number; margin: number }
    connector?: CutConnectorConfig
    explodeGap: number
  }) => void
  onCancel: () => void
}

const BED_PRESETS = [
  { id: 'bambu', name: 'Bambu Lab (256 × 256)', width: 256, depth: 256, margin: 5 },
  { id: 'prusa', name: 'Prusa MK4 (250 × 210)', width: 250, depth: 210, margin: 5 },
  { id: 'voron300', name: 'Voron 2.4 (300 × 300)', width: 300, depth: 300, margin: 5 },
  { id: 'custom', name: 'Custom', width: 256, depth: 256, margin: 5 },
]

export function SplitDialog({
  objectBounds,
  onApply,
  onCancel,
}: SplitDialogProps) {
  const { t } = useTranslation()

  const [selectedPreset, setSelectedPreset] = useState<string>('bambu')
  const [bedWidth, setBedWidth] = useState<number>(256)
  const [bedDepth, setBedDepth] = useState<number>(256)
  const [bedMargin, setBedMargin] = useState<number>(5)
  const [explodeGap, setExplodeGap] = useState<number>(10)
  const [enableConnectors, setEnableConnectors] = useState<boolean>(true)

  const [connectorConfig, setConnectorConfig] = useState<CutConnectorConfig>({
    kind: 'pegs',
    diameter: 4,
    depth: 6,
    clearance: 0.2,
    tolerance: 0.1,
    positions: [],
  })

  const spanX = Math.max(1, objectBounds.max[0] - objectBounds.min[0])
  const spanY = Math.max(1, objectBounds.max[1] - objectBounds.min[1])
  const usableBedX = Math.max(10, bedWidth - bedMargin * 2)
  const usableBedY = Math.max(10, bedDepth - bedMargin * 2)

  // Auto-calculated cuts
  const autoCutsX = useMemo(
    () => autoCutsAxis(objectBounds.min[0], objectBounds.max[0], usableBedX),
    [objectBounds.min[0], objectBounds.max[0], usableBedX]
  )
  const autoCutsY = useMemo(
    () => autoCutsAxis(objectBounds.min[1], objectBounds.max[1], usableBedY),
    [objectBounds.min[1], objectBounds.max[1], usableBedY]
  )

  const [cutsX, setCutsX] = useState<number[]>(autoCutsX)
  const [cutsY, setCutsY] = useState<number[]>(autoCutsY)

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId)
    const p = BED_PRESETS.find((b) => b.id === presetId)
    if (p) {
      setBedWidth(p.width)
      setBedDepth(p.depth)
      setBedMargin(p.margin)
    }
  }

  const handleCutChangeX = (idx: number, val: number) => {
    const updated = [...cutsX]
    updated[idx] = val
    setCutsX(updated)
  }

  const handleCutChangeY = (idx: number, val: number) => {
    const updated = [...cutsY]
    updated[idx] = val
    setCutsY(updated)
  }

  // Check oversize condition
  const numPartsX = cutsX.length + 1
  const numPartsY = cutsY.length + 1
  const isOversize = spanX > usableBedX * numPartsX || spanY > usableBedY * numPartsY

  const handleApply = () => {
    onApply({
      grid: {
        x: cutsX,
        y: cutsY,
        z: [],
      },
      bed: {
        width: bedWidth,
        depth: bedDepth,
        margin: bedMargin,
      },
      connector: enableConnectors ? connectorConfig : undefined,
      explodeGap,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="split-dialog">
      <div className="flex flex-col gap-4 bg-surface-1 border border-border rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <IconLayoutGrid size={20} className="text-primary" />
            <span>{t('cut.split.title')}</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text-primary"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Printer Preset */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-text-secondary">{t('cut.split.printerPreset')}</label>
          <div className="flex flex-wrap gap-2">
            {BED_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`text-xs px-3 py-1.5 rounded-md border ${
                  selectedPreset === p.id
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border bg-surface-2 text-text-secondary hover:bg-surface-3'
                }`}
                onClick={() => handlePresetChange(p.id)}
              >
                {p.id === 'custom' ? t('split.custom', 'Custom') : p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Bed dimensions */}
        <div className="grid grid-cols-3 gap-2">
          <LengthField
            label={t('cut.split.bedWidth')}
            value={bedWidth}
            onChange={setBedWidth}
            min={50}
            max={1000}
            step={5}
          />
          <LengthField
            label={t('cut.split.bedDepth')}
            value={bedDepth}
            onChange={setBedDepth}
            min={50}
            max={1000}
            step={5}
          />
          <LengthField
            label={t('cut.split.margin')}
            value={bedMargin}
            onChange={setBedMargin}
            min={0}
            max={50}
            step={1}
          />
        </div>

        {/* Oversize warning */}
        {isOversize && (
          <div className="flex items-center gap-2 p-2 bg-warn-bg text-warn-text border border-warn-border rounded-md text-xs" data-testid="split-oversize-warning">
            <IconAlertTriangle size={16} className="shrink-0" />
            <span>{t('cut.split.oversizeWarning')}</span>
          </div>
        )}

        {/* Cuts list */}
        <div className="flex flex-col gap-3 p-3 bg-surface-2 rounded-lg border border-border">
          <span className="text-xs font-semibold text-text-primary">
            {t('cut.split.cutsSummary', { count: cutsX.length + cutsY.length, parts: numPartsX * numPartsY })}
          </span>

          {cutsX.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-secondary">{t('cut.split.cutsX')}:</span>
              <div className="grid grid-cols-2 gap-2">
                {cutsX.map((cx, idx) => (
                  <LengthField
                    key={idx}
                    label={`X #${idx + 1}`}
                    value={cx}
                    onChange={(val) => handleCutChangeX(idx, val)}
                    min={-1000}
                    max={1000}
                    step={1}
                  />
                ))}
              </div>
            </div>
          )}

          {cutsY.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text-secondary">{t('cut.split.cutsY')}:</span>
              <div className="grid grid-cols-2 gap-2">
                {cutsY.map((cy, idx) => (
                  <LengthField
                    key={idx}
                    label={`Y #${idx + 1}`}
                    value={cy}
                    onChange={(val) => handleCutChangeY(idx, val)}
                    min={-1000}
                    max={1000}
                    step={1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Explode gap */}
        <div className="flex flex-col gap-1.5">
          <LengthField
            label={t('cut.split.explodeGap')}
            value={explodeGap}
            onChange={setExplodeGap}
            min={0}
            max={100}
            step={1}
          />
        </div>

        {/* Connectors */}
        <div className="flex flex-col gap-2">
          <Toggle
            label={t('cut.enableConnectors')}
            checked={enableConnectors}
            onChange={setEnableConnectors}
          />

          {enableConnectors && (
            <ConnectorEditor
              config={connectorConfig}
              onChange={setConnectorConfig}
            />
          )}
        </div>

        {/* Dialog Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button onClick={onCancel} data-testid="btn-split-cancel">
            <IconX size={16} className="mr-1" />
            {t('common.cancel')}
          </Button>
          <Button primary onClick={handleApply} data-testid="btn-split-apply">
            <IconCheck size={16} className="mr-1" />
            {t('cut.split.apply')}
          </Button>
        </div>
      </div>
    </div>
  )
}
