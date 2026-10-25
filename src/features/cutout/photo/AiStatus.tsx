import { useTranslation } from 'react-i18next'
import { IconLoader2 } from '@tabler/icons-react'
import { cancelJob, useActivityLog } from '../../../app/activityLog'
import { logText } from '../../../app/logText'

/**
 * Строка состояния ИИ рядом с кнопкой запуска: крутилка, текущая строка собственной задачи (источник `ai`: скачивание или запуск)
 * и «Отмена»; когда задачи нет — последняя строка ИИ из журнала (итог или ошибка). Журнал целиком открывается из строки состояния.
 */
export function AiStatus() {
  const { t } = useTranslation()
  const log = useActivityLog()
  const job = [...log.jobs].reverse().find((j) => j.source === 'ai')
  const last = [...log.entries].reverse().find((e) => e.source === 'ai')
  if (!job && !last) return null
  const text = job ? logText(t, job.key, job.params) + (job.progress !== undefined ? ` ${Math.round(job.progress * 100)} %` : '') : logText(t, last!.key, last!.params)
  const tone = !job && last?.level === 'error' ? 'text-error-text' : !job && last?.level === 'warn' ? 'text-warn-text' : 'text-text-muted'
  return (
    <div className={`flex items-center gap-2 text-xs ${tone}`} role="status" data-testid="ai-status">
      {job && <IconLoader2 size={14} stroke={1.75} aria-hidden className="animate-spin" />}
      <span className="min-w-0 truncate">{text}</span>
      {job?.cancelable && <button type="button" onClick={() => cancelJob(job.id)} className="cursor-pointer rounded-control border border-border-strong bg-surface-2 px-2 py-0.5 text-text hover:bg-surface-3">{t('log.cancel')}</button>}
    </div>
  )
}
