import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { Toggle } from '../../../ui/Toggle'
import { Button } from '../../../ui/Button'
import type { HoleKind, HoleParams } from '../../../geometry/features/ops/hole'
import {
  METRIC_THREADS,
  SCREW_CLEARANCE,
  DIN912_HEADS,
  ISO7380_HEADS,
  COUNTERSINK_90,
  HEAT_INSERTS,
  MAGNET_PRESETS,
  type MetricThread,
  type ClearanceFit,
} from '../../../geometry/holeSpec'
import { IconCircleDot, IconCheck, IconX } from '@tabler/icons-react'

export interface HoleToolPanelProps {
  initialPoint?: [number, number, number]
  initialNormal?: [number, number, number]
  initialUp?: [number, number, number]
  onApply: (params: HoleParams) => void
  onCancel: () => void
}

export function HoleToolPanel({
  initialPoint = [0, 0, 0],
  initialNormal = [0, 0, 1],
  initialUp,
  onApply,
  onCancel,
}: HoleToolPanelProps) {
  const { t } = useTranslation()

  const [kind, setKind] = useState<HoleKind>('counterbore')
  const [thread, setThread] = useState<MetricThread>('M3')
  const [fit, setFit] = useState<ClearanceFit>('normal')
  const [headType, setHeadType] = useState<'din912' | 'iso7380'>('din912')
  const [diameter, setDiameter] = useState<number>(3.4)
  const [depth, setDepth] = useState<number>(10)
  const [through, setThrough] = useState<boolean>(false)
  const [cbDiameter, setCbDiameter] = useState<number>(6.5)
  const [cbDepth, setCbDepth] = useState<number>(3.5)
  const [csDiameter, setCsDiameter] = useState<number>(6.5)
  const [csAngle, setCsAngle] = useState<number>(90)
  const [offsetU, setOffsetU] = useState<number>(0)
  const [offsetV, setOffsetV] = useState<number>(0)

  const kindOptions = [
    { value: 'simple', label: t('hole.kind.simple') },
    { value: 'counterbore', label: t('hole.kind.counterbore') },
    { value: 'countersink', label: t('hole.kind.countersink') },
    { value: 'insert', label: t('hole.kind.insert') },
    { value: 'magnet', label: t('hole.kind.magnet') },
  ]

  const handleThreadChange = (th: MetricThread) => {
    setThread(th)
    const clr = SCREW_CLEARANCE[th][fit]
    setDiameter(clr)

    if (kind === 'counterbore') {
      const heads = headType === 'din912' ? DIN912_HEADS : ISO7380_HEADS
      setCbDiameter(heads[th].cbDiameter)
      setCbDepth(heads[th].cbDepth)
    } else if (kind === 'countersink') {
      setCsDiameter(COUNTERSINK_90[th].csDiameter)
      setCsAngle(COUNTERSINK_90[th].angleDegrees)
    } else if (kind === 'insert') {
      const ins = HEAT_INSERTS[th]
      setDiameter(ins.holeDiameter)
      setDepth(ins.holeDepth)
    }
  }

  const handleHeadTypeChange = (nextHeadType: 'din912' | 'iso7380') => {
    setHeadType(nextHeadType)
    const heads = nextHeadType === 'din912' ? DIN912_HEADS : ISO7380_HEADS
    if (heads[thread]) {
      setCbDiameter(heads[thread].cbDiameter)
      setCbDepth(heads[thread].cbDepth)
    }
  }

  const handleMagnetPreset = (name: string) => {
    const mag = MAGNET_PRESETS.find((m) => m.name === name || m.id === name)
    if (mag) {
      setDiameter(mag.pocketDiameter)
      setDepth(mag.pocketDepth)
    }
  }

  const handleApply = () => {
    // Apply (offsetU, offsetV) along face plane tangent axes
    const p: [number, number, number] = [
      initialPoint[0] + offsetU,
      initialPoint[1] + offsetV,
      initialPoint[2],
    ]

    onApply({
      point: p,
      normal: initialNormal,
      up: initialUp,
      kind,
      diameter,
      depth: through ? undefined : depth,
      through,
      cbDiameter: kind === 'counterbore' ? cbDiameter : undefined,
      cbDepth: kind === 'counterbore' ? cbDepth : undefined,
      csDiameter: kind === 'countersink' ? csDiameter : undefined,
      csAngle: kind === 'countersink' ? csAngle : undefined,
      preset: `${thread} ${kind}`,
      fit,
      headType,
    })
  }

  return (
    <div className="flex flex-col gap-3.5 p-4 bg-surface-1 rounded-lg border border-border w-80 shadow-md" data-testid="hole-tool-panel">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <IconCircleDot size={18} className="text-primary" />
        <span>{t('hole.title')}</span>
      </div>

      {/* Kind selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t('hole.type')}</label>
        <SegmentedControl
          ariaLabel={t('hole.title')}
          value={kind}
          options={kindOptions}
          onChange={(val) => setKind(val as HoleKind)}
        />
      </div>

      {/* Presets */}
      {kind !== 'magnet' ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-secondary">{t('hole.thread')}</label>
          <div className="flex gap-1">
            {METRIC_THREADS.map((th) => (
              <button
                key={th}
                type="button"
                className={`text-xs px-2 py-1 rounded border flex-1 ${
                  thread === th
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-surface-2 text-text-secondary hover:bg-surface-3'
                }`}
                onClick={() => handleThreadChange(th)}
              >
                {th}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-secondary">{t('hole.magnetPreset')}</label>
          <div className="flex flex-wrap gap-1">
            {MAGNET_PRESETS.map((m) => (
              <button
                key={m.name}
                type="button"
                className="text-xs px-2 py-0.5 rounded bg-surface-2 hover:bg-surface-3 border border-border text-text-secondary"
                onClick={() => handleMagnetPreset(m.name)}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fit & Head type for counterbore */}
      {kind === 'counterbore' && (
        <div className="flex gap-2">
          <button
            type="button"
            className={`text-xs px-2.5 py-1 rounded border flex-1 ${
              headType === 'din912'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-surface-2 text-text-secondary'
            }`}
            onClick={() => handleHeadTypeChange('din912')}
          >
            DIN 912
          </button>
          <button
            type="button"
            className={`text-xs px-2.5 py-1 rounded border flex-1 ${
              headType === 'iso7380'
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-border bg-surface-2 text-text-secondary'
            }`}
            onClick={() => handleHeadTypeChange('iso7380')}
          >
            ISO 7380
          </button>
        </div>
      )}

      {/* Primary fields */}
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          label={t('hole.diameter')}
          value={diameter}
          onChange={setDiameter}
          min={0.5}
          max={50}
          step={0.1}
        />
        {!through && (
          <LengthField
            label={t('hole.depth')}
            value={depth}
            onChange={setDepth}
            min={0.5}
            max={200}
            step={0.5}
          />
        )}
      </div>

      <Toggle label={t('hole.through')} checked={through} onChange={setThrough} />

      {/* Counterbore details */}
      {kind === 'counterbore' && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <LengthField
            label={t('hole.cbDiameter')}
            value={cbDiameter}
            onChange={setCbDiameter}
            min={1}
            max={60}
            step={0.1}
          />
          <LengthField
            label={t('hole.cbDepth')}
            value={cbDepth}
            onChange={setCbDepth}
            min={0.5}
            max={50}
            step={0.1}
          />
        </div>
      )}

      {/* Countersink details */}
      {kind === 'countersink' && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <LengthField
            label={t('hole.csDiameter')}
            value={csDiameter}
            onChange={setCsDiameter}
            min={1}
            max={60}
            step={0.1}
          />
          <NumberField
            label={t('hole.csAngle')}
            value={csAngle}
            onChange={setCsAngle}
            min={60}
            max={120}
            step={5}
          />
        </div>
      )}

      {/* Face plane offset fields */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-border">
        <label className="text-xs text-text-secondary">{t('hole.offsets')}</label>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            label="ΔU"
            value={offsetU}
            onChange={setOffsetU}
            min={-1000}
            max={1000}
            step={0.5}
          />
          <LengthField
            label="ΔV"
            value={offsetV}
            onChange={setOffsetV}
            min={-1000}
            max={1000}
            step={0.5}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button onClick={onCancel} data-testid="btn-hole-cancel">
          <IconX size={16} className="mr-1" />
          {t('common.cancel')}
        </Button>
        <Button primary onClick={handleApply} data-testid="btn-hole-apply">
          <IconCheck size={16} className="mr-1" />
          {t('hole.apply')}
        </Button>
      </div>
    </div>
  )
}
