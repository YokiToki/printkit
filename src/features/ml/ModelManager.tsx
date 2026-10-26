import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconX } from '@tabler/icons-react'
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
export function ModelManager({ store: given, service, caps: givenCaps, models = MODELS }: { store?: ModelStore; service?: Pick<MlService, 'downloadModel'>; caps?: Capabilities | null; models?: readonly ModelSpec[] }) {
  const { t } = useTranslation()
  const store = useModelStore(given)
  const detected = useCapabilities()
  const caps = givenCaps === undefined ? detected : givenCaps
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const [consent, setConsent] = useState<ModelSpec | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)

  useEffect(() => { root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (consent || confirmAll) return // свои окна подтверждения сами обрабатывают Esc и Tab
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
  }, [consent, confirmAll])

  const download = (spec: ModelSpec) => { setConsent(null); void (service ?? getMlService()).downloadModel(spec) }
  const used = store.usedBytes()
  const activeOf = (kind: MlKind) => usableModel(store, caps, kind, models)?.id // выбранная пользователем, а пока выбора нет — первая готовая и доступная

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 md:p-4" data-testid="models-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModelManager() }}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-card border border-border-strong bg-surface-1 shadow-float">
        <header className="flex flex-none items-center gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="m-0 flex-1 text-[15px] font-semibold">{t('ml.title')}</h2>
          <button type="button" data-autofocus aria-label={t('ml.close')} onClick={closeModelManager}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted hover:bg-surface-3 hover:text-text"><IconX size={18} stroke={1.75} /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          <p className="m-0 text-xs text-text-muted">{t('ml.intro')}</p>
          {!store.persistent && <Banner kind="warn">{t('ml.notPersistent')}</Banner>}
          {KINDS.filter((k) => models.some((m) => m.kind === k)).map((kind) => (
            <section key={kind} aria-label={t(`ml.kind.${kind}`)} className="flex flex-col gap-2">
              <h3 className="m-0 text-[13px] font-semibold">{t(`ml.kind.${kind}`)}</h3>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {models.filter((m) => m.kind === kind).map((m) => (
                  <ModelRow key={m.id} spec={m} store={store} caps={caps} activeId={activeOf(kind)} onDownload={() => setConsent(m)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="flex flex-none flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-xs text-text-muted">
          <span data-testid="models-used">{t('ml.used', { mb: mb(used) })}</span>
          <button type="button" onClick={() => { closeModelManager(); openLog({ source: 'ai' }) }} className="cursor-pointer border-0 bg-transparent p-0 text-accent-text underline">{t('ml.openLog')}</button>
          <span className="flex-1" />
          <Button onClick={() => setConfirmAll(true)} disabled={used === 0}>{t('ml.deleteAll')}</Button>
        </footer>
      </div>
      {consent && (
        <ConfirmDialog title={t('ml.consent.title', { name: consent.name })} confirmLabel={t('ml.consent.confirm')} cancelLabel={t('ml.consent.cancel')}
          onConfirm={() => download(consent)} onCancel={() => setConsent(null)}>
          {t('ml.consent.body', { mb: mb(consent.bytes), host: modelHost(consent), spdx: consent.spdx })}
        </ConfirmDialog>
      )}
      {confirmAll && (
        <ConfirmDialog title={t('ml.deleteAllTitle')} confirmLabel={t('ml.deleteAll')} cancelLabel={t('ml.consent.cancel')}
          onConfirm={() => { setConfirmAll(false); void store.removeAll() }} onCancel={() => setConfirmAll(false)}>
          {t('ml.deleteAllBody')}
        </ConfirmDialog>
      )}
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
  return (
    <li data-testid={`model-${spec.id}`} className="flex flex-col gap-1.5 rounded-control border border-border bg-bg p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input type="radio" name={`active-${spec.kind}`} aria-label={t('ml.use')} title={t('ml.use')} checked={active} disabled={st.state !== 'ready' || !!unavailable}
          onChange={() => store.setActive(spec.kind, spec.id)} className="h-4 w-4 flex-none cursor-pointer disabled:cursor-default disabled:opacity-40" />
        <span className="text-sm font-medium">{spec.name}</span>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-muted">{t(`ml.purpose.${spec.purpose}`)}</span>
        <span className="font-mono text-xs text-text-muted">{t('ml.size', { mb: mb(spec.bytes) })}</span>
        <a href={spec.source} target="_blank" rel="noopener noreferrer" className="text-xs text-text-muted">{t('ml.licence', { spdx: spec.spdx })}</a>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-7 text-xs">
        <span data-testid={`status-${spec.id}`} className={st.state === 'failed' ? 'text-error-text' : active && st.state === 'ready' ? 'text-text' : 'text-text-muted'}>
          {unavailable ? t(`ml.unavailable.${unavailable}`)
            : st.state === 'absent' ? t('ml.status.absent')
            : st.state === 'ready' ? (active ? t('ml.status.inUse') : t('ml.status.ready'))
            : st.state === 'downloading' ? t('ml.status.downloading', { pct })
            : t('ml.status.failed', { reason: t(`log.ai.reason.${st.error}`) })}
        </span>
        {st.state === 'downloading' && <progress value={pct} max={100} aria-label={spec.name} className="h-1.5 w-32" />}
        <span className="flex-1" />
        {(st.state === 'absent' || st.state === 'failed') && !unavailable && <Button primary onClick={onDownload}>{t('ml.download')}</Button>}
        {st.state === 'downloading' && <Button onClick={() => store.cancel(spec.id)}>{t('ml.cancel')}</Button>}
        {st.state === 'ready' && <Button onClick={() => void store.remove(spec.id)}>{t('ml.delete')}</Button>}
      </div>
    </li>
  )
}
