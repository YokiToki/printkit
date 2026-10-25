import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconCheck, IconCircleX, IconLoader2 } from '@tabler/icons-react'
import { cancelJob, isLoading, openLog, useActivityLog } from '../../app/activityLog'
import { logText } from '../../app/logText'

/** Сколько секунд после события его строка остаётся в строке состояния, мс. */
export const MESSAGE_MS = 4000
/** Не чаще одного объявления скринридеру в секунду. */
const ANNOUNCE_MS = 1000

/** Значение, которое меняется не чаще раза в `ms`; последнее значение не теряется. */
function useThrottled(value: string, ms: number) {
  const [out, setOut] = useState(value)
  useEffect(() => {
    if (value === out) return
    const id = setTimeout(() => setOut(value), ms)
    return () => clearTimeout(id)
  }, [value, out, ms])
  return out
}

/** Правая часть строки под 3D-видом: текущее дело, затем последнее сообщение, затем «готово»; счётчики; открывает журнал. */
export function StatusBar({ hasModel }: { hasModel: boolean }) {
  const { t } = useTranslation()
  const log = useActivityLog()
  const [now, setNow] = useState(() => Date.now())
  const job = log.jobs[log.jobs.length - 1]
  const last = log.entries[log.entries.length - 1]
  const age = last ? now - last.time : Infinity
  const showLast = !job && !!last && age < MESSAGE_MS

  useEffect(() => {
    if (!last) return
    setNow(Date.now())
    const id = setTimeout(() => setNow(Date.now()), MESSAGE_MS + 20)
    return () => clearTimeout(id)
  }, [last?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loading = isLoading(log)
  const pct = job?.progress !== undefined ? ` ${Math.round(job.progress * 100)} %` : ''
  const text = job ? logText(t, job.key, job.params) + pct : showLast ? logText(t, last.key, last.params) : hasModel ? t('common.ready') : ''
  const announced = useThrottled(text, ANNOUNCE_MS)
  const levelColor = showLast && last.level === 'error' ? 'text-error-text' : showLast && last.level === 'warn' ? 'text-warn-text' : !job && hasModel ? 'text-success-text' : ''

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
      {job?.cancelable && (
        <button type="button" onClick={() => cancelJob(job.id)} className="cursor-pointer rounded-control border border-border-strong bg-surface-2 px-2 py-0.5 text-text hover:bg-surface-3">
          {t('log.cancel')}
        </button>
      )}
      <button type="button" aria-label={t('log.open')} title={t('log.open')} onClick={() => openLog()}
        className="inline-flex min-h-8 min-w-0 cursor-pointer items-center justify-end gap-3 rounded-control border-0 bg-transparent px-1 text-xs text-text-muted hover:text-text">
        {log.warnings > 0 && <span className="inline-flex shrink-0 items-center gap-1 text-warn-text" title={t('log.warnings', { count: log.warnings })}><IconAlertTriangle size={14} stroke={1.75} aria-hidden />{log.warnings}</span>}
        {log.errors > 0 && <span className="inline-flex shrink-0 items-center gap-1 text-error-text" title={t('log.errors', { count: log.errors })}><IconCircleX size={14} stroke={1.75} aria-hidden />{log.errors}</span>}
        <span className={`inline-flex min-w-0 items-center gap-1.5 ${levelColor}`}>
          {loading ? <IconLoader2 size={14} className="shrink-0 animate-spin" aria-hidden /> : !job && !showLast && hasModel && <IconCheck size={14} stroke={1.75} className="shrink-0" aria-hidden />}
          <span className="truncate">{text}</span>
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{announced}</span>
    </div>
  )
}
