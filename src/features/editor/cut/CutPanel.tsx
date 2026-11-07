import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { Button } from '../../../ui/Button'
import { Toggle } from '../../../ui/Toggle'
import type { PlaneDefinition } from '../../../geometry/cut/plane'
import type { CutConnectorConfig } from '../../../geometry/cut/connectors'
import { ConnectorEditor } from './ConnectorEditor'
import type { Polygon } from '../../../geometry/cut/place'
import { IconScissors, IconCheck, IconX } from '@tabler/icons-react'

export type PlaneSourceMode = 'axis' | 'face' | 'threePoints'
export type CutOperationMode = 'both' | 'keepNegative' | 'keepPositive' | 'slice'

export interface CutPanelProps {
  initialPosition?: number
  onApply: (params: {
    plane: PlaneDefinition
    mode: CutOperationMode
    sliceCount?: number
    connector?: CutConnectorConfig
  }) => void
  onCancel: () => void
  sectionPolygons?: Polygon[]
  pickedFace?: { normal: [number, number, number]; origin: [number, number, number] }
}

export function CutPanel({
  initialPosition = 0,
  onApply,
  onCancel,
  sectionPolygons = [],
  pickedFace,
}: CutPanelProps) {
  const { t } = useTranslation()

  const [planeMode, setPlaneMode] = useState<PlaneSourceMode>(pickedFace ? 'face' : 'axis')
  const [axis, setAxis] = useState<'x' | 'y' | 'z'>('z')
  const [position, setPosition] = useState<number>(initialPosition)
  const [cutMode, setCutMode] = useState<CutOperationMode>('both')
  const [sliceCount, setSliceCount] = useState<number>(3)
  const [enableConnectors, setEnableConnectors] = useState<boolean>(false)

  const [connectorConfig, setConnectorConfig] = useState<CutConnectorConfig>({
    kind: 'pegs',
    diameter: 4,
    depth: 6,
    clearance: 0.2,
    tolerance: 0.1,
    positions: [],
  })

  // Derive current plane definition
  const planeDef: PlaneDefinition = useMemo(() => {
    if (planeMode === 'face' && pickedFace) {
      return {
        kind: 'face',
        normal: pickedFace.normal,
        origin: [
          pickedFace.origin[0] + pickedFace.normal[0] * position,
          pickedFace.origin[1] + pickedFace.normal[1] * position,
          pickedFace.origin[2] + pickedFace.normal[2] * position,
        ],
      }
    }
    return {
      kind: 'axis',
      axis,
      position,
    }
  }, [planeMode, axis, position, pickedFace])

  const planeModeOptions = [
    { value: 'axis', label: t('cut.plane.axis') },
    { value: 'face', label: t('cut.plane.face') },
    { value: 'threePoints', label: t('cut.plane.threePoints') },
  ]

  const cutModeOptions = [
    { value: 'both', label: t('cut.mode.both') },
    { value: 'keepNegative', label: t('cut.mode.keepBelow') },
    { value: 'keepPositive', label: t('cut.mode.keepAbove') },
    { value: 'slice', label: t('cut.mode.slice') },
  ]

  const axisOptions = [
    { value: 'x', label: 'X' },
    { value: 'y', label: 'Y' },
    { value: 'z', label: 'Z' },
  ]

  const handleApply = () => {
    onApply({
      plane: planeDef,
      mode: cutMode,
      sliceCount: cutMode === 'slice' ? sliceCount : undefined,
      connector: enableConnectors ? connectorConfig : undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-surface-1 rounded-lg border border-border w-80 shadow-md" data-testid="cut-panel">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <IconScissors size={18} className="text-primary" />
        <span>{t('cut.title')}</span>
      </div>

      {/* Plane mode */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">{t('cut.planeDefinition')}</label>
        <SegmentedControl
          ariaLabel={t('cut.planeDefinition')}
          value={planeMode}
          options={planeModeOptions}
          onChange={(val) => setPlaneMode(val as PlaneSourceMode)}
        />
      </div>

      {planeMode === 'axis' && (
        <div className="flex flex-col gap-2">
          <SegmentedControl
            ariaLabel="Axis"
            value={axis}
            options={axisOptions}
            onChange={(val) => setAxis(val as 'x' | 'y' | 'z')}
          />
          <LengthField
            label={t('cut.position')}
            value={position}
            onChange={setPosition}
            min={-1000}
            max={1000}
            step={1}
          />
        </div>
      )}

      {planeMode === 'face' && (
        <div className="flex flex-col gap-2">
          {pickedFace ? (
            <span className="text-xs text-success">{t('cut.facePicked')}</span>
          ) : (
            <span className="text-xs text-text-muted">{t('cut.pickFaceHint')}</span>
          )}
          <LengthField
            label={t('cut.offset')}
            value={position}
            onChange={setPosition}
            min={-1000}
            max={1000}
            step={0.5}
          />
        </div>
      )}

      {planeMode === 'threePoints' && (
        <div className="text-xs text-text-muted p-2 bg-surface-2 rounded border border-border">
          {t('cut.threePointsHint')}
        </div>
      )}

      {/* Cut operation mode */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-text-secondary">{t('cut.modeLabel')}</label>
        <SegmentedControl
          ariaLabel={t('cut.modeLabel')}
          value={cutMode}
          options={cutModeOptions}
          onChange={(val) => setCutMode(val as CutOperationMode)}
        />
      </div>

      {cutMode === 'slice' && (
        <NumberField
          label={t('cut.sliceCount')}
          value={sliceCount}
          onChange={(n) => setSliceCount(Math.max(2, Math.round(n)))}
          min={2}
          max={20}
          step={1}
        />
      )}

      {/* Connectors option (only applicable for 'both' mode) */}
      {cutMode === 'both' && (
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
              polygons={sectionPolygons}
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button onClick={onCancel} data-testid="btn-cut-cancel">
          <IconX size={16} className="mr-1" />
          {t('common.cancel')}
        </Button>
        <Button primary onClick={handleApply} data-testid="btn-cut-apply">
          <IconCheck size={16} className="mr-1" />
          {t('cut.apply')}
        </Button>
      </div>
    </div>
  )
}
