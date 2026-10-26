import { useTranslation } from 'react-i18next'
import { defaultOutline, type OutlineParams } from '../../geometry/imageOutline'
import { Button } from '../../ui/Button'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'

/**
 * Контур силуэта: гладкость (мм) и свёрнутая группа «Дополнительно» с углом острия и шагом вершин. Один компонент: его же берёт
 * окно «Из фото» в следующем изменении. Значения по умолчанию возвращает «Сбросить контур».
 */
export function OutlineControls({ value, onChange }: { value: OutlineParams; onChange: (p: Partial<OutlineParams>) => void }) {
  const { t } = useTranslation()
  const changed = value.smooth !== defaultOutline.smooth || value.cornerDeg !== defaultOutline.cornerDeg || value.step !== defaultOutline.step
  return (
    <div className="flex flex-col gap-2" data-testid="outline-controls">
      <LengthField label={t('keychain.outline.smooth')} value={value.smooth} min={0} max={3} step={0.05} onChange={(v) => onChange({ smooth: v })} />
      <p className="m-0 text-[11px] leading-snug text-text-subtle">{t('keychain.outline.smoothHint')}</p>
      <details className="rounded-control border border-border px-2 py-1.5">
        <summary className="cursor-pointer text-xs text-text-muted">{t('keychain.outline.advanced')}</summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField label={t('keychain.outline.corner')} value={value.cornerDeg} min={10} max={170} step={5} digits={0} unit="°" onChange={(v) => onChange({ cornerDeg: v })} />
          <LengthField label={t('keychain.outline.step')} value={value.step} min={0.1} max={5} step={0.1} onChange={(v) => onChange({ step: v })} />
        </div>
      </details>
      <div><Button onClick={() => onChange({ ...defaultOutline })} disabled={!changed}>{t('keychain.outline.reset')}</Button></div>
    </div>
  )
}
