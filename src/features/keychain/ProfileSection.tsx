import { useTranslation } from 'react-i18next'
import { BRIGHTNESS_SMOOTH_DEFAULT, defaultKeychain, MAX_SMOOTH, smoothResolution, type HeightSource, type KeychainInfo, type KeychainParams, type ReliefParams, type SourceParams } from '../../geometry/keychain'
import { applyPreset, PROFILE_KINDS, presetOf, type ProfileKind } from '../../geometry/patterns/profile'
import { Section } from '../../ui/Section'
import { isChanged } from '../../ui/isChanged'
import { Select } from '../../ui/Select'
import { Toggle } from '../../ui/Toggle'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { formatLength, useUnit } from '../../ui/units'
import { PhotoReliefBlock, type PhotoPanel } from './PhotoReliefBlock'

/** Рельеф: источник высоты (расстояние или яркость), пресет профиля (после правки значений — «Свой») и параметры профиля. Макета нет: собрана из ui/. */
export function ProfileSection({ relief: r, source: s, error, onRelief, onSource, cell = null, minCell = null, onRaise, photo }: {
  relief: ReliefParams
  source: SourceParams
  error: (field: string) => string | undefined
  onRelief: (p: Partial<ReliefParams>) => void
  onSource: (p: Partial<SourceParams>) => void
  /** Шаг сетки и самый мелкий шаг по бюджету: нужны для предупреждения «радиус меньше ячейки». */
  cell?: number | null
  minCell?: number | null
  onRaise?: (cell: number) => void
  /** Источник «Фото» (только режим «Изображение», не SVG): параметры целиком и ход глубины; без него источника «Фото» нет. */
  photo?: { panel: PhotoPanel; params: KeychainParams; apply: (f: (p: KeychainParams) => KeychainParams) => void; info: KeychainInfo | null; imageId: string }
}) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const preset = presetOf(r)
  const presetOptions = [
    ...PROFILE_KINDS.map((k) => ({ value: k as string, label: t(`keychain.profile.presets.${k}`) })),
    ...(preset === 'custom' ? [{ value: 'custom', label: t('keychain.profile.presets.custom') }] : []),
  ]
  const summary = t('keychain.relief.summary', { h: formatLength(r.hmax, unit), e: formatLength(r.edgeWidth, unit), u: t(`units.${unit}`) })
  // радиус сглаживания меньше ячейки сетки: на этом разрешении он ничего не меняет
  const warn = (radius: number | undefined) => {
    const res = cell && minCell !== null ? smoothResolution(radius ?? 0, cell, minCell) : null
    if (!res?.noEffect) return null
    const u = t(`units.${unit}`)
    return (
      <>
        <Banner kind="warn">{t('keychain.smoothing.noEffect', { cell: formatLength(cell!, unit), u })}</Banner>
        {res.canRaise && onRaise && <Button onClick={() => onRaise(res.raiseTo)}>{t('keychain.smoothing.raise', { cell: formatLength(res.raiseTo, unit), u })}</Button>}
      </>
    )
  }
  const usesPow = r.profile === 'bevel' || r.profile === 'engraved'
  return (
    <Section title={t('keychain.relief.title')} summary={summary} modified={isChanged({ relief: r, source: s }, { relief: defaultKeychain.relief, source: defaultKeychain.source })} onReset={() => { onRelief({ ...defaultKeychain.relief }); onSource({ ...defaultKeychain.source }) }}>
      <SegmentedControl fill ariaLabel={t('keychain.profile.source')} value={s.kind} onChange={(v: HeightSource) => onSource({ kind: v, ...((v === 'brightness' || v === 'photo') && !((s.smooth ?? 0) > 0) ? { smooth: BRIGHTNESS_SMOOTH_DEFAULT } : {}) })}
        options={[{ value: 'distance', label: t('keychain.profile.sources.distance') }, { value: 'brightness', label: t('keychain.profile.sources.brightness') }, ...(photo ? [{ value: 'photo' as HeightSource, label: t('keychain.profile.sources.photo') }] : [])]} />
      {s.kind === 'photo' && photo && <PhotoReliefBlock params={photo.params} apply={photo.apply} info={photo.info} panel={photo.panel} imageId={photo.imageId} />}
      {(s.kind === 'brightness' || s.kind === 'photo') && (
        <>
          <NumberField label={t('keychain.profile.contrast')} value={s.contrast} min={0.1} max={5} step={0.1} digits={2} error={error('source.contrast')} onChange={(v) => onSource({ contrast: v })} />
          <NumberField label={t('keychain.profile.gamma')} value={s.gamma} min={0.1} max={5} step={0.1} digits={2} error={error('source.gamma')} onChange={(v) => onSource({ gamma: v })} />
          <Toggle label={t('keychain.profile.invert')} checked={s.invert} onChange={(v) => onSource({ invert: v })} />
          <LengthField label={t('keychain.profile.smooth')} value={s.smooth ?? 0} min={0} max={MAX_SMOOTH} step={0.1} error={error('source.smooth')} onChange={(v) => onSource({ smooth: v })} />
          {warn(s.smooth)}
          <Toggle label={t('keychain.profile.despeckle')} checked={s.despeckle === true} onChange={(v) => onSource({ despeckle: v })} />
        </>
      )}
      <Select label={t('keychain.profile.preset')} value={preset} options={presetOptions}
        onChange={(v) => { if (v !== 'custom') onRelief(applyPreset(r, v as ProfileKind)) }} />
      <LengthField label={t('keychain.relief.hmax')} value={r.hmax} min={0.2} max={20} step={0.1} error={error('relief.hmax')} onChange={(v) => onRelief({ hmax: v })} />
      <LengthField label={t('keychain.relief.edgeWidth')} value={r.edgeWidth} min={0.2} max={40} step={0.5} error={error('relief.edgeWidth')} onChange={(v) => onRelief({ edgeWidth: v })} />
      {usesPow && <NumberField label={t('keychain.relief.pow')} value={r.pow} min={0.1} max={3} step={0.05} digits={2} error={error('relief.pow')} onChange={(v) => onRelief({ pow: v })} />}
      {r.profile === 'terrace' && <NumberField label={t('keychain.profile.steps')} value={r.steps} min={1} max={12} step={1} digits={0} error={error('relief.steps')} onChange={(v) => onRelief({ steps: v })} />}
      <LengthField label={t('keychain.relief.smooth')} value={r.smooth ?? 0} min={0} max={MAX_SMOOTH} step={0.1} error={error('relief.smooth')} onChange={(v) => onRelief({ smooth: v })} />
      <span className="-mt-1 text-xs text-text-subtle">{t('keychain.relief.smoothHint')}</span>
      {warn(r.smooth)}
      <LengthField label={t('keychain.relief.heightFloor')} value={r.heightFloor} min={0} max={20} step={0.02} error={error('relief.heightFloor')} onChange={(v) => onRelief({ heightFloor: v })} />
    </Section>
  )
}
