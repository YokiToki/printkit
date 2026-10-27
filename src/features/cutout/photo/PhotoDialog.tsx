import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconBulb, IconPhoto, IconX } from '@tabler/icons-react'
import type { Cutout } from '../../../geometry/cutout'
import { CUSTOM_PAPER_MAX, CUSTOM_PAPER_MIN, type PaperOrientation, type PaperPreset } from '../../../geometry/photo/paper'
import { Banner } from '../../../ui/Banner'
import { Button } from '../../../ui/Button'
import { LengthField } from '../../../ui/LengthField'
import { NumberField } from '../../../ui/NumberField'
import { SegmentedControl } from '../../../ui/SegmentedControl'
import { formatLength, useUnit } from '../../../ui/units'
import { tracedCutouts } from './createCutouts'
import { fittedVertexCount } from '../../../geometry/outlineFit'
import { traceSilhouette } from '../../../geometry/photo/outline'
import { OutlineControls } from '../../keychain/OutlineControls'
import { CornerEditor } from './CornerEditor'
import { AiControls } from './AiControls'
import { CompareOverlay, CompareTable } from './CompareOverlay'
import { EngineSwitch } from './EngineSwitch'
import { PhotoTips } from './PhotoTips'
import { RectifiedView } from './RectifiedView'
import { PHOTO_CLEARANCE, PHOTO_DEPTH, type PhotoTrace } from './usePhotoTrace'

type Step = 1 | 2 | 3

/**
 * Окно «Из фото»: три шага (снимок и лист, углы листа, силуэты). Esc и щелчок по затемнению закрывают, фокус не выходит из окна;
 * вернуть фокус на кнопку, открывшую окно, должен вызывающий.
 */
export function PhotoDialog({ trace, maxDepth, onClose, onCreate }: { trace: PhotoTrace; maxDepth: number; onClose: () => void; onCreate: (created: Cutout[]) => void }) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>(1)
  const [tipsOpen, setTipsOpen] = useState(false)
  const tipsBtn = useRef<HTMLButtonElement>(null)
  const closeTips = () => { setTipsOpen(false); setTimeout(() => tipsBtn.current?.focus(), 0) }
  const { settings: s, set, photo, paper, quad, preview, rectified, selected, detection } = trace
  const segmentation = trace.active // силуэты выбранного движка (при ошибке ИИ — классические)
  const fmt = (mm: number) => `${formatLength(mm, unit)} ${t(`units.${unit}`)}`

  useEffect(() => { root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus() }, [])
  // полный растр и силуэты считаются только на шаге 3, и не раньше, чем окно успеет показать «ищу силуэты» (пересчёт занимает долю секунды)
  const { needSilhouettes } = trace
  useEffect(() => {
    if (step !== 3) return
    const id = window.setTimeout(() => needSilhouettes(true), 40)
    return () => { window.clearTimeout(id); needSilhouettes(false) }
  }, [step, needSilhouettes])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); if (tipsOpen) closeTips(); else onClose(); return }
      if (e.key !== 'Tab') return
      const items = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])].filter((n) => n.getAttribute('hidden') === null && n.getAttribute('type') !== 'file')
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose, tipsOpen])

  const canNext = step === 1 ? !!photo : step === 2 ? quad === 'ok' && !!preview : false
  const depth = Math.min(PHOTO_DEPTH, maxDepth) // глубину и зазор здесь не видно, их настраивают у готовых вырезов
  // число вершин подогнанного контура по выбранным силуэтам: показывает, как сглаживание и шаг меняют результат
  const vertices = useMemo(() => {
    if (!segmentation) return undefined
    let n = 0
    for (const id of selected) {
      const t = traceSilhouette(segmentation, id, paper)
      if (t) n += fittedVertexCount(t.points, s.outline)
    }
    return n
  }, [segmentation, selected, s.outline, paper])
  const create = () => {
    if (!segmentation) return
    onCreate(tracedCutouts(segmentation, selected, paper, { depth, clearance: PHOTO_CLEARANCE, fit: s.outline, name: (n) => t('cutout.photo.itemName', { n }) }))
  }
  // контуры другого движка для сравнения: ИИ, если активна классика, и наоборот
  const other = s.compare ? (s.engine === 'ai' && trace.aiSegmentation && !trace.ai.error ? trace.segmentation : trace.aiSegmentation && s.engine === 'classic' ? trace.aiSegmentation : null) : null
  const quadMessage = quad === 'ok' ? null : t(`cutout.photo.quad.${quad}`)
  const autoSens = segmentation ? Math.round(segmentation.defaultSensitivity * 100) : 50
  const sensValue = s.sensitivity === null ? autoSens : Math.round(s.sensitivity * 100)
  const stepTitle = (n: Step) => t(`cutout.photo.step${n}`)
  const detectedPaper = detection.status === 'auto' && detection.preset ? (detection.preset === 'a4' ? 'A4' : t('cutout.photo.letter')) : t('cutout.photo.detectedUnknown')

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 md:p-4" data-testid="photo-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-card border border-border-strong bg-surface-1 shadow-float">
        <header className="flex flex-none items-center gap-3 border-b border-border px-4 py-3">
          <h2 id={titleId} className="m-0 text-[15px] font-semibold">{t('cutout.photo.title')}</h2>
          <ol className="m-0 flex list-none gap-1 p-0 text-xs text-text-muted" aria-label={t('cutout.photo.steps')}>
            {([1, 2, 3] as Step[]).map((n) => (
              <li key={n} aria-current={step === n ? 'step' : undefined} className={`rounded-full px-2 py-0.5 ${step === n ? 'bg-accent-muted text-white' : ''}`}>{n}. {stepTitle(n)}</li>
            ))}
          </ol>
          <span className="flex-1" />
          {step > 1 && (
            <button ref={tipsBtn} type="button" aria-haspopup="dialog" aria-expanded={tipsOpen} onClick={() => setTipsOpen((v) => !v)}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-border-strong bg-surface-2 px-2.5 text-[13px] text-text hover:bg-surface-3"><IconBulb size={16} stroke={1.75} />{t('cutout.photo.tipsButton')}</button>
          )}
          <button type="button" data-autofocus aria-label={t('cutout.photo.close')} onClick={onClose}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted hover:bg-surface-3 hover:text-text"><IconX size={18} stroke={1.75} /></button>
        </header>

        {tipsOpen && (
          <div role="dialog" aria-label={t('cutout.photo.tipsTitle')} data-testid="tips-popover" className="absolute top-14 right-4 z-20 w-[min(420px,calc(100%-2rem))] rounded-card border border-border-strong bg-surface-1 p-2 shadow-float">
            <PhotoTips />
          </div>
        )}
        <div data-photo-scroll className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
          {step === 1 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button primary onClick={() => file.current?.click()}><IconPhoto size={16} stroke={1.75} />{t('cutout.photo.choose')}</Button>
                <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden data-testid="photo-input"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void trace.load(f).then((ok) => { if (ok) setStep(2) }); e.target.value = '' }} />
                {trace.loading && <span className="text-xs text-text-muted">{t('cutout.photo.loading')}</span>}
                {photo && <span className="text-xs text-text-muted" data-testid="photo-name">{t('cutout.photo.loaded', { name: photo.name, w: photo.image.width, h: photo.image.height })}</span>}
              </div>
              {trace.error && <Banner kind="error">{t(`cutout.photo.error.${trace.error}`)}</Banner>}
              {photo?.downscaled && <Banner>{t('cutout.photo.downscaled')}</Banner>}
              <PhotoTips />
            </>
          )}

          {step === 2 && photo && (
            <>
              {detection.status === 'auto' && <Banner>{t('cutout.photo.detected', { paper: detectedPaper, orientation: t(`cutout.photo.${detection.orientation}`).toLowerCase() })}</Banner>}
              {detection.status === 'failed' && <Banner kind="warn">{t('cutout.photo.notFound')}</Banner>}
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1 text-xs text-text-muted">{t('cutout.photo.paper')}
                  <SegmentedControl<PaperPreset> ariaLabel={t('cutout.photo.paper')} value={s.preset} onChange={(v) => set({ preset: v })}
                    options={[{ value: 'letter', label: t('cutout.photo.letter') }, { value: 'a4', label: 'A4' }, { value: 'custom', label: t('cutout.photo.custom') }]} />
                </div>
                <div className="flex flex-col gap-1 text-xs text-text-muted">{t('cutout.photo.orientation')}
                  <SegmentedControl<PaperOrientation> ariaLabel={t('cutout.photo.orientation')} value={s.orientation} onChange={(v) => set({ orientation: v })}
                    options={[{ value: 'landscape', label: t('cutout.photo.landscape') }, { value: 'portrait', label: t('cutout.photo.portrait') }]} />
                </div>
                {s.preset === 'custom' && (
                  <div className="grid w-64 grid-cols-2 gap-2">
                    <LengthField label={t('cutout.photo.paperWidth')} value={s.custom.width} min={CUSTOM_PAPER_MIN} max={CUSTOM_PAPER_MAX} step={5} onChange={(v) => set({ custom: { ...s.custom, width: v } })} />
                    <LengthField label={t('cutout.photo.paperLength')} value={s.custom.length} min={CUSTOM_PAPER_MIN} max={CUSTOM_PAPER_MAX} step={5} onChange={(v) => set({ custom: { ...s.custom, length: v } })} />
                  </div>
                )}
                <span className="text-xs text-text-muted" data-testid="paper-size">{t('cutout.photo.paperSize', { w: fmt(paper.width), h: fmt(paper.height) })}</span>
              </div>
              <p className="m-0 text-xs text-text-muted">{t('cutout.photo.alignHelp')}</p>
              {quadMessage && <Banner kind="warn">{quadMessage}</Banner>}
              <div className="grid gap-3 md:grid-cols-2">
                <CornerEditor image={photo.color} corners={s.corners} onChange={(corners) => set({ corners })} />
                <div>{preview ? <RectifiedView rectified={preview} /> : <div className="flex aspect-[4/3] items-center justify-center rounded-card border border-dashed border-border text-xs text-text-subtle">{t('cutout.photo.noPreview')}</div>}</div>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="grid gap-3 md:grid-cols-[1fr_300px]">
              <div>{rectified && segmentation ? (
                <div className="relative">
                  <RectifiedView rectified={rectified} segmentation={segmentation} selected={selected} onToggle={trace.toggle} />
                  {other && <CompareOverlay other={other} width={rectified.image.width} height={rectified.image.height} />}
                </div>
              ) : <div role="status" data-testid="finding" className="flex aspect-[4/3] items-center justify-center rounded-card border border-dashed border-border text-xs text-text-muted">{t('cutout.photo.finding')}</div>}</div>
              <div className="flex flex-col gap-3">
                <EngineSwitch engine={s.engine} onChange={(engine) => set({ engine })} />
                {s.engine === 'classic' ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label={t('cutout.photo.sensitivity')} value={sensValue} min={0} max={100} step={5} unit="%" digits={0} onChange={(v) => set({ sensitivity: v / 100 })} />
                      <LengthField label={t('cutout.photo.margin')} value={s.margin} min={0} max={30} step={0.5} onChange={(v) => set({ margin: v })} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span data-testid="sens-mode">{s.sensitivity === null ? t('cutout.photo.sensAuto') : t('cutout.photo.sensManual')}</span>
                      {s.sensitivity !== null && <Button onClick={() => set({ sensitivity: null })}>{t('cutout.photo.auto')}</Button>}
                    </div>
                  </>
                ) : (
                  <>
                    <LengthField label={t('cutout.photo.margin')} value={s.margin} min={0} max={30} step={0.5} onChange={(v) => set({ margin: v })} />
                    <AiControls trace={trace} />
                  </>
                )}
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted"><input type="checkbox" checked={s.compare} onChange={(e) => set({ compare: e.target.checked })} />{t('cutout.photo.ai.compare')}</label>
                {s.compare && (trace.aiSegmentation && trace.segmentation
                  ? <>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted"><input type="checkbox" checked={s.aiRefine} onChange={(e) => set({ aiRefine: e.target.checked })} />{t('cutout.photo.ai.refine')}</label>
                      <CompareTable classic={trace.segmentation} ai={trace.aiSegmentation} />
                    </>
                  : <p className="m-0 text-xs text-text-subtle" data-testid="compare-hint">{t('cutout.photo.ai.compareNeedsAi')}</p>)}
                {segmentation && segmentation.silhouettes.length === 0 && <Banner kind="warn">{t('cutout.photo.none')}</Banner>}
                <ul aria-label={t('cutout.photo.list')} className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-auto p-0">
                  {(segmentation?.silhouettes ?? []).map((sil) => (
                    <li key={sil.id} className="rounded-control border border-border bg-bg px-2 py-1">
                      <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={selected.includes(sil.id)} onChange={() => trace.toggle(sil.id)} />
                        <span>{t('cutout.photo.silhouette', { n: sil.id })}</span>
                        <span className="ml-auto font-mono text-xs text-text-muted">{fmt(sil.widthMm)} × {fmt(sil.heightMm)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <OutlineControls value={s.outline} onChange={(v) => set({ outline: { ...s.outline, ...v } })} count={vertices} />
                <span className="text-xs text-text-subtle">{t('cutout.photo.keepNote')}</span>
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-none items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button onClick={() => setStep((n) => (n > 1 ? ((n - 1) as Step) : n))} disabled={step === 1}>{t('cutout.photo.back')}</Button>
          {step < 3
            ? <Button primary onClick={() => setStep((n) => (n + 1) as Step)} disabled={!canNext}>{t('cutout.photo.next')}</Button>
            : <Button primary onClick={create} disabled={selected.length === 0}>{t('cutout.photo.create', { count: selected.length })}</Button>}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
