import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertTriangle, IconArrowBackUp, IconArrowDown, IconCircleX, IconInfoCircle, IconX } from '@tabler/icons-react'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { SegmentedControl } from '../ui/SegmentedControl'
import { Toggle } from '../ui/Toggle'
import { agentBridge, useAgentHistory } from '../agent/bridge'
import { useAgentSettings } from '../agent/settings'
import { APP_VERSION } from './site'
import { LOG_SOURCES, clearLog, closeLog, useActivityLog, type LogEntry, type LogLevel, type LogSource, type LogTab } from './activityLog'
import { logText } from './logText'
import { formatResourcesReport, ResourcesTab, type ResourcesDeps } from './resources/ResourcesTab'
import { ModelsTab } from '../features/ml/ModelManager'

type LevelFilter = 'all' | 'warn' | 'error'
export type PanelTab = LogTab

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

/** Журнал событий приложения: компактная панель в стиле Chrome DevTools с вкладками Журнал, Агенты, Модели, Ресурсы. */
export function ActivityLogPanel({ resourcesDeps }: { resourcesDeps?: ResourcesDeps } = {}) {
  const log = useActivityLog()
  if (!log.open) return null
  const initialTab: PanelTab = log.openTab ?? (log.openSource === 'agent' ? 'agent' : log.openSource === 'ai' ? 'models' : 'log')
  return <Panel key={`${log.openTab ?? 'default'}-${log.openSource ?? 'all'}`} initialTab={initialTab} resourcesDeps={resourcesDeps} />
}

function Panel({ initialTab, resourcesDeps }: { initialTab: PanelTab; resourcesDeps?: ResourcesDeps }) {
  const { t, i18n } = useTranslation()
  const log = useActivityLog()
  const [tab, setTab] = useState<PanelTab>(initialTab)
  const [level, setLevel] = useState<LevelFilter>('all')
  const [source, setSource] = useState<LogSource | 'all'>(log.openSource ?? 'all')
  const [follow, setFollow] = useState(true)
  const [copied, setCopied] = useState(false)
  const [agentSettings, updateAgentSettings] = useAgentSettings()
  const { top: topAgentEntry, canUndo } = useAgentHistory()
  const [confirmUndo, setConfirmUndo] = useState<{ logEntryId?: number } | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement)
  const closeBtn = useRef<HTMLButtonElement>(null)

  const busyAi = log.jobs.some((j) => j.source === 'ai')
  const busyAgent = log.jobs.some((j) => j.source === 'agent')

  const handleUndo = (logEntryId?: number) => {
    const outcome = agentBridge.undo(logEntryId)
    if (outcome.status === 'changed_since') {
      setConfirmUndo({ logEntryId })
    }
  }

  const counts = useMemo(() => {
    const c: Partial<Record<LogSource, number>> = {}
    for (const e of log.entries) if (level === 'all' || shown(e, level, 'all')) c[e.source] = (c[e.source] ?? 0) + 1
    return c
  }, [log.entries, level])

  const rows = useMemo(() => log.entries.filter((e) => shown(e, level, source)), [log.entries, level, source])
  const agentRows = useMemo(() => log.entries.filter((e) => e.source === 'agent'), [log.entries])

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
    '',
    formatResourcesReport(t),
  ].join('\n')

  const copy = async () => {
    try { await navigator.clipboard.writeText(plain()); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* буфер недоступен */ }
  }

  const TABS: { id: PanelTab; label: string }[] = [
    { id: 'log', label: t('log.tabs.log', t('resources.tabLog')) },
    { id: 'agent', label: t('log.tabs.agent', t('agent.title')) },
    { id: 'models', label: t('log.tabs.models', t('ml.title')) },
    { id: 'resources', label: t('log.tabs.resources', t('resources.tabResources')) },
  ]

  return (
    <section role="dialog" aria-label={t('log.title')}
      className="absolute inset-x-0 bottom-9 z-40 flex h-[65vh] md:h-[40vh] flex-col border-t border-border-strong bg-surface-1 shadow-xl">
      <header className="flex flex-none items-center justify-between border-b border-border bg-surface-2 px-2 h-9 text-xs">
        <div role="tablist" aria-label={t('resources.viewSwitcher')} className="flex items-center gap-0.5">
          {TABS.map(({ id, label }) => {
            const active = tab === id
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setTab(id)}
                className={`relative inline-flex h-8 items-center px-3 font-medium transition-colors cursor-pointer border-b-2 ${
                  active
                    ? 'border-accent text-text bg-surface-1 font-semibold'
                    : 'border-transparent text-text-muted hover:text-text hover:bg-surface-3/50'
                }`}
              >
                {label}
                {id === 'models' && busyAi && (
                  <span data-testid="models-busy" aria-hidden className="ml-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                )}
                {id === 'agent' && busyAgent && (
                  <span data-testid="agent-busy" aria-hidden className="ml-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                )}
              </button>
            )
          })}
        </div>
        <button
          ref={closeBtn}
          type="button"
          aria-label={t('log.close')}
          onClick={close}
          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted hover:bg-surface-3 hover:text-text"
        >
          <IconX size={16} aria-hidden />
        </button>
      </header>

      {tab === 'resources' ? (
        <ResourcesTab deps={resourcesDeps} />
      ) : tab === 'models' ? (
        <ModelsTab />
      ) : tab === 'agent' ? (
        <div data-testid="agent-tab" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 text-xs">
            <Toggle label={t('agent.allow')} checked={agentSettings.enabled} onChange={(enabled) => updateAgentSettings({ enabled })} />
            {canUndo && (
              <Button onClick={() => handleUndo()} title={topAgentEntry?.label ? t('agent.undoAria', { label: topAgentEntry.label }) : t('agent.undo')}>
                <IconArrowBackUp size={16} aria-hidden />
                {t('agent.undo')}
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
            {agentRows.length === 0 ? (
              <p className="m-0 py-4 text-text-muted">{t('log.empty')}</p>
            ) : (
              agentRows.map((e) => {
                const isUndoable = topAgentEntry?.logEntryId === e.id
                return (
                  <div key={e.id} className="flex items-start gap-2 py-1">
                    <span className="shrink-0 text-text-subtle">{formatLogTime(e.time)}</span>
                    <span className="min-w-0 flex-1 break-words text-text">
                      {logText(t, e.key, e.params)}
                      {e.detail && (
                        <details className="mt-0.5 text-text-muted">
                          <summary className="cursor-pointer">{t('log.details')}</summary>
                          <pre className="m-0 whitespace-pre-wrap break-words">{e.detail}</pre>
                        </details>
                      )}
                    </span>
                    {isUndoable && (
                      <button
                        type="button"
                        onClick={() => handleUndo(e.id)}
                        title={t('agent.undoAria', { label: topAgentEntry.label })}
                        aria-label={t('agent.undoAria', { label: topAgentEntry.label })}
                        className="ml-2 inline-flex h-6 flex-none cursor-pointer items-center gap-1 rounded-control border border-border-strong bg-surface-2 px-2 text-xs text-text hover:bg-surface-3"
                      >
                        <IconArrowBackUp size={14} aria-hidden />
                        {t('agent.undo')}
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : (
        <div data-testid="log-tab" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-1.5 text-xs">
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
            <span className="flex-1" />
            <Button onClick={() => void copy()}>{copied ? t('log.copied') : t('log.copy')}</Button>
            <Button onClick={() => clearLog()}>{t('log.clear')}</Button>
          </div>
          <div ref={list} onScroll={onScroll} data-testid="log-list" className="min-h-0 flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
            {rows.length === 0 && <p className="m-0 py-4 text-text-muted">{t('log.empty')}</p>}
            {rows.map((e) => {
              const Icon = ICON[e.level]
              const isUndoableAgentLine = e.source === 'agent' && topAgentEntry?.logEntryId === e.id
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
                  {isUndoableAgentLine && (
                    <button
                      type="button"
                      onClick={() => handleUndo(e.id)}
                      title={t('agent.undoAria', { label: topAgentEntry.label })}
                      aria-label={t('agent.undoAria', { label: topAgentEntry.label })}
                      className="ml-2 inline-flex h-6 flex-none cursor-pointer items-center gap-1 rounded-control border border-border-strong bg-surface-2 px-2 text-xs text-text hover:bg-surface-3"
                    >
                      <IconArrowBackUp size={14} aria-hidden />
                      {t('agent.undo')}
                    </button>
                  )}
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
        </div>
      )}

      {confirmUndo && (
        <ConfirmDialog
          title={t('agent.changedSinceTitle')}
          confirmLabel={t('agent.restore')}
          cancelLabel={t('log.cancel')}
          danger
          onConfirm={() => {
            agentBridge.undo(confirmUndo.logEntryId, { force: true })
            setConfirmUndo(null)
          }}
          onCancel={() => setConfirmUndo(null)}
        >
          {t('agent.changedSincePrompt')}
        </ConfirmDialog>
      )}
    </section>
  )
}
