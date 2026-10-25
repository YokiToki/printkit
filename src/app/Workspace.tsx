import { useRef, useState, type ReactNode, type PointerEvent } from 'react'
import type { ModelResult } from '../geometry/model'
import { useTranslation } from 'react-i18next'
import { IconChevronDown, IconFocusCentered, IconRestore, IconShape } from '@tabler/icons-react'
import { Viewport, type BuildPlate } from '../features/viewport/Viewport'
import { usePersistedState } from './usePersistedState'
import { ExportOptionsSection } from '../features/export/ExportOptionsSection'
import { useElementHeight } from './useElementHeight'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { MeasurementsBar } from '../features/viewport/MeasurementsBar'
import { AssembledControls } from '../features/viewport/AssembledControls'
import { OPEN_GAP_MAX, type KeychainView } from '../features/viewport/layout'

/** Раскладка режима: панель параметров, закреплённый блок экспорта и 3D-вид. На узком экране панель — нижняя шторка. */
export function Workspace({ panel, footer, model, plate, gap, exportOptions = true, overlay, onStartOver, modeName }: {
  panel: ReactNode
  footer?: ReactNode
  model: ModelResult | null
  plate?: BuildPlate | null
  /** Зазор между частями в разнесённом виде, мм (0 — собрано). */
  gap?: number
  /** Секция параметров экспорта в панели (у заглушек без модели не нужна). */
  exportOptions?: boolean
  /** Плавающий блок поверх вьюпорта (например, предпросмотр маски Keychain). */
  overlay?: ReactNode
  /** Вернуть параметры режима к умолчаниям: кнопка «Начать заново» над параметрами с подтверждением. Не у заглушек. */
  onStartOver?: () => void
  /** Название режима для текста подтверждения. */
  modeName?: string
}) {
  const { t } = useTranslation()
  const [view, setView] = usePersistedState<{ tools: boolean; keychainView: KeychainView; openGap: number }>('gridfinity.viewport', { tools: true, keychainView: 'sheet', openGap: 0 })
  const hasAssembly = !!model?.assembly
  const keychainView: KeychainView = view.keychainView === 'assembled' ? 'assembled' : 'sheet'
  const openGap = Math.min(OPEN_GAP_MAX, Math.max(0, Number(view.openGap) || 0))
  const hasTools = (model?.tools?.length ?? 0) > 0
  const fitRef = useRef<() => void>(() => {})
  const [drawerTop, setDrawerTop] = useState(300) // отступ верха шторки на мобильном, px
  const [footerRef, footerH] = useElementHeight<HTMLDivElement>()
  const [confirming, setConfirming] = useState(false)
  const startOverBtn = useRef<HTMLButtonElement>(null)
  const closeConfirm = () => { setConfirming(false); setTimeout(() => startOverBtn.current?.focus(), 0) }
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null)

  const onDown = (e: PointerEvent) => {
    drag.current = { y: e.clientY, top: drawerTop, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y
    if (Math.abs(dy) > 3) d.moved = true
    setDrawerTop(Math.min(window.innerHeight - 140, Math.max(120, d.top + dy)))
  }
  const onUp = () => {
    if (drag.current && !drag.current.moved) setDrawerTop((v) => (v > window.innerHeight - 200 ? 300 : window.innerHeight - 140))
    drag.current = null
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <aside
        aria-label={t('shell.parameters')}
        style={{ '--dt': `${drawerTop}px` } as React.CSSProperties}
        className="absolute top-(--dt) right-0 bottom-0 left-0 z-10 flex min-h-0 flex-col rounded-t-2xl border border-b-0 border-border-strong bg-surface-1 shadow-float md:static md:z-auto md:w-[380px] md:flex-none md:rounded-none md:border-0 md:border-r md:border-border md:shadow-none md:top-auto"
      >
        <button type="button" aria-label={t('shell.dragDrawer')} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          className="flex h-7 flex-none cursor-grab touch-none items-center justify-center border-0 bg-transparent md:hidden">
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </button>
        <div className="flex flex-none items-center justify-between pr-2 pb-2 pl-4 md:hidden">
          <b className="text-[15px]">{t('shell.parameters')}</b>
          <button type="button" aria-label={t('shell.collapseDrawer')} onClick={() => setDrawerTop(window.innerHeight - 140)}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted"><IconChevronDown size={18} stroke={1.75} /></button>
        </div>
        {onStartOver && (
          <div className="flex flex-none items-center border-b border-border px-3 py-2" data-testid="start-over-strip">
            <button ref={startOverBtn} type="button" onClick={() => setConfirming(true)}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-border-strong bg-surface-2 px-3 text-sm font-medium text-text hover:bg-surface-3">
              <IconRestore size={16} stroke={1.75} />{t('startOver.button')}
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto" style={{ paddingBottom: footerH }} data-testid="panel-scroller">{panel}{exportOptions && <ExportOptionsSection />}</div>
        {footer && <div ref={footerRef} className="flex-none border-t border-border bg-surface-1 px-4 py-3 shadow-sticky">{footer}</div>}
      </aside>
      {confirming && onStartOver && (
        <ConfirmDialog title={t('startOver.title')} confirmLabel={t('startOver.confirm')} cancelLabel={t('startOver.cancel')}
          onConfirm={() => { onStartOver(); closeConfirm() }} onCancel={closeConfirm}>
          {t('startOver.text', { mode: modeName ?? '' })}
        </ConfirmDialog>
      )}
      <section aria-label={t('viewport.label')} className="relative min-w-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#1a2029_0%,#0b0d10_75%)]">
        <Viewport model={model} plate={plate ?? null} gap={gap ?? 0} view={hasAssembly ? keychainView : 'sheet'} openGap={openGap} showTools={view.tools} onFitReady={(f) => (fitRef.current = f)} />
        <button type="button" aria-label={t('viewport.fit')} title={t('viewport.fit')} onClick={() => fitRef.current()}
          className="absolute top-4 right-4 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-group border border-border bg-surface-1/90 text-text-muted hover:text-text md:h-8 md:w-8">
          <IconFocusCentered size={16} stroke={1.75} />
        </button>
        {hasTools && (
          <button type="button" aria-label={t('viewport.tools')} title={t('viewport.tools')} aria-pressed={view.tools} onClick={() => setView({ ...view, tools: !view.tools })}
            className={`absolute top-16 right-4 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-group border border-border bg-surface-1/90 hover:text-text md:top-14 md:h-8 md:w-8 ${view.tools ? 'text-accent' : 'text-text-muted'}`}>
            <IconShape size={16} stroke={1.75} />
          </button>
        )}
        {hasAssembly && <AssembledControls view={keychainView} openGap={openGap} onView={(v) => setView({ ...view, keychainView: v })} onOpenGap={(g) => setView({ ...view, openGap: g })} />}
        {overlay}
        <MeasurementsBar model={model} />
      </section>
    </div>
  )
}
