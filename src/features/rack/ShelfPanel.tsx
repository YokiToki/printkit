import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultRackShelf, shelfLayout, validateRackShelf, SHELF_LIMITS, type RackShelfParams } from '../../geometry/rack/shelf'
import { MAX_UNITS, MIN_UNITS } from '../../geometry/rack/spec'
import { Section } from '../../ui/Section'
import { isChanged } from '../../ui/isChanged'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { Toggle } from '../../ui/Toggle'
import { Banner } from '../../ui/Banner'
import { formatLength, useUnit } from '../../ui/units'
import { EarsSection } from './EarsSection'

export type ShelfPatch = (f: (o: RackShelfParams) => RackShelfParams) => void

const platePick = (p: RackShelfParams) => ({ units: p.units, thickness: p.thickness, cornerRadius: p.cornerRadius, tolerance: p.tolerance })
const bodyPick = (p: RackShelfParams) => ({ shelf: p.shelf, lips: p.lips })

/** Панель параметров режима «Полка» Rack Master: передняя панель, полка с бортиками, уши. */
export function ShelfPanel({ params: p, onChange }: { params: RackShelfParams; onChange: Dispatch<SetStateAction<RackShelfParams>> }) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const { errors } = validateRackShelf(p)
  const d = defaultRackShelf, l = shelfLayout(p)
  const fmt = (mm: number) => `${formatLength(mm, unit)} ${t(`units.${unit}`)}`
  const err = (key: string) => (errors.includes(key) ? t(key) : undefined)
  const update: ShelfPatch = onChange
  return (
    <>
      <Section title={t('rack.shelf.plate.title')} summary={t('rack.shelf.plate.summary', { u: p.units, h: fmt(l.plateH) })}
        modified={isChanged(platePick(p), platePick(d))} onReset={() => update((o) => ({ ...o, ...platePick(d) }))}>
        <NumberField label={t('rack.size.units')} value={p.units} min={MIN_UNITS} max={MAX_UNITS} digits={0} error={err('rack.error.units')} onChange={(v) => update((o) => ({ ...o, units: Math.round(v) }))} />
        <div className="grid grid-cols-2 gap-2">
          <LengthField label={t('rack.size.thickness')} value={p.thickness} min={SHELF_LIMITS.thickness[0]} max={SHELF_LIMITS.thickness[1]} step={0.1} error={err('rack.error.thickness')} onChange={(v) => update((o) => ({ ...o, thickness: v }))} />
          <LengthField label={t('rack.size.cornerRadius')} value={p.cornerRadius} min={SHELF_LIMITS.cornerRadius[0]} max={SHELF_LIMITS.cornerRadius[1]} step={0.5} error={err('rack.error.cornerRadius')} onChange={(v) => update((o) => ({ ...o, cornerRadius: v }))} />
        </div>
        <Toggle label={t('rack.size.tolerance')} checked={p.tolerance} onChange={(v) => update((o) => ({ ...o, tolerance: v }))} />
        <Banner>{t('rack.size.toleranceHelp')}</Banner>
      </Section>
      <Section title={t('rack.shelf.body.title')} summary={t('rack.shelf.body.summary', { d: fmt(p.shelf.depth), lips: p.lips.height > 0 ? t('rack.shelf.body.lipsOn', { h: fmt(p.lips.height) }) : t('rack.shelf.body.lipsOff') })}
        modified={isChanged(bodyPick(p), bodyPick(d))} onReset={() => update((o) => ({ ...o, ...bodyPick(d) }))}>
        <div className="grid grid-cols-2 gap-2">
          <LengthField label={t('rack.shelf.body.depth')} value={p.shelf.depth} min={SHELF_LIMITS.depth[0]} max={SHELF_LIMITS.depth[1]} step={5} error={err('rack.error.shelfDepth')} onChange={(v) => update((o) => ({ ...o, shelf: { ...o.shelf, depth: v } }))} />
          <LengthField label={t('rack.shelf.body.thickness')} value={p.shelf.thickness} min={SHELF_LIMITS.shelfThickness[0]} max={SHELF_LIMITS.shelfThickness[1]} step={0.1} error={err('rack.error.shelfThickness')} onChange={(v) => update((o) => ({ ...o, shelf: { ...o.shelf, thickness: v } }))} />
        </div>
        <LengthField label={t('rack.shelf.body.clearance')} value={p.shelf.clearance} min={SHELF_LIMITS.clearance[0]} max={SHELF_LIMITS.clearance[1]} step={0.05} error={err('rack.error.clearance')} onChange={(v) => update((o) => ({ ...o, shelf: { ...o.shelf, clearance: v } }))} />
        <Banner>{t('rack.shelf.body.width', { w: fmt(l.width) })}</Banner>
        <div className="grid grid-cols-2 gap-2">
          <LengthField label={t('rack.shelf.body.lipHeight')} value={p.lips.height} min={SHELF_LIMITS.lipHeight[0]} max={SHELF_LIMITS.lipHeight[1]} step={1} error={err('rack.error.lipHeight')} onChange={(v) => update((o) => ({ ...o, lips: { ...o.lips, height: v } }))} />
          {p.lips.height > 0 && <LengthField label={t('rack.shelf.body.lipWall')} value={p.lips.wall} min={SHELF_LIMITS.lipWall[0]} max={SHELF_LIMITS.lipWall[1]} step={0.1} error={err('rack.error.lipWall')} onChange={(v) => update((o) => ({ ...o, lips: { ...o.lips, wall: v } }))} />}
        </div>
        <Banner>{t('rack.shelf.body.help')}</Banner>
      </Section>
      <EarsSection ears={p.ears} defaults={d.ears} errors={errors} onChange={(ears) => onChange((o) => ({ ...o, ears }))} />
      {errors.length > 0 && <Banner kind="warn">{t('rack.error.invalid')}</Banner>}
    </>
  )
}
