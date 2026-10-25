import { useTranslation } from 'react-i18next'
import { openModelManager } from '../../ml/managerState'
import { Banner } from '../../../ui/Banner'
import { Button } from '../../../ui/Button'
import { AiStatus } from './AiStatus'
import { MaskTuning } from './MaskTuning'
import type { PhotoTrace } from './usePhotoTrace'

/**
 * Блок ИИ на шаге силуэтов: рабочая модель, кнопка запуска (выключена, пока нет готовой модели, с подсказкой и ссылкой на менеджер;
 * включается сама, когда загрузка закончилась), второй проход, состояние, настройка маски и сообщение об ошибке.
 */
export function AiControls({ trace }: { trace: PhotoTrace }) {
  const { t } = useTranslation()
  const { ai, settings: s, set, rectified } = trace
  const canRun = !!ai.model && !!rectified && !ai.running
  const errorKey = ai.error && ['noModel', 'unavailable', 'noColour'].includes(ai.error) ? `cutout.photo.ai.error.${ai.error}` : null
  return (
    <div className="flex flex-col gap-2" data-testid="ai-controls">
      <div className="flex flex-wrap items-center gap-2">
        <Button primary onClick={() => void ai.run()} disabled={!canRun}>{ai.hasResult ? t('cutout.photo.ai.rerun') : t('cutout.photo.ai.run')}</Button>
        <button type="button" onClick={openModelManager} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent-text underline">{t('cutout.photo.ai.models')}</button>
      </div>
      <p className="m-0 text-xs text-text-subtle">{t('cutout.photo.ai.privacy')}</p>
      {!ai.model && <p className="m-0 text-xs text-text-muted" data-testid="ai-hint">{t('cutout.photo.ai.needModel')}</p>}
      {ai.model && <p className="m-0 text-xs text-text-subtle">{t('cutout.photo.ai.using', { name: ai.model.name })}</p>}
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
        <input type="checkbox" checked={s.ai.secondPass} onChange={(e) => set({ ai: { ...s.ai, secondPass: e.target.checked } })} />{t('cutout.photo.ai.secondPass')}
      </label>
      <AiStatus />
      {ai.error && <Banner kind="error">{errorKey ? t(errorKey) : t('cutout.photo.ai.error.failed')} {t('cutout.photo.ai.fallback')}</Banner>}
      {ai.model && ai.hasResult && (
        <MaskTuning model={ai.model} ai={s.ai} onChange={(patch) => set({ ai: { ...s.ai, ...patch } })} alpha={ai.alpha}
          size={rectified ? { width: rectified.image.width, height: rectified.image.height } : null} active={trace.active} baseline={ai.baseline} />
      )}
    </div>
  )
}
