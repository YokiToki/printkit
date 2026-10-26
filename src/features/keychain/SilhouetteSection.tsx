import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_AREA_LEVEL, defaultKeychain, type AreaMode, type AreaSetting, type MaskPreview, type SilhouetteParams } from '../../geometry/keychain'
import { Banner } from '../../ui/Banner'
import { Button } from '../../ui/Button'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { Section } from '../../ui/Section'
import { isChanged } from '../../ui/isChanged'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Select } from '../../ui/Select'
import { Toggle } from '../../ui/Toggle'
import { AiSilhouette } from './AiSilhouette'
import type { MatteControl } from './matte'

const MODES: AreaMode[] = ['follow', 'open', 'level']

/**
 * Силуэт: порог (авто или вручную), инверсия, смыкание, пятна, расширение, заливка областей и список областей
 * (замкнутый фон) с режимом каждой: по рельефу, открыта, свой уровень. Строка выбирается и подсвечивается на маске.
 * Макета нет: собрана из компонентов ui/.
 */
/** Сведения об изображении и ход ИИ для источника силуэта «ИИ»; без них секция работает как раньше (только яркость). */
export interface AiSource { control: MatteControl; imageSize: { width: number; height: number }; transparent: boolean; svg: boolean; logo: boolean }

export function SilhouetteSection({ value: s, threshold, preview, heightFloor = 0.06, goneAreas = [], selected = null, onSelect, onChange, aiSource }: {
  value: SilhouetteParams
  threshold: number | null
  preview: MaskPreview | null
  /** Минимальная высота рельефа: ниже неё уровень области не бывает. */
  heightFloor?: number
  /** Номера областей с настройками, которых больше нет. */
  goneAreas?: number[]
  selected?: number | null
  onSelect?: (id: number | null) => void
  onChange: (p: Partial<SilhouetteParams>) => void
  aiSource?: AiSource
}) {
  const { t } = useTranslation()
  const auto = s.threshold === 'auto'
  const areas = preview?.areas ?? []
  const settings = s.areas ?? {}
  // показывается действующий режим области из расчёта (автоматически открытая ИИ-областью тоже «Открыта»), а не только сохранённая настройка
  const get = (id: number): AreaSetting => settings[id] ?? (() => { const a = areas.find((x) => x.id === id); return { mode: a?.mode ?? 'follow', level: a?.level ?? DEFAULT_AREA_LEVEL } })()
  const setArea = (id: number, patch: Partial<AreaSetting>) => onChange({ areas: { ...settings, [id]: { ...get(id), ...patch } } })
  const [all, setAll] = useState<AreaSetting>({ mode: 'open', level: DEFAULT_AREA_LEVEL })
  const applyAll = () => onChange({ areas: Object.fromEntries(areas.map((a) => [a.id, { mode: all.mode, level: Math.max(all.level, heightFloor) }])) })
  const isAi = s.source === 'ai' && !!aiSource && !aiSource.svg
  const isFrame = s.source === 'frame' && !!aiSource && !aiSource.svg
  const summary = isFrame ? t('keychain.ai.frame') : isAi ? t('keychain.silhouette.summaryAi') : auto ? t('keychain.silhouette.summaryAuto', { value: threshold ?? '–' }) : t('keychain.silhouette.summary', { value: s.threshold })
  const modeOptions = MODES.map((m) => ({ value: m, label: t(`keychain.silhouette.areaModes.${m}`) }))
  return (
    <Section title={t('keychain.silhouette.title')} summary={summary} modified={isChanged(s, defaultKeychain.silhouette)} onReset={() => onChange({ ...defaultKeychain.silhouette })}>
      {aiSource && !aiSource.svg && (
        <div className="flex flex-col gap-1 text-xs text-text-muted">{t('keychain.ai.from')}
          <SegmentedControl<SilhouetteParams['source']> fill ariaLabel={t('keychain.ai.from')} value={isFrame ? 'frame' : isAi ? 'ai' : 'brightness'} onChange={(v) => onChange({ source: v })}
            options={[{ value: 'brightness', label: t('keychain.ai.brightness') }, { value: 'ai', label: t('keychain.ai.ai') }, { value: 'frame', label: t('keychain.ai.frame') }]} />
        </div>
      )}
      {isFrame && <p className="m-0 text-xs text-text-subtle" data-testid="frame-note">{t('keychain.ai.frameNote')}</p>}
      {aiSource?.transparent && !isFrame && <Banner>{t(isAi ? 'keychain.ai.transparent' : 'keychain.ai.transparentBrightness')}</Banner>}
      {isAi && aiSource?.logo && <Banner kind="warn">{t('keychain.ai.logo')}</Banner>}
      {isFrame ? null : isAi && aiSource ? <AiSilhouette control={aiSource.control} value={s} imageSize={aiSource.imageSize} onChange={onChange} /> : (
        <>
          <Toggle label={t('keychain.silhouette.auto')} checked={auto} onChange={(v) => onChange({ threshold: v ? 'auto' : (threshold ?? 128) })} />
          <NumberField label={t('keychain.silhouette.threshold')} value={auto ? (threshold ?? 128) : (s.threshold as number)} min={0} max={255} step={1} digits={0} disabled={auto}
            onChange={(v) => onChange({ threshold: v })} />
          <Toggle label={t('keychain.silhouette.invert')} checked={s.invert} onChange={(v) => onChange({ invert: v })} />
        </>
      )}
      {!isFrame && (
        <>
      <NumberField label={t('keychain.silhouette.close')} value={s.close} min={0} max={30} step={1} digits={0} unit="px" onChange={(v) => onChange({ close: v })} />
      <NumberField label={t('keychain.silhouette.speck')} value={s.speck} min={0} max={100000} step={50} digits={0} unit="px" onChange={(v) => onChange({ speck: v })} />
      <NumberField label={t('keychain.silhouette.grow')} value={s.grow} min={-30} max={30} step={1} digits={0} unit="px" onChange={(v) => onChange({ grow: v })} />
      <Toggle label={t('keychain.silhouette.fillHoles')} checked={s.fillHoles} onChange={(v) => onChange({ fillHoles: v })} />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">{t('keychain.silhouette.areas')}</span>
        {areas.length === 0 && <span className="text-xs text-text-subtle">{t('keychain.silhouette.noAreas')}</span>}
        {goneAreas.length > 0 && <Banner kind="warn">{t('keychain.warning.areaGone', { ids: goneAreas.join(', ') })}</Banner>}
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {areas.map((a) => {
            const cur = get(a.id), on = selected === a.id
            return (
              <li key={a.id} data-testid={`area-${a.id}`} aria-current={on ? 'true' : undefined}
                className={`flex flex-col gap-1.5 rounded-control border bg-bg px-2 py-1.5 ${on ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]' : 'border-border'}`}>
                <button type="button" aria-pressed={on} aria-label={t('keychain.silhouette.selectArea', { id: a.id })} onClick={() => onSelect?.(on ? null : a.id)}
                  className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent p-0 text-left text-xs text-text">
                  <span>{t('keychain.silhouette.areaRow', { id: a.id, size: a.size })}</span>
                </button>
                <div className={cur.mode === 'level' && s.fillHoles ? 'grid grid-cols-2 gap-2' : ''}>
                  <Select label={t('keychain.silhouette.areaMode', { id: a.id })} value={s.fillHoles ? cur.mode : 'open'} disabled={!s.fillHoles} options={modeOptions}
                    onChange={(v) => setArea(a.id, { mode: v as AreaMode })} />
                  {cur.mode === 'level' && s.fillHoles && (
                    <LengthField label={t('keychain.silhouette.areaLevel', { id: a.id })} value={Math.max(cur.level, heightFloor)} min={heightFloor} max={20} step={0.1}
                      onChange={(v) => setArea(a.id, { level: v })} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {areas.length > 0 && s.fillHoles && (
          <div className="flex flex-col gap-2 rounded-control border border-border p-2">
            <span className="text-xs font-medium text-text-muted">{t('keychain.silhouette.all.title')}</span>
            <div className={all.mode === 'level' ? 'grid grid-cols-2 gap-2' : ''}>
              <Select label={t('keychain.silhouette.all.mode')} value={all.mode} options={modeOptions} onChange={(v) => setAll((o) => ({ ...o, mode: v as AreaMode }))} />
              {all.mode === 'level' && <LengthField label={t('keychain.silhouette.all.level')} value={Math.max(all.level, heightFloor)} min={heightFloor} max={20} step={0.1} onChange={(v) => setAll((o) => ({ ...o, level: v }))} />}
            </div>
            <Button onClick={applyAll}>{t('keychain.silhouette.all.apply')}</Button>
          </div>
        )}
        {areas.some((a) => get(a.id).mode === 'level') && <span className="text-xs text-text-subtle">{t('keychain.silhouette.levelHint')}</span>}
      </div>
        </>
      )}
    </Section>
  )
}
