import { useTranslation } from 'react-i18next'
import { PANEL_LIMITS, type RackPanelParams } from '../../geometry/rack/panel'
import { PATTERN_KINDS, type PatternKind, type PatternParams } from '../../geometry/rack/patterns/types'
import type { Issue } from '../../geometry/rack/patterns/types'
import { Section } from '../../ui/Section'
import { isChanged } from '../../ui/isChanged'
import { LengthField } from '../../ui/LengthField'
import { Select } from '../../ui/Select'
import { Toggle } from '../../ui/Toggle'
import { Banner } from '../../ui/Banner'
import type { PanelPatch } from './RackPanel'

/** Поля выбранного узора: ключ в params.pattern[kind], имя поля (rack.field.*), пределы и шаг. */
const FIELDS: Record<Exclude<PatternKind, 'none'>, { key: string; min: number; max: number; step: number }[]> = {
  skadis: [{ key: 'slotWidth', min: 1, max: 30, step: 0.5 }, { key: 'slotLength', min: 1, max: 60, step: 0.5 }, { key: 'pitch', min: 5, max: 120, step: 1 }, { key: 'rowStep', min: 2, max: 60, step: 1 }, { key: 'shift', min: 0, max: 120, step: 1 }],
  hex: [{ key: 'width', min: 2, max: 40, step: 0.5 }, { key: 'wall', min: 0.2, max: 10, step: 0.1 }],
  pills: [{ key: 'width', min: 2, max: 40, step: 0.5 }, { key: 'length', min: 2, max: 80, step: 0.5 }, { key: 'wall', min: 0.2, max: 10, step: 0.1 }],
  lines: [{ key: 'height', min: 1, max: 30, step: 0.5 }, { key: 'wall', min: 0.2, max: 10, step: 0.1 }],
  hicks: [{ key: 'width', min: 6, max: 80, step: 1 }, { key: 'stroke', min: 0.2, max: 6, step: 0.1 }, { key: 'gap', min: 0.2, max: 6, step: 0.1 }],
  asanoha: [{ key: 'width', min: 6, max: 80, step: 1 }, { key: 'mainWidth', min: 0.2, max: 6, step: 0.1 }, { key: 'detailWidth', min: 0, max: 6, step: 0.1 }],
  passthrough: [{ key: 'borderX', min: 0, max: 100, step: 0.5 }, { key: 'borderY', min: 0, max: 40, step: 0.5 }, { key: 'radius', min: 0, max: 20, step: 0.5 }],
}

/**
 * Поля сквозного узора: вид, поле, поворот и настройки выбранного узора; предупреждения о тонких стенках и ошибки. Не знает, где стоит
 * узор: панель, пол полки и пластина полки передают свой `PatternParams` и получают новый. `regionError` — ключ ошибки «нет места».
 */
export function PatternFields({ pattern: pat, onChange, errors, warnings, regionError = 'rack.error.region', buildError, kindLabel }: {
  pattern: PatternParams; onChange: (p: PatternParams) => void; errors: string[]; warnings: Issue[]; regionError?: string; /** Ключ ошибки построения (узор разрезал деталь). */ buildError: string | null; kindLabel?: string
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<PatternParams>) => onChange({ ...pat, ...patch })
  const setField = (k: Exclude<PatternKind, 'none'>, key: string, v: number | boolean) => onChange({ ...pat, [k]: { ...pat[k], [key]: v } })
  const kind = pat.kind
  const marginError = errors.includes('rack.error.margin') ? t('rack.error.margin') : undefined
  return (
    <>
      <Select label={kindLabel ?? t('rack.pattern.kind')} value={kind} onChange={(v) => set({ kind: v as PatternKind })}
        options={PATTERN_KINDS.map((k) => ({ value: k, label: t(`rack.pattern.kinds.${k}`) }))} />
      {kind !== 'none' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <LengthField label={t('rack.field.margin')} value={pat.margin} min={PANEL_LIMITS.margin[0]} max={PANEL_LIMITS.margin[1]} step={0.5} error={marginError} onChange={(v) => set({ margin: v })} />
            {FIELDS[kind].map(({ key, min, max, step }) => {
              const group = pat[kind] as unknown as Record<string, number>
              return <LengthField key={key} label={t(`rack.field.${key}`)} value={group[key]} min={min} max={max} step={step} onChange={(v) => setField(kind, key, v)} />
            })}
          </div>
          {kind === 'hicks' && <Toggle label={t('rack.field.edgeCells')} checked={pat.hicks.edgeCells} onChange={(v) => setField('hicks', 'edgeCells', v)} />}
          {kind === 'pills' && <Toggle label={t('rack.field.edgePills')} checked={pat.pills.edgePills} onChange={(v) => setField('pills', 'edgePills', v)} />}
          <Toggle label={t('rack.pattern.rotate')} checked={pat.rotate} onChange={(v) => set({ rotate: v })} />
          <Banner>{t('rack.pattern.help')}</Banner>
          {kind === 'asanoha' && <Banner>{t('rack.pattern.asanohaHelp')}</Banner>}
          {kind === 'hicks' && <Banner>{t('rack.pattern.hicksHelp')}</Banner>}
          {errors.includes(regionError) && <Banner kind="warn">{t(regionError)}</Banner>}
          {buildError === 'rack.error.disconnected' && <Banner kind="warn">{t('rack.error.disconnected')}</Banner>}
          {warnings.map((w, i) => <Banner key={`${w.key}${w.setting}${i}`} kind="warn">{t(w.key, { setting: t(`rack.field.${w.setting}`) })}</Banner>)}
        </>
      )}
    </>
  )
}

/** Сквозной узор панели: секция вокруг PatternFields. */
export function PatternSection({ params: p, defaults, errors, warnings, buildError, update }: {
  params: RackPanelParams; defaults: RackPanelParams; errors: string[]; warnings: Issue[]; /** Ключ ошибки построения (узор разрезал панель). */ buildError: string | null; update: PanelPatch
}) {
  const { t } = useTranslation()
  return (
    <Section title={t('rack.pattern.title')} summary={t('rack.pattern.summary', { kind: t(`rack.pattern.kinds.${p.pattern.kind}`) })}
      modified={isChanged(p.pattern, defaults.pattern)} onReset={() => update((o) => ({ ...o, pattern: defaults.pattern }))}>
      <PatternFields pattern={p.pattern} onChange={(pattern) => update((o) => ({ ...o, pattern }))} errors={errors} warnings={warnings} buildError={buildError} />
    </Section>
  )
}
