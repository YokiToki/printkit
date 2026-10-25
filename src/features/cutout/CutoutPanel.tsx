import { log } from '../../app/activityLog'
import { useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowDown, IconArrowUp, IconCopy, IconEye, IconEyeOff, IconPhoto, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react'
import {
  addCutout, cutoutBounds, cutoutLayout, cutoutNotices, duplicateCutout, moveCutout, circleCutout, rectCutout, removeCutout, toggleCutout, updateCutout, validateCutout, MIN_MARGIN,
  type Cutout, type CutoutParams, type MeshSource,
} from '../../geometry/cutout'
import { alignEdge, centerCutout, distribute, fitFootprint, type Side } from '../../geometry/cutout-placement'
import { defaultOrientation, describeMesh, flatFaces, type IndexedMesh, type Orientation } from '../../geometry/stl-import'
import { defaultBoxThickness } from '../../geometry/box'
import type { LipStyle } from '../../geometry/profiles'
import { Section } from '../../ui/Section'
import { isChanged } from '../../ui/isChanged'
import { LengthField } from '../../ui/LengthField'
import { NumberField } from '../../ui/NumberField'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { Select } from '../../ui/Select'
import { Toggle } from '../../ui/Toggle'
import { Banner } from '../../ui/Banner'
import { formatLength, useUnit } from '../../ui/units'
import { BoxSizeSection } from '../box/BoxSizeSection'
import { FastenerSection } from '../fasteners/FastenerSection'
import { TopView } from './TopView'
import { cutoutColorVar } from './palette'
import { PhotoDialog } from './photo/PhotoDialog'
import { withTraced } from './photo/createCutouts'
import { usePhotoTrace } from './photo/usePhotoTrace'

export interface CutoutPanelProps {
  params: CutoutParams
  onChange: Dispatch<SetStateAction<CutoutParams>>
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Сетки в памяти: нужны для граней и размеров детали. */
  meshes: Map<string, IndexedMesh>
  onImport: (file: File) => void
  importMessage?: { kind: 'error' | 'warn' | 'info'; text: string } | null
  /** Положение во время перетаскивания: показывается в полях, но модель не пересчитывается. */
  draft: { id: string; x: number; y: number } | null
  onDraft: (d: { id: string; x: number; y: number } | null) => void
  snap: boolean
  onSnap: (v: boolean) => void
  generationError?: string | null
}

export function CutoutPanel({ params, onChange, selectedId, onSelect, meshes, onImport, importMessage, draft, onDraft, snap, onSnap, generationError }: CutoutPanelProps) {
  const { t } = useTranslation()
  const { unit } = useUnit()
  const [margin, setMargin] = useState(5)
  const file = useRef<HTMLInputElement>(null)
  const photo = usePhotoTrace()
  const [photoOpen, setPhotoOpen] = useState(false)
  const photoBtn = useRef<HTMLButtonElement>(null)
  const closePhoto = () => { setPhotoOpen(false); setTimeout(() => photoBtn.current?.focus(), 0) }
  const [over, setOver] = useState(false)
  const shown: CutoutParams = draft ? { ...params, cutouts: updateCutout(params.cutouts, draft.id, { x: draft.x, y: draft.y }) } : params
  const l = cutoutLayout(params)
  const { errors } = validateCutout(params)
  const issues = cutoutNotices(params)
  const sel = shown.cutouts.find((c) => c.id === selectedId) ?? null
  const fmt = (mm: number) => `${formatLength(mm, unit)} ${t(`units.${unit}`)}`
  const nameOf = (id: string) => params.cutouts.find((c) => c.id === id)?.name ?? ''
  const setList = (f: (l: Cutout[]) => Cutout[]) => onChange((o) => ({ ...o, cutouts: f(o.cutouts) }))
  const patch = (id: string, p: Partial<Cutout>) => setList((l_) => updateCutout(l_, id, p))
  const update = (f: (o: CutoutParams) => CutoutParams) => onChange(f)

  const add = () => {
    const c = rectCutout({ name: t('cutout.list.defaultName'), depth: Math.min(10, l.maxDepth) })
    setList((l_) => addCutout(l_, c))
    onSelect(c.id)
  }
  const addCircle = () => {
    const c = circleCutout({ name: t('cutout.list.defaultCircle'), depth: Math.min(10, l.maxDepth) })
    setList((l_) => addCutout(l_, c))
    onSelect(c.id)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) onImport(f)
  }
  const setSource = (id: string, s: Partial<MeshSource>) => {
    const c = params.cutouts.find((x) => x.id === id)
    if (!c || c.source.kind !== 'mesh') return
    const next = { ...c.source, ...s } as MeshSource
    const mesh = meshes.get(next.meshId)
    if (mesh) { const info = describeMesh(mesh.vertProperties, next.unit, next.orientation); next.size = info.size; next.hull = info.hull }
    patch(id, { source: next })
  }
  const rotateStep = (c: Cutout & { source: MeshSource }, axis: 'rx' | 'ry' | 'rz') => setSource(c.id, { orientation: { ...c.source.orientation, [axis]: (c.source.orientation[axis] + 1) % 4 } })
  const faces = (c: Cutout) => (c.source.kind === 'mesh' && meshes.get(c.source.meshId) ? flatFaces(meshes.get(c.source.meshId)!) : [])
  const cav = { x: l.cavityX, y: l.cavityY }
  const apply = (f: (c: Cutout) => Cutout) => sel && patch(sel.id, (({ x, y }) => ({ x, y }))(f(sel)))
  const summary = t('cutout.list.summary', { n: params.cutouts.length })
  const issueText = (i: { id: string; key: string; other?: string }) =>
    t(i.key, { name: nameOf(i.id), other: i.other ? nameOf(i.other) : '', min: fmt(MIN_MARGIN), value: fmt(l.maxDepth) })

  return (
    <>
      <BoxSizeSection params={params} errors={errors} update={update} />
      <Section title={t('box.walls.title')} summary={t('box.walls.summary', { w: fmt(params.thickness.outerWall), f: fmt(params.thickness.floor) })} modified={isChanged(params.thickness, defaultBoxThickness)}
        onReset={() => update((o) => ({ ...o, thickness: defaultBoxThickness }))}>
        <LengthField label={t('box.walls.outer')} value={params.thickness.outerWall} min={0.4} max={10} step={0.05} onChange={(v) => update((o) => ({ ...o, thickness: { ...o.thickness, outerWall: v } }))} />
        <LengthField label={t('box.walls.floor')} value={params.thickness.floor} min={0} max={20} step={0.1} onChange={(v) => update((o) => ({ ...o, thickness: { ...o.thickness, floor: v } }))} />
      </Section>
      <Section title={t('box.lip.title')} summary={t('box.lip.summary', { style: t(`box.lip.${params.lip}`) })} modified={isChanged(params.lip, 'default')} onReset={() => update((o) => ({ ...o, lip: 'default' }))}>
        <SegmentedControl fill ariaLabel={t('box.lip.style')} value={params.lip} onChange={(v: LipStyle) => update((o) => ({ ...o, lip: v }))}
          options={(['default', 'thin', 'none'] as const).map((v) => ({ value: v, label: t(`box.lip.${v}`) }))} />
        <Banner>{t('box.lip.help')}</Banner>
      </Section>

      {photoOpen && (
        <PhotoDialog trace={photo} maxDepth={l.maxDepth} onClose={closePhoto}
          onCreate={(created) => { if (!created.length) return; log.info('photo', 'log.photo.cutouts', { count: created.length }); onChange((o) => withTraced(o, created)); onSelect(created[0].id); closePhoto() }} />
      )}

      <Section title={t('cutout.list.title')} summary={summary}>
        <div onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          className={`flex flex-col gap-3 rounded-control ${over ? 'outline-2 outline-dashed outline-accent' : ''}`}>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={add} aria-label={t('cutout.list.add')} className="inline-flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-border-strong bg-surface-2 px-2 font-medium text-text hover:bg-surface-3"><IconPlus size={16} stroke={1.75} className="flex-none" /><span className="truncate">{t('cutout.list.rectangle')}</span></button>
            <button type="button" onClick={addCircle} aria-label={t('cutout.list.addCircle')} className="inline-flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-border-strong bg-surface-2 px-2 font-medium text-text hover:bg-surface-3"><IconPlus size={16} stroke={1.75} className="flex-none" /><span className="truncate">{t('cutout.list.circle')}</span></button>
            <button type="button" onClick={() => file.current?.click()} className="inline-flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-accent bg-accent-muted px-2 font-medium text-white hover:brightness-110"><IconUpload size={16} stroke={1.75} className="flex-none" /><span className="truncate">{t('cutout.list.import')}</span></button>
            <button ref={photoBtn} type="button" onClick={() => setPhotoOpen(true)} className="inline-flex h-9 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-accent bg-accent-muted px-2 font-medium text-white hover:brightness-110"><IconPhoto size={16} stroke={1.75} className="flex-none" /><span className="truncate">{t('cutout.list.fromPhoto')}</span></button>
            <input ref={file} type="file" accept=".stl,model/stl,application/sla" hidden data-testid="stl-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
          </div>
          <span className="text-xs text-text-subtle">{t('cutout.list.drop')}</span>
          {importMessage && <Banner kind={importMessage.kind === 'info' ? 'info' : importMessage.kind === 'warn' ? 'warn' : 'error'}>{importMessage.text}</Banner>}
          {params.cutouts.length === 0 && <span className="text-xs text-text-subtle">{t('cutout.list.empty')}</span>}
          <ul aria-label={t('cutout.list.label')} className="m-0 flex list-none flex-col gap-1 p-0">
            {params.cutouts.map((c, i) => (
              <li key={c.id} data-selected={c.id === selectedId || undefined}
                className={`flex items-center gap-1 rounded-control border px-1.5 py-1 ${c.id === selectedId ? 'border-accent bg-accent-muted/40' : 'border-border bg-bg'} ${c.visible ? '' : 'opacity-60'}`}>
                <span aria-hidden data-testid="cutout-swatch" data-color={c.color ?? 0} className="ml-0.5 h-3 w-3 flex-none rounded-xs" style={{ background: cutoutColorVar(c.color) }} />
                <button type="button" aria-label={t('cutout.list.select', { name: c.name })} aria-pressed={c.id === selectedId} onClick={() => onSelect(c.id)} className="min-w-0 flex-1 cursor-pointer truncate border-0 bg-transparent px-1 text-left text-text">{c.name}</button>
                <IconBtn label={c.visible ? t('cutout.list.hide') : t('cutout.list.show')} onClick={() => setList((l_) => toggleCutout(l_, c.id))}>{c.visible ? <IconEye size={16} stroke={1.75} /> : <IconEyeOff size={16} stroke={1.75} />}</IconBtn>
                <IconBtn label={t('cutout.list.moveUp')} disabled={i === 0} onClick={() => setList((l_) => moveCutout(l_, c.id, -1))}><IconArrowUp size={16} stroke={1.75} /></IconBtn>
                <IconBtn label={t('cutout.list.moveDown')} disabled={i === params.cutouts.length - 1} onClick={() => setList((l_) => moveCutout(l_, c.id, 1))}><IconArrowDown size={16} stroke={1.75} /></IconBtn>
                <IconBtn label={t('cutout.list.duplicate')} onClick={() => setList((l_) => duplicateCutout(l_, c.id))}><IconCopy size={16} stroke={1.75} /></IconBtn>
                <IconBtn label={t('cutout.list.remove')} onClick={() => { setList((l_) => removeCutout(l_, c.id)); if (c.id === selectedId) onSelect(null) }}><IconTrash size={16} stroke={1.75} /></IconBtn>
              </li>
            ))}
          </ul>
          {issues.length > 0 && (
            <div className="flex flex-col gap-2">
              {issues.map((i, k) => <Banner key={k} kind="warn">{issueText(i)}</Banner>)}
            </div>
          )}
          {generationError && <Banner kind="error">{t('cutout.error.generation', { message: generationError })}</Banner>}
        </div>
      </Section>

      {sel && (
        <Section title={t('cutout.props.title')} summary={sel.name}>
          <label className="flex flex-col gap-1 text-xs text-text-muted">{t('cutout.props.name')}
            <input value={sel.name} onChange={(e) => setList((l_) => updateCutout(l_, sel.id, { name: e.target.value }))} className="h-8 rounded-control border border-border-strong bg-bg px-2 text-[13px] text-text" />
          </label>
          {sel.source.kind === 'rect' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <LengthField label={t('cutout.props.width')} value={sel.source.width} min={1} max={300} onChange={(v) => patch(sel.id, { source: { ...sel.source, width: v } as Cutout['source'] })} />
                <LengthField label={t('cutout.props.length')} value={sel.source.length} min={1} max={300} onChange={(v) => patch(sel.id, { source: { ...sel.source, length: v } as Cutout['source'] })} />
              </div>
              <LengthField label={t('cutout.props.radius')} value={sel.source.radius} min={0} max={100} step={0.5} onChange={(v) => patch(sel.id, { source: { ...sel.source, radius: v } as Cutout['source'] })} />
            </>
          ) : sel.source.kind === 'outline' ? (
            <div data-testid="traced-size" className="text-xs text-text-muted">{t('cutout.props.tracedSize', { w: fmt(sel.source.size.w), l: fmt(sel.source.size.l) })}</div>
          ) : sel.source.kind === 'circle' ? (
            <LengthField label={t('cutout.props.diameter')} value={sel.source.diameter} min={1} max={300} onChange={(v) => patch(sel.id, { source: { ...sel.source, diameter: v } as Cutout['source'] })} />
          ) : (
            <MeshProps c={sel as Cutout & { source: MeshSource }} hasMesh={meshes.has(sel.source.meshId)} faces={faces(sel)} setSource={(s) => setSource(sel.id, s)} rotateStep={(a) => rotateStep(sel as Cutout & { source: MeshSource }, a)} fmt={fmt} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <LengthField label={t('cutout.props.x')} value={sel.x} min={-500} max={500} step={0.5} onChange={(v) => patch(sel.id, { x: v })} />
            <LengthField label={t('cutout.props.y')} value={sel.y} min={-500} max={500} step={0.5} onChange={(v) => patch(sel.id, { y: v })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumberField label={t('cutout.props.rotation')} value={sel.rotation} min={-360} max={360} step={5} digits={1} onChange={(v) => patch(sel.id, { rotation: v })} />
            <LengthField label={t('cutout.props.depth')} value={sel.depth} min={0.5} max={200} step={0.5} onChange={(v) => patch(sel.id, { depth: v })} />
            <LengthField label={t('cutout.props.clearance')} value={sel.clearance} min={0} max={5} step={0.05} onChange={(v) => patch(sel.id, { clearance: v })} />
          </div>
        </Section>
      )}

      <Section title={t('cutout.place.title')}>
        <div className="grid grid-cols-3 gap-1.5">
          <SmallBtn disabled={!sel} onClick={() => apply((c) => centerCutout(c, 'both'))}>{t('cutout.place.center')}</SmallBtn>
          <SmallBtn disabled={!sel} onClick={() => apply((c) => centerCutout(c, 'x'))}>{t('cutout.place.centerX')}</SmallBtn>
          <SmallBtn disabled={!sel} onClick={() => apply((c) => centerCutout(c, 'y'))}>{t('cutout.place.centerY')}</SmallBtn>
        </div>
        <LengthField label={t('cutout.place.margin')} value={margin} min={0} max={50} step={1} onChange={setMargin} />
        <span className="text-xs font-semibold text-text-muted">{t('cutout.place.alignTo')}</span>
        <div className="grid grid-cols-4 gap-1.5">
          {(['left', 'right', 'front', 'back'] as const).map((s: Side) => (
            <SmallBtn key={s} disabled={!sel} onClick={() => apply((c) => alignEdge(c, s, margin, cav))}>{t(`cutout.place.align${s[0].toUpperCase()}${s.slice(1)}`)}</SmallBtn>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <SmallBtn disabled={params.cutouts.filter((c) => c.visible).length < 2} onClick={() => setList((l_) => distribute(l_, 'x', cav, margin))}>{t('cutout.place.distributeX')}</SmallBtn>
          <SmallBtn disabled={params.cutouts.filter((c) => c.visible).length < 2} onClick={() => setList((l_) => distribute(l_, 'y', cav, margin))}>{t('cutout.place.distributeY')}</SmallBtn>
        </div>
        <SmallBtn disabled={params.cutouts.filter((c) => c.visible).length === 0} onClick={() => update((o) => { const f = fitFootprint(o); return f ? { ...o, x: f.x, y: f.y, cutouts: f.cutouts } : o })}>{t('cutout.place.fit')}</SmallBtn>
        <span className="text-xs text-text-subtle">{t('cutout.place.fitHint')}</span>
        <Toggle label={t('cutout.place.snap')} checked={snap} onChange={onSnap} />
      </Section>

      <Section title={t('cutout.view.title')}>
        <TopView params={shown} selectedId={selectedId} snap={snap} onSelect={onSelect}
          onDrag={(id, x, y) => onDraft({ id, x, y })} onCommit={(id, x, y) => { onDraft(null); patch(id, { x, y }) }} />
      </Section>

      <FastenerSection config={params.fasteners} footprint={l.fp} onChange={(f) => update((o) => ({ ...o, fasteners: f }))} />
    </>
  )
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-text-muted hover:bg-surface-3 hover:text-text disabled:cursor-default disabled:opacity-40">{children}</button>
}
function SmallBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-control border border-border-strong bg-surface-2 px-2 py-1 text-center text-xs leading-tight text-text hover:bg-surface-3 disabled:cursor-default disabled:opacity-50">{children}</button>
}

function MeshProps({ c, hasMesh, faces, setSource, rotateStep, fmt }: {
  c: Cutout & { source: MeshSource }
  hasMesh: boolean
  faces: { normal: [number, number, number]; area: number }[]
  setSource: (s: Partial<MeshSource>) => void
  rotateStep: (axis: 'rx' | 'ry' | 'rz') => void
  fmt: (mm: number) => string
}) {
  const { t } = useTranslation()
  const o = c.source.orientation
  const current = o.faceDown ? faces.findIndex((f) => f.normal.every((v, i) => Math.abs(v - o.faceDown![i]) < 1e-6)) : -1
  const setFace = (v: string) => {
    const orientation: Orientation = v === 'free' ? { ...o, faceDown: null } : { ...o, faceDown: faces[Number(v)].normal }
    setSource({ orientation })
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-xs text-text-subtle">{t('cutout.props.file', { name: c.source.filename })}</span>
      <span className="font-mono text-xs text-text-subtle">{t('cutout.props.size', { x: fmt(c.source.size[0]), y: fmt(c.source.size[1]), z: fmt(c.source.size[2]) })}</span>
      {!hasMesh && <Banner kind="warn">{t('cutout.props.meshMissing')}</Banner>}
      <SegmentedControl fill ariaLabel={t('cutout.props.unit')} value={c.source.unit} onChange={(u) => setSource({ unit: u })}
        options={[{ value: 'mm', label: t('cutout.props.mm') }, { value: 'in', label: t('cutout.props.in') }]} />
      <SegmentedControl fill ariaLabel={t('cutout.props.mode')} value={c.source.mode} onChange={(m) => setSource({ mode: m })}
        options={[{ value: 'projected', label: t('cutout.props.projected') }, { value: '3d', label: t('cutout.props.full3d') }]} />
      {c.source.mode === '3d' && <span className="text-xs text-text-subtle">{t('cutout.props.mode3dNote')}</span>}
      {faces.length > 0 && (
        <Select label={t('cutout.props.layFlat')} value={current >= 0 ? String(current) : 'free'} onChange={setFace}
          options={[{ value: 'free', label: t('cutout.props.freeFace') }, ...faces.map((f, i) => ({ value: String(i), label: t('cutout.props.face', { n: i + 1, area: Math.round(f.area) }) }))]} />
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {(['rx', 'ry', 'rz'] as const).map((a) => (
          <button key={a} type="button" onClick={() => rotateStep(a)} className="min-h-8 cursor-pointer rounded-control border border-border-strong bg-surface-2 px-1 py-1 text-xs leading-tight text-text hover:bg-surface-3">{t(`cutout.props.rotate${a[1].toUpperCase()}`)}</button>
        ))}
      </div>
    </div>
  )
}

export { defaultOrientation, cutoutBounds }
