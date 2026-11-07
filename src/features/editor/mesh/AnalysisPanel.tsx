import { useTranslation } from 'react-i18next'
import {
  IconEyeCheck,
  IconX,
} from '@tabler/icons-react'
import { Toggle } from '../../../ui/Toggle'
import { NumberField } from '../../../ui/NumberField'
import { LengthField } from '../../../ui/LengthField'
import { SegmentedControl } from '../../../ui/SegmentedControl'

export interface AnalysisSettings {
  overhangEnabled: boolean
  overhangThreshold: number // degrees, default 45
  thinWallEnabled: boolean
  thinWallThreshold: number // mm, default 0.8
  sectionEnabled: boolean
  sectionAxis: 'x' | 'y' | 'z'
  sectionOffset: number // mm
}

export interface AnalysisPanelProps {
  settings: AnalysisSettings
  onChange: (patch: Partial<AnalysisSettings>) => void
  onClose?: () => void
}

export function AnalysisPanel({
  settings,
  onChange,
  onClose,
}: AnalysisPanelProps) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="analysis-panel"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface-1 p-3 shadow-float text-xs max-w-xs w-full"
    >
      <div className="flex items-center justify-between pb-1 border-b border-border">
        <div className="flex items-center gap-1.5 font-semibold text-text">
          <IconEyeCheck size={16} className="text-accent" />
          <span>{t('mesh.analysis.title', 'Analysis')}</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text rounded cursor-pointer"
            aria-label={t('common.close', 'Close')}
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      {/* 1. Overhang Angle Map */}
      <div className="flex flex-col gap-1.5">
        <Toggle
          label={t('mesh.analysis.overhang', 'Overhang angle')}
          checked={settings.overhangEnabled}
          onChange={(checked) => onChange({ overhangEnabled: checked })}
        />
        {settings.overhangEnabled && (
          <div className="pl-2 pt-1 border-l-2 border-accent/40">
            <NumberField
              label={t('mesh.analysis.overhangThreshold', 'Overhang threshold')}
              value={settings.overhangThreshold}
              min={0}
              max={90}
              step={5}
              unit="°"
              onChange={(v) => onChange({ overhangThreshold: v })}
            />
          </div>
        )}
      </div>

      {/* 2. Thin Walls Map */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-border/50">
        <Toggle
          label={t('mesh.analysis.thinWall', 'Thin walls')}
          checked={settings.thinWallEnabled}
          onChange={(checked) => onChange({ thinWallEnabled: checked })}
        />
        {settings.thinWallEnabled && (
          <div className="pl-2 pt-1 border-l-2 border-accent/40">
            <LengthField
              label={t('mesh.analysis.thinWallThreshold', 'Thin wall threshold')}
              value={settings.thinWallThreshold}
              min={0.1}
              max={10}
              step={0.1}
              onChange={(v) => onChange({ thinWallThreshold: v })}
            />
          </div>
        )}
      </div>

      {/* 3. Section View */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-border/50">
        <Toggle
          label={t('mesh.analysis.section', 'Section view')}
          checked={settings.sectionEnabled}
          onChange={(checked) => onChange({ sectionEnabled: checked })}
        />
        {settings.sectionEnabled && (
          <div className="space-y-2 pl-2 pt-1 border-l-2 border-accent/40">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">{t('mesh.analysis.axis', 'Axis')}</span>
              <SegmentedControl
                ariaLabel={t('mesh.analysis.axis', 'Axis')}
                size="sm"
                options={[
                  { value: 'x', label: 'X' },
                  { value: 'y', label: 'Y' },
                  { value: 'z', label: 'Z' },
                ]}
                value={settings.sectionAxis}
                onChange={(axis) => onChange({ sectionAxis: axis as 'x' | 'y' | 'z' })}
              />
            </div>

            <LengthField
              label={t('mesh.analysis.offset', 'Offset')}
              value={settings.sectionOffset}
              min={-500}
              max={500}
              step={1}
              onChange={(offset) => onChange({ sectionOffset: offset })}
            />
          </div>
        )}
      </div>
    </div>
  )
}
