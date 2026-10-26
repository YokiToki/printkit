import { useTranslation } from 'react-i18next'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { NumberField } from '../../ui/NumberField'
import { Toggle } from '../../ui/Toggle'
import { AUTO_OPEN_AI, defaultAiSilhouette, type AiSilhouetteParams, type SilhouetteParams } from '../../geometry/keychain'
import { modelById } from '../../ml/models'
import { AiStatus } from '../cutout/photo/AiStatus'
import { MaskTuning, type MaskValues } from '../cutout/photo/MaskTuning'
import { openModelManager } from '../ml/managerState'
import type { MatteControl } from './matte'

/**
 * Блок «ИИ» секции «Силуэт»: рабочая модель, «Убрать фон» (выключена без готовой модели, с подсказкой и ссылкой на менеджер,
 * включается сама после загрузки), состояние запуска, настройка маски (охват края и гладкость контура, значения модели по
 * умолчанию, серый просмотр альфы), «Оставить крупнейший объект», порог автоматических областей. Макета нет: собран из ui/.
 */
export function AiSilhouette({ control, value: s, imageSize, onChange }: {
  control: MatteControl
  value: SilhouetteParams
  imageSize: { width: number; height: number }
  onChange: (p: Partial<SilhouetteParams>) => void
}) {
  const { t } = useTranslation()
  const ai = s.ai
  const patchAi = (p: Partial<AiSilhouetteParams>) => onChange({ ai: { ...ai, ...p } })
  // значения по умолчанию — у модели, которой получена альфа (или у рабочей, пока альфы нет)
  const defaults = (modelById(ai.model) ?? control.model)?.maskDefaults ?? defaultAiSilhouette
  const tuned: MaskValues = { threshold: ai.threshold === defaults.threshold ? null : ai.threshold, smooth: ai.smooth === defaults.smooth ? null : ai.smooth }
  const onTune = (p: Partial<MaskValues>) => patchAi({
    ...(p.threshold !== undefined ? { threshold: p.threshold ?? defaults.threshold } : {}),
    ...(p.smooth !== undefined ? { smooth: p.smooth ?? defaults.smooth } : {}),
  })
  const errorKey = control.error ? (['noModel', 'unavailable', 'noColour'].includes(control.error) ? control.error : 'failed') : null
  const matteModel = modelById(ai.model)
  const other = !!control.matte && !!control.model && ai.model !== control.model.id
  const tuning = modelById(ai.model) ?? control.model
  return (
    <div className="flex flex-col gap-2" data-testid="ai-silhouette">
      <div className="flex flex-wrap items-center gap-2">
        <Button primary onClick={() => void control.run()} disabled={!control.model || control.running}>{control.matte ? t('keychain.ai.removeAgain') : t('keychain.ai.remove')}</Button>
        <button type="button" onClick={openModelManager} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent-text underline">{t('cutout.photo.ai.models')}</button>
      </div>
      {!control.model && <p className="m-0 text-xs text-text-muted" data-testid="ai-hint">{t('cutout.photo.ai.needModel')}</p>}
      {control.model && <p className="m-0 text-xs text-text-subtle">{t('cutout.photo.ai.using', { name: control.model.name })}</p>}
      <p className="m-0 text-xs text-text-subtle">{t('keychain.ai.run')}</p>
      <AiStatus />
      {errorKey && <Banner kind="error">{t(`keychain.ai.error.${errorKey}`)}</Banner>}
      {control.lost && <Banner kind="warn">{t('keychain.ai.lost')}</Banner>}
      {!control.matte && !control.lost && <p className="m-0 text-xs text-text-subtle" data-testid="ai-none">{t('keychain.ai.matteNone')}</p>}
      {other && matteModel && <p className="m-0 text-xs text-text-subtle" data-testid="matte-from">{t('keychain.ai.matteFrom', { model: matteModel.name })}</p>}
      {tuning && <MaskTuning model={tuning} ai={tuned} onChange={onTune} alpha={control.matte?.data ?? null} size={control.matte ? imageSize : null} active={null} baseline={null} />}
      <Toggle label={t('keychain.ai.keepLargest')} checked={ai.keepLargest} onChange={(v) => patchAi({ keepLargest: v })} />
      <NumberField label={t('keychain.ai.autoOpen')} value={s.autoOpen ?? AUTO_OPEN_AI} min={0} max={100000} step={10} digits={0} unit="mm²" onChange={(v) => onChange({ autoOpen: v })} />
      <p className="m-0 text-[11px] leading-snug text-text-subtle">{t('keychain.ai.autoOpenHint')}</p>
    </div>
  )
}
