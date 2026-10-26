import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultSource, resolvePhoto, type KeychainInfo, type KeychainParams } from '../../geometry/keychain'
import { applyIntensity, INTENSITY_IDS, intensityOf, type IntensityId } from '../../geometry/photoPresets'
import type { DetailMode } from '../../geometry/photoRelief'
import { applySubject, chooseSubject, SUBJECT_IDS, subjectOf, type PictureStats, type SubjectId } from '../../geometry/subjects'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { Select } from '../../ui/Select'
import { Toggle } from '../../ui/Toggle'
import { AiStatus } from '../cutout/photo/AiStatus'
import { openModelManager } from '../ml/managerState'
import type { DepthControl } from './depth'

export interface PhotoPanel {
  depth: DepthControl
  /** Выбор предмета по картинке включён: сбрасывается при любой правке значений. */
  subjectAuto: boolean
  onSubjectAuto: (on: boolean) => void
  /** Показатели картинки для автоматического выбора. */
  stats: PictureStats | null
}

const COLORS = ['var(--color-accent)', 'var(--color-success-text)', 'var(--color-warn-text)']

/**
 * Рельеф «Фото»: предмет и сила (пресеты), смесь контура, глубины и деталей долями, глубина (модель, запуск, пометки), детали
 * (усиление, радиус в мм, режим, порог тёмного, уровни), привязка к краям, предел наклона и итоговое сглаживание. Любая правка
 * значений переводит выбор предмета в «Свой» и выключает автоматический выбор. Макета нет: собран из ui/ и токенов темы.
 */
export function PhotoReliefBlock({ params: p, apply, info, panel, imageId }: {
  params: KeychainParams
  /** Применяет функцию к параметрам режима. */
  apply: (f: (p: KeychainParams) => KeychainParams) => void
  info: KeychainInfo | null
  panel: PhotoPanel
  imageId: string
}) {
  const { t } = useTranslation()
  const s = resolvePhoto(p.source)
  const { depth, subjectAuto, onSubjectAuto, stats } = panel
  const subject = subjectOf(p), intensity = intensityOf(p)
  const edit = (f: (p: KeychainParams) => KeychainParams) => { if (subjectAuto) onSubjectAuto(false); apply(f) }
  const patchSource = (v: Partial<KeychainParams['source']>) => edit((o) => ({ ...o, source: { ...defaultSource, ...o.source, ...v } }))
  const setMix = (k: 'contour' | 'depth' | 'detail', v: number) => patchSource({ mix: { ...s.mix, [k]: v } })

  // автоматический выбор предмета: один раз на изображение, пока он включён; правка значений его выключает
  const decided = useRef<string>('')
  useEffect(() => {
    if (!subjectAuto || !stats || decided.current === imageId) return
    decided.current = imageId
    const id = chooseSubject(stats)
    if (subjectOf(p) !== id) apply((o) => applySubject(id, o))
    // выбор по картинке — раз на изображение
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectAuto, stats, imageId])

  const sum = s.mix.contour + s.mix.depth + s.mix.detail || 1
  const errorKey = depth.error ? (['noModel', 'unavailable', 'noColour'].includes(depth.error) ? depth.error : 'failed') : null
  const cell = info?.cell ?? null
  const coarse = cell !== null && s.boost > 0 && s.mix.detail > 0 && cell > s.boostRadius / 3
  const smallFace = subject === 'face' && info?.size && info.size[0] > 0 && info.size[0] < 25
  const subjectOptions = [...SUBJECT_IDS.map((id) => ({ value: id as string, label: t(`keychain.photo.subject.${id}`) })), ...(subject === null ? [{ value: 'custom', label: t('keychain.photo.subject.custom') }] : [])]
  const intensityOptions = [...INTENSITY_IDS.map((id) => ({ value: id as string, label: t(`keychain.photo.intensity.${id}`) })), ...(intensity === null ? [{ value: 'custom', label: t('keychain.photo.intensity.custom') }] : [])]

  return (
    <div className="flex flex-col gap-3" data-testid="photo-relief">
      <Select label={t('keychain.photo.subject.label')} value={subject ?? 'custom'} options={subjectOptions}
        onChange={(v) => { if (v !== 'custom') { onSubjectAuto(false); apply((o) => applySubject(v as SubjectId, o)) } }} />
      <Toggle label={t('keychain.photo.subject.auto')} checked={subjectAuto} onChange={onSubjectAuto} />
      <Select label={t('keychain.photo.intensity.label')} value={intensity ?? 'custom'} options={intensityOptions}
        onChange={(v) => { if (v !== 'custom') edit((o) => applyIntensity(v as IntensityId, o)) }} />

      <div className="flex flex-col gap-1.5" role="group" aria-label={t('keychain.photo.mix.title')}>
        <span className="text-xs font-medium text-text-muted">{t('keychain.photo.mix.title')}</span>
        <div role="img" aria-label={t('keychain.photo.mix.bar')} data-testid="mix-bar" className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3">
          {(['contour', 'depth', 'detail'] as const).map((k, i) => <span key={k} data-testid={`mix-${k}`} style={{ width: `${(s.mix[k] / sum) * 100}%`, background: COLORS[i] }} />)}
        </div>
        {(['contour', 'depth', 'detail'] as const).map((k) => (
          <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-2">
            <label className="flex flex-col gap-0.5 text-xs text-text-muted">{t(`keychain.photo.mix.${k}`)}
              <input type="range" min={0} max={100} step={1} value={s.mix[k]} aria-label={t(`keychain.photo.mix.${k}`)} onChange={(e) => setMix(k, Number(e.target.value))} className="w-full cursor-pointer accent-accent" />
            </label>
            <span className="w-10 text-right font-mono text-xs text-text">{Math.round((s.mix[k] / sum) * 100)} %</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-border p-2" data-testid="photo-depth">
        <span className="text-xs font-medium text-text-muted">{t('keychain.photo.depth.title')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button primary onClick={() => void depth.run()} disabled={!depth.model || depth.running}>{depth.depth ? t('keychain.photo.depth.recompute') : t('keychain.photo.depth.compute')}</Button>
          <button type="button" onClick={openModelManager} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent-text underline">{t('cutout.photo.ai.models')}</button>
        </div>
        {!depth.model && <p className="m-0 text-xs text-text-muted" data-testid="depth-hint">{t('keychain.photo.depth.needModel')}</p>}
        {depth.model && <p className="m-0 text-xs text-text-subtle">{t('keychain.photo.depth.using', { name: depth.model.name })}</p>}
        <p className="m-0 text-xs text-text-subtle">{t('keychain.photo.depth.hint')}</p>
        <AiStatus />
        {errorKey && <Banner kind="error">{t(`keychain.photo.depth.error.${errorKey}`)}</Banner>}
        {depth.lost && <Banner kind="warn">{t('keychain.photo.depth.lost')}</Banner>}
        {!depth.lost && info?.depthMissing && <p className="m-0 text-xs text-text-subtle" data-testid="depth-missing">{t('keychain.photo.depth.missing')}</p>}
        {depth.staleCrop && <p className="m-0 text-xs text-warn-text" data-testid="depth-stale">{t('keychain.photo.depth.stale')}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text-muted">{t('keychain.photo.detail.title')}</span>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t('keychain.photo.detail.boost')} value={s.boost} min={0} max={10} step={0.25} digits={2} onChange={(v) => patchSource({ boost: v })} />
          <LengthField label={t('keychain.photo.detail.radius')} value={s.boostRadius} min={0.2} max={10} step={0.1} onChange={(v) => patchSource({ boostRadius: v })} />
        </div>
        <Select label={t('keychain.photo.detail.mode')} value={s.detailMode} options={(['engrave', 'relief', 'both'] as DetailMode[]).map((m) => ({ value: m, label: t(`keychain.photo.detail.${m}`) }))} onChange={(v) => patchSource({ detailMode: v as DetailMode })} />
        {s.detailMode !== 'relief' && <NumberField label={t('keychain.photo.detail.dark')} value={s.darkThreshold} min={0} max={0.95} step={0.05} digits={2} onChange={(v) => patchSource({ darkThreshold: v })} />}
        <div className="grid grid-cols-2 gap-2">
          <NumberField label={t('keychain.photo.detail.levels')} value={s.levels} min={0} max={8} step={1} digits={0} onChange={(v) => patchSource({ levels: v === 1 ? 2 : v })} />
          <NumberField label={t('keychain.photo.detail.softness')} value={s.levelSoftness} min={0} max={1} step={0.1} digits={2} disabled={s.levels < 2} onChange={(v) => patchSource({ levelSoftness: v })} />
        </div>
        {coarse && <Banner kind="warn">{t('keychain.photo.hints.coarse')}</Banner>}
        {smallFace && <Banner kind="warn">{t('keychain.photo.hints.smallFace')}</Banner>}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <NumberField label={t('keychain.photo.shaping.snap')} value={s.snap} min={0} max={100} step={5} digits={0} unit="%" onChange={(v) => patchSource({ snap: v })} />
        <NumberField label={t('keychain.photo.shaping.slope')} value={s.maxSlope} min={0} max={89} step={5} digits={0} unit="°" onChange={(v) => patchSource({ maxSlope: v })} />
        <LengthField label={t('keychain.photo.shaping.smooth')} value={s.finalSmooth} min={0} max={3} step={0.05} onChange={(v) => patchSource({ finalSmooth: v })} />
      </div>
    </div>
  )
}

