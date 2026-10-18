import { useTranslation } from 'react-i18next'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { CASE_LIMITS, type RackCaseParams } from '../../geometry/rack/case'
import { defaultOpeningGroup, MAX_GROUPS, OPENING_KINDS, OPENING_LIMITS, OPENING_ZONES, type OpeningGroup } from '../../geometry/rack/openings'
import type { Issue } from '../../geometry/rack/patterns/types'
import { Section } from '../../ui/Section'
import { isChanged } from '../../ui/isChanged'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { Select } from '../../ui/Select'
import { Button } from '../../ui/Button'
import { Toggle } from '../../ui/Toggle'
import { Banner } from '../../ui/Banner'
import { formatLength, useUnit } from '../../ui/units'
import type { CasePatch } from './CasePanel'

const pick = (p: RackCaseParams) => ({ window: p.window, openings: p.openings })
const caption = 'm-0 text-xs font-semibold tracking-wide text-text-muted uppercase'

/** Передняя панель: блок «Окно» и блок «Keystone и отверстия» со списком групп; что не помещается, сообщается и не режется. */
export function CaseFrontSection({ params: p, defaults, errors, warnings, update }: { params: RackCaseParams; defaults: RackCaseParams; errors: string[]; warnings: Issue[]; update: CasePatch }) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const fmt = (mm: number) => `${formatLength(mm, unit)} ${t(`units.${unit}`)}`
  const summary = t('rack.case.front.summary', {
    window: p.window.enabled ? t('rack.case.front.windowOn', { lip: fmt(p.window.lip) }) : t('rack.case.front.windowOff'),
    groups: p.openings.length ? t('rack.case.front.groupsSummary', { n: p.openings.length }) : '',
  })
  const setGroup = (i: number, patch: Partial<OpeningGroup>) => update((o) => ({ ...o, openings: o.openings.map((g, j) => (j === i ? { ...g, ...patch } : g)) }))
  return (
    <Section title={t('rack.case.front.title')} summary={summary} modified={isChanged(pick(p), pick(defaults))} onReset={() => update((o) => ({ ...o, ...pick(defaults) }))}>
      <h4 className={caption}>{t('rack.case.front.windowTitle')}</h4>
      <Toggle label={t('rack.case.front.window')} checked={p.window.enabled} onChange={(v) => update((o) => ({ ...o, window: { ...o.window, enabled: v } }))} />
      {p.window.enabled && <LengthField label={t('rack.case.front.lip')} value={p.window.lip} min={CASE_LIMITS.lip[0]} max={CASE_LIMITS.lip[1]} step={0.5} error={errors.includes('rack.error.lip') ? t('rack.case.error.lip') : undefined} onChange={(v) => update((o) => ({ ...o, window: { ...o.window, lip: v } }))} />}
      <h4 className={`${caption} mt-1`}>{t('rack.case.front.openingsTitle')}</h4>
      {p.openings.length === 0 && <p className="m-0 text-xs text-text-muted">{t('rack.case.front.empty')}</p>}
      {errors.includes('rack.error.openings') && <Banner kind="warn">{t('rack.case.error.openings')}</Banner>}
      {p.openings.map((g, i) => (
        <div key={i} role="group" aria-label={t('rack.case.front.group', { n: i + 1 })} className="flex flex-col gap-2 rounded-group border border-border bg-bg p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">{t('rack.case.front.group', { n: i + 1 })}</span>
            <button type="button" aria-label={t('rack.case.front.remove', { n: i + 1 })} title={t('rack.case.front.remove', { n: i + 1 })} onClick={() => update((o) => ({ ...o, openings: o.openings.filter((_, j) => j !== i) }))}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface-2 text-text-muted hover:bg-surface-3 hover:text-text">
              <IconTrash size={16} stroke={1.75} />
            </button>
          </div>
          <Select label={`${t('rack.case.front.kind')} (${i + 1})`} value={g.kind} onChange={(v) => setGroup(i, { kind: v as OpeningGroup['kind'] })} options={OPENING_KINDS.map((k) => ({ value: k, label: t(`rack.case.front.${k}`) }))} />
          <NumberField label={`${t('rack.case.front.count')} (${i + 1})`} value={g.count} min={OPENING_LIMITS.count[0]} max={OPENING_LIMITS.count[1]} digits={0} onChange={(v) => setGroup(i, { count: Math.round(v) })} />
          <NumberField label={`${t('rack.case.front.perRow')} (${i + 1})`} value={g.perRow} min={OPENING_LIMITS.perRow[0]} max={OPENING_LIMITS.perRow[1]} digits={0} onChange={(v) => setGroup(i, { perRow: Math.round(v) })} />
          <Select label={`${t('rack.case.front.zone')} (${i + 1})`} value={g.zone} onChange={(v) => setGroup(i, { zone: v as OpeningGroup['zone'] })} options={OPENING_ZONES.map((z) => ({ value: z, label: t(`rack.case.front.${z}`) }))} />
          {g.kind === 'hole' && <LengthField label={`${t('rack.case.front.diameter')} (${i + 1})`} value={g.diameter} min={OPENING_LIMITS.diameter[0]} max={OPENING_LIMITS.diameter[1]} step={0.5} onChange={(v) => setGroup(i, { diameter: v })} />}
          {warnings.some((w) => w.key === 'rack.warning.fit' && w.setting === `group${i + 1}`) && <Banner kind="warn">{t('rack.warning.fit', { setting: t('rack.case.front.group', { n: i + 1 }) })}</Banner>}
        </div>
      ))}
      <Button disabled={p.openings.length >= MAX_GROUPS} onClick={() => update((o) => ({ ...o, openings: [...o.openings, { ...defaultOpeningGroup }] }))}>
        <IconPlus size={16} stroke={1.75} />{t('rack.case.front.add')}
      </Button>
      <Banner>{t('rack.case.front.help')}</Banner>
    </Section>
  )
}
