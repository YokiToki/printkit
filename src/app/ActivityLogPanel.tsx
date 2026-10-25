import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconArrowDown, IconCircleX, IconInfoCircle, IconX } from '@tabler/icons-react'
import { Button } from '../ui/Button'
import { SegmentedControl } from '../ui/SegmentedControl'
import { APP_VERSION } from './site'
import { LOG_SOURCES, clearLog, closeLog, useActivityLog, type LogEntry, type LogLevel, type LogSource } from './activityLog'
import { logText } from './logText'

type LevelFilter = 'all' | 'warn' | 'error'

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
/** ЧЧ:ММ:СС.ммм */
export function formatLogTime(ms: number) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

const ICON: Record<LogLevel, typeof IconInfoCircle> = { info: IconInfoCircle, warn: IconAlertTriangle, error: IconCircleX }
const COLOR: Record<LogLevel, string> = { info: 'text-text-subtle', warn: 'text-warn-text', error: 'text-error-text' }

const shown = (e: LogEntry, level: LevelFilter, source: LogSource | 'all') =>
  (source === 'all' || e.source === source) && (level === 'all' || (level === 'warn' ? e.level !== 'info' : e.level === 'error'))

/** Журнал событий приложения: панель над строкой состояния, на узком экране — шторка снизу. Монтируется один раз в AppShell. */
export function ActivityLogPanel() {
  const log = useActivityLog()
  if (!log.open) return null
  return <Panel key={log.openSource ?? 'all'} />
}

function Panel() {
  const { t, i18n } = useTranslation()
  const log = useActivityLog()
  const [level, setLevel] = useState<LevelFilter>('all')
  const [source, setSource] = useState<LogSource | 'all'>(log.openSource ?? 'all')
  const [follow, setFollow] = useState(true)
  const [copied, setCopied] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement)
  const closeBtn = useRef<HTMLButtonElement>(null)

  const counts = useMemo(() => {
    const c: Partial<Record<LogSource, number>> = {}
    for (const e of log.entries) if (level === 'all' || shown(e, level, 'all')) c[e.source] = (c[e.source] ?? 0) + 1
    return c
  }, [log.entries, level])
  const rows = useMemo(() => log.entries.filter((e) => shown(e, level, source)), [log.entries, level, source])

  const close = () => {
    const back = opener.current
    closeLog()
    setTimeout(() => (back as HTMLElement | null)?.focus?.(), 0)
  }
  useEffect(() => {
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = list.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [rows, follow])

  const onScroll = () => {
    const el = list.current
    if (!el) return
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 8)
  }

  const plain = () => [
    `${t('log.copyHeader.version')}: ${APP_VERSION}`,
    `${t('log.copyHeader.language')}: ${i18n.language}`,
    `${t('log.copyHeader.browser')}: ${navigator.userAgent}`,
    '',
    ...rows.flatMap((e) => [`${formatLogTime(e.time)} [${t(`log.levelName.${e.level}`)}] [${t(`log.sources.${e.source}`)}] ${logText(t, e.key, e.params)}`, ...(e.detail ? [`    ${e.detail}`] : [])]),
  ].join('\n')

  const copy = async () => {
    try { await navigator.clipboard.writeText(plain()); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* буфер недоступен */ }
  }

  return (
    <section role="dialog" aria-label={t('log.title')}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[65vh] flex-col rounded-t-group border border-border-strong bg-surface-1 shadow-xl md:right-0 md:bottom-9 md:left-auto md:h-[40vh] md:w-[min(760px,100%)] md:rounded-tr-none">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <h2 className="m-0 flex-1 text-sm font-semibold">{t('log.title')}</h2>
        <Button onClick={() => void copy()}>{copied ? t('log.copied') : t('log.copy')}</Button>
        <Button onClick={() => clearLog()}>{t('log.clear')}</Button>
        <button ref={closeBtn} type="button" aria-label={t('log.close')} onClick={close}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted hover:text-text"><IconX size={18} aria-hidden /></button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <SegmentedControl<LevelFilter> ariaLabel={t('log.filterLevel')} value={level} onChange={setLevel}
          options={[{ value: 'all', label: t('log.levels.all') }, { value: 'warn', label: t('log.levels.warn') }, { value: 'error', label: t('log.levels.error') }]} />
        <div role="group" aria-label={t('log.filterSource')} className="flex flex-wrap gap-1.5">
          {(['all', ...LOG_SOURCES.filter((s) => counts[s] || s === source)] as (LogSource | 'all')[]).map((s) => (
            <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)}
              className={`cursor-pointer rounded-control border px-2 py-0.5 text-xs ${source === s ? 'border-accent bg-accent-muted text-white' : 'border-border-strong bg-surface-2 text-text-muted hover:text-text'}`}>
              {s === 'all' ? t('log.levels.all') : `${t(`log.sources.${s}`)} ${counts[s] ?? 0}`}
            </button>
          ))}
        </div>
      </div>
      <div ref={list} onScroll={onScroll} data-testid="log-list" className="min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
        {rows.length === 0 && <p className="m-0 py-4 text-text-muted">{t('log.empty')}</p>}
        {rows.map((e) => {
          const Icon = ICON[e.level]
          return (
            <div key={e.id} className="flex items-start gap-2 py-0.5">
              <span className="shrink-0 text-text-subtle">{formatLogTime(e.time)}</span>
              <Icon size={14} stroke={1.75} className={`mt-px shrink-0 ${COLOR[e.level]}`} aria-label={t(`log.levelName.${e.level}`)} role="img" />
              <span className="shrink-0 text-text-subtle">{t(`log.sources.${e.source}`)}</span>
              <span className="min-w-0 flex-1 break-words text-text">
                {logText(t, e.key, e.params)}
                {e.detail && (
                  <details className="mt-0.5 text-text-muted">
                    <summary className="cursor-pointer">{t('log.details')}</summary>
                    <pre className="m-0 whitespace-pre-wrap break-words">{e.detail}</pre>
                  </details>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <footer className="flex items-center gap-3 border-t border-border px-4 py-1.5 text-xs text-text-subtle">
        <span className="flex-1">{t('log.privacy')}</span>
        {!follow && (
          <Button className="h-7 text-xs" onClick={() => { setFollow(true); const el = list.current; if (el) el.scrollTop = el.scrollHeight }}>
            <IconArrowDown size={14} aria-hidden />{t('log.jumpLatest')}
          </Button>
        )}
      </footer>
    </section>
  )
}
