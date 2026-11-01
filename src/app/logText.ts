import type { TFunction } from 'i18next'
import type { LogParams } from './activityLog'

/** Текст строки журнала на языке интерфейса; `setting` и `what` — ключи перевода (rack.field.*, log.what.*). */
export function logText(t: TFunction, key: string, params?: LogParams): string {
  const p: Record<string, string | number> = { ...params }
  if (typeof p.setting === 'string') p.setting = t(p.setting)
  if (typeof p.what === 'string') p.what = t(`log.what.${p.what}`)
  if (typeof p.reason === 'string' && p.reason.startsWith('log.')) p.reason = t(p.reason)
  const text = t(key, p) as string
  if (key === 'log.ai.session' || typeof p.backend !== 'string') return text
  if (typeof p.busy === 'number') return t('log.job.resource', { text, backend: p.backend, busy: p.busy }) as string
  return t('log.job.backend', { text, backend: p.backend }) as string
}

/** Размер файла для строки журнала: «12 KB», «1.4 MB». */
export function fmtSize(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
