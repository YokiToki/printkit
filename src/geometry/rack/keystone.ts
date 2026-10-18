import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { KEYSTONE } from './spec'

/** Контур по часовой превращается в контур против часовой: Manifold с правилом по умолчанию принимает только положительные. */
function ccw(pts: [number, number][]): [number, number][] {
  let a = 0
  pts.forEach(([x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; a += x * y2 - x2 * y })
  return a < 0 ? [...pts].reverse() : pts
}

export interface KeystoneSocket {
  /** Обойма за пластиной (в системе сборки: пластина z 0…t, лицо сверху при z = t), центр по x, y — в начале координат. */
  collar: Manifold | null
  /** Вырез гнезда: проём с рампой и выемкой защёлки, сквозной от лица до конца обоймы. */
  pocket: Manifold
}

/**
 * Гнездо keystone в системе сборки корпуса (лицо пластины сверху, z = t; обойма растёт вниз, к оболочке). Начало — центр обоймы,
 * проём смещён вниз на `collarOffsetY`. Профиль по образцу: проём, рампа на верхней кромке, выемка защёлки на нижней.
 * Тела создаёт вызывающий и освобождает через delete.
 */
export function keystoneSocket(w: ManifoldToplevel, plateThickness: number, clearance: number = KEYSTONE.clearance): KeystoneSocket {
  const { Manifold, CrossSection } = w
  const K = KEYSTONE, W = K.openingW + clearance, H = K.openingH + clearance, hh = H / 2
  const D = K.depth, eps = 0.01
  // карман в «локальной» системе: лицо z = 0, глубина растёт в +z, проём по центру
  const base = Manifold.cube([W, H, D + 2], false).translate([-W / 2, -hh, -1])
  const rampCs: CrossSection = CrossSection.ofPolygons([ccw([
    [K.rampStart, hh - eps], [K.rampEnd, hh + K.rampRise], [K.rampHold, hh + K.rampRise], [K.rampHold, hh + K.rampTail], [D + 1, hh + K.rampTail], [D + 1, hh - eps],
  ])])
  // сечение лежит в плоскости (глубина, y); выдавливание по ширине и поворот вокруг y кладут глубину на ось z, ширину на x
  const ramp = Manifold.extrude(rampCs, W).translate([0, 0, -W / 2]).rotate([0, -90, 0])
  const notch = Manifold.cube([W, K.notchDepth + eps, K.notchTo - K.notchFrom], false).translate([-W / 2, -hh - K.notchDepth, K.notchFrom])
  const local = Manifold.union([base, ramp, notch]).translate([0, -K.collarOffsetY, 0])
  const pocket = local.mirror([0, 0, 1]).translate([0, 0, plateThickness])
  for (const m of [base, ramp, notch, local]) m.delete()
  rampCs.delete()
  // обойма: от задней грани пластины до глубины гнезда; верх заходит в пластину для сращивания
  const back = plateThickness - K.depth
  const collar = back < -1e-9
    ? Manifold.cube([K.collarW, K.collarH, -back + 0.5], false).translate([-K.collarW / 2, -K.collarH / 2, back])
    : null
  return { collar, pocket }
}

/** Размер гнезда в плоскости пластины (обойма): ширина и высота. */
export const keystoneFootprint = () => ({ w: KEYSTONE.collarW, h: KEYSTONE.collarH })
