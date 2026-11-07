import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { Button } from '../../../ui/Button'
import type { TextOpMode, TextOpParams } from '../../../geometry/features/ops/text'
import { IconTypography, IconCheck, IconX } from '@tabler/icons-react'

export interface TextToolPanelProps {
  initialPoint?: [number, number, number]
  initialNormal?: [number, number, number]
  initialUp?: [number, number, number]
  onApply: (params: TextOpParams) => void
  onCancel: () => void
}

const FONT_OPTIONS = [
  { id: 'roboto', name: 'Roboto' },
  { id: 'comfortaa', name: 'Comfortaa' },
  { id: 'russo-one', name: 'Russo One' },
  { id: 'fira-sans', name: 'Fira Sans' },
  { id: 'fira-code', name: 'Fira Code' },
  { id: 'merriweather', name: 'Merriweather' },
  { id: 'montserrat', name: 'Montserrat' },
]

export function TextToolPanel({
  initialPoint = [0, 0, 0],
  initialNormal = [0, 0, 1],
  initialUp,
  onApply,
  onCancel,
}: TextToolPanelProps) {
  const { t } = useTranslation()

  const [text, setText] = useState<string>('PrintKit')
  const [font, setFont] = useState<string>('roboto')
  const [size, setSize] = useState<number>(8)
  const [spacing, setSpacing] = useState<number>(0)
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center')
  const [mode, setMode] = useState<TextOpMode>('emboss')
  const [height, setHeight] = useState<number>(0.8)
  const [depth, setDepth] = useState<number>(0.5)
  const [rotation, setRotation] = useState<number>(0)

  const modeOptions = [
    { value: 'emboss', label: t('text.mode.emboss') },
    { value: 'engrave', label: t('text.mode.engrave') },
  ]

  const alignOptions = [
    { value: 'left', label: t('text.align.left') },
    { value: 'center', label: t('text.align.center') },
    { value: 'right', label: t('text.align.right') },
  ]

  const handleApply = () => {
    onApply({
      point: initialPoint,
      normal: initialNormal,
      up: initialUp,
      text,
      font,
      size,
      spacing,
      align,
      mode,
      height: mode === 'emboss' ? height : undefined,
      depth: mode === 'engrave' ? depth : undefined,
      rotation,
    })
  }

  return (
    <div className="flex flex-col gap-3.5 p-4 bg-surface-1 rounded-lg border border-border w-80 shadow-md" data-testid="text-tool-panel">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <IconTypography size={18} className="text-primary" />
        <span>{t('text.title')}</span>
      </div>

      {/* Text input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t('text.content')}</label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="px-2.5 py-1.5 text-sm rounded bg-surface-2 border border-border text-text-primary focus:border-primary focus:outline-none"
          placeholder={t('text.placeholder', 'Text...')}
          data-testid="input-text-content"
        />
      </div>

      {/* Font selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t('text.font')}</label>
        <select
          value={font}
          onChange={(e) => setFont(e.target.value)}
          className="px-2.5 py-1.5 text-xs rounded bg-surface-2 border border-border text-text-primary focus:border-primary focus:outline-none"
          data-testid="select-text-font"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {/* Mode */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t('text.modeLabel')}</label>
        <SegmentedControl
          ariaLabel={t('text.modeLabel')}
          value={mode}
          options={modeOptions}
          onChange={(val) => setMode(val as TextOpMode)}
        />
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          label={t('text.size')}
          value={size}
          onChange={setSize}
          min={1}
          max={100}
          step={0.5}
        />
        {mode === 'emboss' ? (
          <LengthField
            label={t('text.height')}
            value={height}
            onChange={setHeight}
            min={0.1}
            max={20}
            step={0.1}
          />
        ) : (
          <LengthField
            label={t('text.depth')}
            value={depth}
            onChange={setDepth}
            min={0.1}
            max={20}
            step={0.1}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LengthField
          label={t('text.spacing')}
          value={spacing}
          onChange={setSpacing}
          min={-5}
          max={20}
          step={0.2}
        />
        <NumberField
          label={t('text.rotation')}
          value={rotation}
          onChange={setRotation}
          min={-180}
          max={180}
          step={15}
        />
      </div>

      {/* Alignment */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t('text.alignLabel')}</label>
        <SegmentedControl
          ariaLabel={t('text.alignLabel')}
          value={align}
          options={alignOptions}
          onChange={(val) => setAlign(val as 'left' | 'center' | 'right')}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button onClick={onCancel} data-testid="btn-text-cancel">
          <IconX size={16} className="mr-1" />
          {t('common.cancel')}
        </Button>
        <Button primary onClick={handleApply} data-testid="btn-text-apply">
          <IconCheck size={16} className="mr-1" />
          {t('text.apply')}
        </Button>
      </div>
    </div>
  )
}
