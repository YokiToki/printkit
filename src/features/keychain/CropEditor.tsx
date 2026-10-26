import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { fullCrop, type Crop } from '../../geometry/keychain'
import type { GrayImage } from '../../geometry/raster/threshold'
import { Button } from '../../ui/Button'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { drawGray } from '../cutout/photo/drawGray'
import { ASPECT_RATIO, dragCrop, fitSubject, HANDLES, isFullCrop, nudgeCrop, type AspectLock, type Box, type Handle } from './cropMath'

const POS: Record<Handle, string> = {
  move: '', nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize', n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
  ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize', e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize', s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
  sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize', w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
}

/**
 * Кадрирование поверх изображения: рамка с ручками по углам и сторонам, перенос, фиксация пропорций, «По предмету» (по габариту
 * маски ИИ) и сброс. Изображение не меняется: кадр — параметр, по которому дальше строятся силуэт, рельеф и превью. Ручки доступны
 * с клавиатуры (стрелки 1 %, с Shift 5 %). Макета нет: собран из ui/ и токенов темы.
 */
export function CropEditor({ image, crop, onChange, subjectBox }: { image: GrayImage; crop: Crop; onChange: (c: Crop) => void; subjectBox: Box | null }) {
  const { t } = useTranslation()
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [lock, setLock] = useState<AspectLock>('free')
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Crop } | null>(null)
  const aspect = ASPECT_RATIO[lock], imageAspect = image.width / image.height

  useEffect(() => { drawGray(canvas.current, image, 480) }, [image])

  const down = (handle: Handle) => (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { handle, x: e.clientX, y: e.clientY, start: crop }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current, r = box.current?.getBoundingClientRect()
    if (!d || !r || !r.width || !r.height) return
    onChange(dragCrop(d.start, d.handle, (e.clientX - d.x) / r.width, (e.clientY - d.y) / r.height, aspect, imageAspect))
  }
  const up = () => { drag.current = null }
  const key = (handle: Handle) => (e: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    onChange(nudgeCrop(crop, handle, e.key as 'ArrowLeft', e.shiftKey, aspect, imageAspect))
  }
  // смена пропорций применяется к текущему окну сразу (по короткой стороне, вокруг середины)
  const setLockAndApply = (v: AspectLock) => {
    setLock(v)
    const r = ASPECT_RATIO[v]
    if (r !== null) onChange(fitSubject({ x0: crop.x, y0: crop.y, x1: crop.x + crop.w, y1: crop.y + crop.h }, 0, r, imageAspect))
  }
  const pct = (v: number) => `${(v * 100).toFixed(4)}%`
  return (
    <div className="flex flex-col gap-2" data-testid="crop-editor">
      <p className="m-0 text-xs text-text-subtle">{t('keychain.crop.hint')}</p>
      <div ref={box} className="relative w-full touch-none select-none overflow-hidden rounded-control border border-border bg-bg" style={{ aspectRatio: `${image.width} / ${image.height}` }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <canvas ref={canvas} role="img" aria-label={t('keychain.crop.label')} className="block h-full w-full" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black/50" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${pct(crop.x)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y)})` }} />
        <div data-testid="crop-rect" className="absolute border-2 border-accent" style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}>
          <button type="button" data-testid="crop-move" aria-label={t('keychain.crop.move')} onPointerDown={down('move')} onKeyDown={key('move')} className="absolute inset-0 cursor-move border-0 bg-transparent p-0" />
          {HANDLES.map((h) => (
            <button key={h} type="button" data-testid={`crop-${h}`} aria-label={t(`keychain.crop.handle.${h}`)} onPointerDown={down(h)} onKeyDown={key(h)}
              className={`absolute h-3.5 w-3.5 rounded-xs border border-accent bg-surface-1 p-0 ${POS[h]}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<AspectLock> ariaLabel={t('keychain.crop.aspect')} value={lock} onChange={setLockAndApply}
          options={[{ value: 'free', label: t('keychain.crop.free') }, { value: '1:1', label: '1:1' }, { value: '4:3', label: '4:3' }, { value: '3:4', label: '3:4' }]} />
        <Button onClick={() => onChange(fitSubject(subjectBox!, 0.05, aspect, imageAspect))} disabled={!subjectBox} title={subjectBox ? undefined : t('keychain.crop.fitNeedsAi')}>{t('keychain.crop.fit')}</Button>
        <Button onClick={() => { setLock('free'); onChange({ ...fullCrop }) }} disabled={isFullCrop(crop)}>{t('keychain.crop.reset')}</Button>
      </div>
      {!subjectBox && <p className="m-0 text-[11px] text-text-subtle" data-testid="crop-fit-hint">{t('keychain.crop.fitNeedsAi')}</p>}
      <span className="font-mono text-[11px] text-text-muted" data-testid="crop-readout">{t('keychain.crop.readout', { w: Math.round(crop.w * 100), h: Math.round(crop.h * 100) })}</span>
    </div>
  )
}
