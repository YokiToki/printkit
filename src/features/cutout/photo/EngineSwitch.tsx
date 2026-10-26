import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import type { SegEngine } from './usePhotoTrace'

/** Выбор движка силуэтов: классический (по умолчанию, без загрузок) или нейросеть. */
export function EngineSwitch({ engine, onChange }: { engine: SegEngine; onChange: (e: SegEngine) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1 text-xs text-text-muted">{t('cutout.photo.ai.engine')}
      <SegmentedControl<SegEngine> fill ariaLabel={t('cutout.photo.ai.engine')} value={engine} onChange={onChange}
        options={[{ value: 'classic', label: t('cutout.photo.ai.classic') }, { value: 'ai', label: t('cutout.photo.ai.ai') }]} />
    </div>
  )
}
