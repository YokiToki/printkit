import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconAlertCircle, IconCheck, IconCircleCheck, IconCloud, IconLoader2, IconX } from '@tabler/icons-react'
import { openLog } from '../../app/activityLog'
import { availability, type Capabilities } from '../../ml/capabilities'
import type { ModelStore } from '../../ml/modelStore'
import { usableModel } from '../../ml/choice'
import { MODELS, modelHost, type MlKind, type ModelSpec } from '../../ml/models'
import { getMlService, type MlService } from '../../ml/service'
import { useCapabilities, useModelStore } from '../../ml/useMl'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { closeModelManager } from './managerState'

const KINDS: MlKind[] = ['matte', 'depth']
const mb = (n: number) => Math.round(n / 1048576)

/**
 * Менеджер моделей ИИ: окно из верхней панели, не зависящее от режима. Модели по видам (маска силуэта), у каждой имя, назначение,
 * размер, лицензия и состояние; скачать, отменить, удалить, выбрать рабочую. Модель никогда не скачивается молча: единственный
 * путь к загрузке — кнопка «Скачать» и подтверждение с размером, сервером и лицензией. Макета нет: собрано из `ui/` и токенов.
 */
export function ModelsTab({ store: given, service, caps: givenCaps, models = MODELS }: { store?: ModelStore; service?: Pick<MlService, 'downloadModel'>; caps?: Capabilities | null; models?: readonly ModelSpec[] }) {
  const { t } = useTranslation()
  const store = useModelStore(given)
  const detected = useCapabilities()
  const caps = givenCaps === undefined ? detected : givenCaps
  const [consent, setConsent] = useState<ModelSpec | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)

  const download = (spec: ModelSpec) => { setConsent(null); void (service ?? getMlService()).downloadModel(spec) }
  const used = store.usedBytes()
  const activeOf = (kind: MlKind) => usableModel(store, caps, kind, models)?.id

  return (
    <div data-testid="models-tab" className="flex min-h-0 flex-1 flex-col overflow-hidden text-xs">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto p-2.5">
        <div data-testid="models-list-header" className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 min-w-0 flex-1 text-[11px] text-text-muted">{t('ml.intro')}</p>
          <Button compact danger onClick={() => setConfirmAll(true)} disabled={used === 0}>{t('ml.deleteAll')}</Button>
        </div>
        {!store.persistent && <Banner kind="warn">{t('ml.notPersistent')}</Banner>}
        {KINDS.filter((k) => models.some((m) => m.kind === k)).map((kind) => (
          <section key={kind} aria-label={t(`ml.kind.${kind}`)} className="flex flex-col gap-1.5">
            <h3 className="m-0 text-xs font-semibold">{t(`ml.kind.${kind}`)}</h3>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {models.filter((m) => m.kind === kind).map((m) => (
                <ModelRow key={m.id} spec={m} store={store} caps={caps} activeId={activeOf(kind)} onDownload={() => setConsent(m)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer className="flex flex-none flex-wrap items-center gap-2 border-t border-border px-3 py-1.5 text-[11px] text-text-muted">
        <span data-testid="models-used">{t('ml.used', { mb: mb(used) })}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => { closeModelManager(); openLog({ source: 'ai' }) }} className="cursor-pointer border-0 bg-transparent p-0 text-accent-text underline">{t('ml.openLog')}</button>
      </footer>
      {consent && (
        <ConfirmDialog title={t('ml.consent.title', { name: consent.name })} confirmLabel={t('ml.consent.confirm')} cancelLabel={t('ml.consent.cancel')}
          onConfirm={() => download(consent)} onCancel={() => setConsent(null)}>
          {t('ml.consent.body', { mb: mb(consent.bytes), host: modelHost(consent), spdx: consent.spdx })}
        </ConfirmDialog>
      )}
      {confirmAll && (
        <ConfirmDialog danger title={t('ml.deleteAllTitle')} confirmLabel={t('ml.deleteAll')} cancelLabel={t('ml.consent.cancel')}
          onConfirm={() => { setConfirmAll(false); void store.removeAll() }} onCancel={() => setConfirmAll(false)}>
          {t('ml.deleteAllBody')}
        </ConfirmDialog>
      )}
    </div>
  )
}

export function ModelManager({ store: given, service, caps: givenCaps, models = MODELS }: { store?: ModelStore; service?: Pick<MlService, 'downloadModel'>; caps?: Capabilities | null; models?: readonly ModelSpec[] }) {
  const { t } = useTranslation()
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => { root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeModelManager(); return }
      if (e.key !== 'Tab') return
      const items = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])]
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 md:p-4" data-testid="models-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModelManager() }}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-card border border-border-strong bg-surface-1 shadow-float">
        <header className="flex flex-none items-center gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="m-0 flex-1 text-[15px] font-semibold">{t('ml.title')}</h2>
          <button type="button" data-autofocus aria-label={t('ml.close')} onClick={closeModelManager}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted hover:bg-surface-3 hover:text-text"><IconX size={18} stroke={1.75} /></button>
        </header>
        <ModelsTab store={given} service={service} caps={givenCaps} models={models} />
      </div>
    </div>,
    document.body,
  )
}

function ModelRow({ spec, store, caps, activeId, onDownload }: { spec: ModelSpec; store: ModelStore; caps: Capabilities | null; activeId: string | undefined; onDownload: () => void }) {
  const { t } = useTranslation()
  const st = store.status(spec.id)
  const av = caps ? availability(spec, caps) : null
  const unavailable = av && !av.ok ? av.reason : null
  const active = activeId === spec.id
  const pct = st.state === 'downloading' ? Math.round((st.loaded / st.total) * 100) : 0

  const statusText = unavailable
    ? t(`ml.unavailable.${unavailable}`)
    : st.state === 'absent'
    ? t('ml.status.absent')
    : st.state === 'ready'
    ? active
      ? t('ml.status.inUse')
      : t('ml.status.ready')
    : st.state === 'downloading'
    ? t('ml.status.downloading', { pct })
    : t('ml.status.failed', { reason: t(`log.ai.reason.${st.error}`) })

  let statusIcon = <IconCloud size={14} stroke={1.75} aria-hidden />
  let statusColor = 'text-text-subtle'

  if (unavailable) {
    statusIcon = <IconAlertCircle size={14} stroke={1.75} aria-hidden />
    statusColor = 'text-warn-text'
  } else if (st.state === 'ready') {
    if (active) {
      statusIcon = <IconCircleCheck size={14} stroke={1.75} aria-hidden />
      statusColor = 'text-accent'
    } else {
      statusIcon = <IconCheck size={14} stroke={1.75} aria-hidden />
      statusColor = 'text-text-muted'
    }
  } else if (st.state === 'downloading') {
    statusIcon = <IconLoader2 size={14} stroke={1.75} className="animate-spin" aria-hidden />
    statusColor = 'text-accent'
  } else if (st.state === 'failed') {
    statusIcon = <IconAlertCircle size={14} stroke={1.75} aria-hidden />
    statusColor = 'text-error-text'
  }

  return (
    <li
      data-testid={`model-${spec.id}`}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-control border border-border bg-bg px-2.5 py-1 text-xs"
    >
      <input
        type="radio"
        name={`active-${spec.kind}`}
        aria-label={t('ml.use')}
        title={t('ml.use')}
        checked={active}
        disabled={st.state !== 'ready' || !!unavailable}
        onChange={() => store.setActive(spec.kind, spec.id)}
        className="h-3.5 w-3.5 flex-none cursor-pointer disabled:cursor-default disabled:opacity-40"
      />
      <span className="font-semibold whitespace-nowrap text-text">{spec.name}</span>
      <span className="rounded-full bg-surface-3 px-1.5 py-px text-[10px] text-text-muted whitespace-nowrap">
        {t(`ml.purpose.${spec.purpose}`)}
      </span>
      <span className="font-mono text-[11px] text-text-muted whitespace-nowrap">
        {t('ml.size', { mb: mb(spec.bytes) })}
      </span>
      <a
        href={spec.source}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] text-text-muted whitespace-nowrap underline hover:text-text"
      >
        {t('ml.licence', { spdx: spec.spdx })}
      </a>
      <span
        data-testid={`status-${spec.id}`}
        title={statusText}
        className={`inline-flex items-center gap-1 cursor-help flex-none ${statusColor}`}
      >
        {statusIcon}
        <span className="sr-only">{statusText}</span>
        {st.state === 'downloading' && (
          <progress value={pct} max={100} aria-label={spec.name} className="h-1.5 w-16" />
        )}
      </span>
      <span className="flex-1" />
      {(st.state === 'absent' || st.state === 'failed') && !unavailable && (
        <Button compact primary onClick={onDownload}>{t('ml.download')}</Button>
      )}
      {st.state === 'downloading' && (
        <Button compact onClick={() => store.cancel(spec.id)}>{t('ml.cancel')}</Button>
      )}
      {st.state === 'ready' && (
        <Button compact danger onClick={() => void store.remove(spec.id)}>{t('ml.delete')}</Button>
      )}
    </li>
  )
}
