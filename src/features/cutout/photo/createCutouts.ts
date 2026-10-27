import { addCutout, outlineCutout, type Cutout, type CutoutParams } from '../../../geometry/cutout'
import { fitFootprintUnits } from '../../../geometry/cutout-placement'
import { fitOutline, type FitParams } from '../../../geometry/outlineFit'
import { traceSilhouette } from '../../../geometry/photo/outline'
import type { Segmentation } from '../../../geometry/photo/segment'

export interface CreateOptions {
  /** Глубина карманов и зазор, мм. */
  depth: number
  clearance: number
  /** Имя по номеру силуэта (1, 2, …) среди созданных. */
  name: (n: number) => string
  /** Параметры подгонки контура: не задано — подгонка с умолчаниями; usePolyline=true — исходная полилиния без подгонки. */
  fit?: Partial<FitParams>
}

/** Выбранные силуэты → вырезы-контуры на своих местах листа (центр листа — нуль), без цветов: цвет назначает addCutout. */
export function tracedCutouts(seg: Segmentation, ids: readonly number[], paper: { width: number; height: number }, o: CreateOptions): Cutout[] {
  const out: Cutout[] = []
  for (const id of ids) {
    const t = traceSilhouette(seg, id, paper)
    if (!t) continue
    const points = o.fit?.usePolyline ? t.points : fitOutline(t.points, o.fit)
    out.push(outlineCutout({
      name: o.name(out.length + 1), x: t.center[0], y: t.center[1], depth: o.depth, clearance: o.clearance,
      source: { kind: 'outline', points, size: { w: t.size.w, l: t.size.l } },
    }))
  }
  return out
}

/**
 * Добавляет вырезы к параметрам (существующие остаются; цвета назначаются обычным правилом) и подгоняет размер корпуса целыми
 * юнитами под все видимые вырезы. Вырезы остаются на тех же местах друг относительно друга.
 */
export function withTraced(p: CutoutParams, created: Cutout[]): CutoutParams {
  const added = created.reduce((list, c) => addCutout(list, c), p.cutouts)
  const next = { ...p, cutouts: added }
  const fit = fitFootprintUnits(next)
  return fit ? { ...next, x: fit.x, y: fit.y, cutouts: fit.cutouts } : next
}
