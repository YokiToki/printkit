import type { Bounds3 } from '../geometry/mesh'
import { matrixOf, type EditorObject, type Mat4, type Transform } from './scene'

export type { Bounds3 }

/**
 * Вычисляет габариты (AABB) при трансформации произвольного AABB матрицей 4x4.
 */
export function transformBounds(bounds: Bounds3, m: Mat4): Bounds3 {
  const corners: [number, number, number][] = [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
  ]

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (const [x, y, z] of corners) {
    const tx = m[0] * x + m[4] * y + m[8] * z + m[12]
    const ty = m[1] * x + m[5] * y + m[9] * z + m[13]
    const tz = m[2] * x + m[6] * y + m[10] * z + m[14]

    if (tx < minX) minX = tx
    if (tx > maxX) maxX = tx
    if (ty < minY) minY = ty
    if (ty > maxY) maxY = ty
    if (tz < minZ) minZ = tz
    if (tz > maxZ) maxZ = tz
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  }
}

/**
 * Оценивает локальные габариты для примитивов (по умолчанию центрированы по XY, стоят на z=0).
 */
export function defaultPrimitiveBounds(object: EditorObject): Bounds3 {
  if (object.source.kind === 'primitive') {
    const p = object.source.params
    switch (object.source.shape) {
      case 'box': {
        const w = p.width ?? 20
        const d = p.depth ?? 20
        const h = p.height ?? 20
        return { min: [-w / 2, -d / 2, 0], max: [w / 2, d / 2, h] }
      }
      case 'cylinder': {
        const r = (p.diameter ?? 20) / 2
        const h = p.height ?? 20
        return { min: [-r, -r, 0], max: [r, r, h] }
      }
      case 'cone': {
        const r = (p.bottomDiameter ?? 20) / 2
        const h = p.height ?? 20
        return { min: [-r, -r, 0], max: [r, r, h] }
      }
      case 'sphere': {
        const r = (p.diameter ?? 20) / 2
        return { min: [-r, -r, 0], max: [r, r, 2 * r] }
      }
      case 'torus': {
        const R = (p.diameter ?? 30) / 2
        const r = (p.tubeDiameter ?? 6) / 2
        return { min: [-(R + r), -(R + r), 0], max: [R + r, R + r, 2 * r] }
      }
      case 'wedge': {
        const w = p.width ?? 20
        const d = p.depth ?? 20
        const h = p.height ?? 20
        return { min: [-w / 2, -d / 2, 0], max: [w / 2, d / 2, h] }
      }
    }
  }
  return { min: [-10, -10, 0], max: [10, 10, 20] }
}

/**
 * Вычисляет мировые габариты объекта с учётом его трансформации.
 */
export function boundsOf(object: EditorObject, localBounds?: Bounds3): Bounds3 {
  const base = localBounds ?? defaultPrimitiveBounds(object)
  const m = matrixOf(object.transform)
  return transformBounds(base, m)
}

/**
 * Вычисляет объединённые мировые габариты для списка объектов.
 */
export function selectionBounds(
  objects: EditorObject[],
  getLocalBounds?: (obj: EditorObject) => Bounds3 | undefined
): Bounds3 | null {
  if (objects.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (const obj of objects) {
    const b = boundsOf(obj, getLocalBounds?.(obj))
    if (b.min[0] < minX) minX = b.min[0]
    if (b.min[1] < minY) minY = b.min[1]
    if (b.min[2] < minZ) minZ = b.min[2]
    if (b.max[0] > maxX) maxX = b.max[0]
    if (b.max[1] > maxY) maxY = b.max[1]
    if (b.max[2] > maxZ) maxZ = b.max[2]
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  }
}

/**
 * Опускает объект на стол: его минимальная Z-координата становится равной 0. X и Y не меняются.
 */
export function dropToBed(object: EditorObject, localBounds?: Bounds3): EditorObject {
  const b = boundsOf(object, localBounds)
  const zMin = b.min[2]
  return {
    ...object,
    transform: {
      ...object.transform,
      position: [object.transform.position[0], object.transform.position[1], object.transform.position[2] - zMin],
    },
  }
}

/**
 * Центрирует объект на столе: центр по X и Y становится равным 0. Z не меняется.
 */
export function centerOnBed(object: EditorObject, localBounds?: Bounds3): EditorObject {
  const b = boundsOf(object, localBounds)
  const cx = (b.min[0] + b.max[0]) / 2
  const cy = (b.min[1] + b.max[1]) / 2
  return {
    ...object,
    transform: {
      ...object.transform,
      position: [object.transform.position[0] - cx, object.transform.position[1] - cy, object.transform.position[2]],
    },
  }
}

/**
 * Зеркалит объект относительно заданной оси с сохранением мировых габаритов (на месте).
 * Возвращает флаг `flipWinding: true`, если детерминант масштабирования отрицателен.
 */
export function mirror(
  object: EditorObject,
  axis: 'x' | 'y' | 'z',
  localBounds?: Bounds3
): { object: EditorObject; flipWinding: boolean } {
  const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const oldBounds = boundsOf(object, localBounds)
  const oldCenter = (oldBounds.min[axisIdx] + oldBounds.max[axisIdx]) / 2

  const newScale: [number, number, number] = [...object.transform.scale]
  newScale[axisIdx] = -newScale[axisIdx]

  // Вычисляем новый центр объекта без сдвига позиции
  const tempObj: EditorObject = {
    ...object,
    transform: { ...object.transform, scale: newScale },
  }
  const tempBounds = boundsOf(tempObj, localBounds)
  const tempCenter = (tempBounds.min[axisIdx] + tempBounds.max[axisIdx]) / 2

  const delta = oldCenter - tempCenter
  const newPosition: [number, number, number] = [...object.transform.position]
  newPosition[axisIdx] += delta

  const det = newScale[0] * newScale[1] * newScale[2]

  return {
    object: {
      ...object,
      transform: {
        ...object.transform,
        position: newPosition,
        scale: newScale,
      },
    },
    flipWinding: det < 0,
  }
}

/**
 * Масштабирует объект до заданного размера по оси с сохранением центра.
 */
export function scaleToSize(
  object: EditorObject,
  axis: 'x' | 'y' | 'z',
  targetSize: number,
  lockProportions: boolean,
  localBounds?: Bounds3
): EditorObject {
  const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const b = boundsOf(object, localBounds)
  const currentSize = b.max[axisIdx] - b.min[axisIdx]
  if (currentSize <= 0 || targetSize <= 0) return object

  const factor = targetSize / currentSize
  const oldCenter: [number, number, number] = [
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  ]

  const newScale: [number, number, number] = [...object.transform.scale]
  if (lockProportions) {
    newScale[0] *= factor
    newScale[1] *= factor
    newScale[2] *= factor
  } else {
    newScale[axisIdx] *= factor
  }

  const tempObj: EditorObject = {
    ...object,
    transform: { ...object.transform, scale: newScale },
  }
  const tempBounds = boundsOf(tempObj, localBounds)
  const tempCenter: [number, number, number] = [
    (tempBounds.min[0] + tempBounds.max[0]) / 2,
    (tempBounds.min[1] + tempBounds.max[1]) / 2,
    (tempBounds.min[2] + tempBounds.max[2]) / 2,
  ]

  return {
    ...object,
    transform: {
      ...object.transform,
      position: [
        object.transform.position[0] + (oldCenter[0] - tempCenter[0]),
        object.transform.position[1] + (oldCenter[1] - tempCenter[1]),
        object.transform.position[2] + (oldCenter[2] - tempCenter[2]),
      ],
      scale: newScale,
    },
  }
}

/**
 * Привязка значения к шагу сетки.
 */
export function snapValue(val: number, step: number): number {
  if (step <= 0) return val
  const snapped = Math.round(val / step) * step
  return Number(snapped.toFixed(8))
}

/**
 * Привязка угла к шагу градусов.
 */
export function snapAngle(deg: number, step: number): number {
  if (step <= 0) return deg
  const snapped = Math.round(deg / step) * step
  return Number(snapped.toFixed(8))
}

/**
 * Извлекает углы Эйлера (intrinsic XYZ в градусах) из матрицы вращения 3x3.
 */
function eulerXYZFromMat3(
  m00: number,
  m10: number,
  m20: number,
  m01: number,
  m11: number,
  m21: number,
  m02: number,
  m12: number,
  m22: number
): [number, number, number] {
  const sinY = Math.max(-1, Math.min(1, m02))
  const ry = Math.asin(sinY)

  let rx: number
  let rz: number

  if (Math.abs(sinY) < 0.9999999) {
    rx = Math.atan2(-m12, m22)
    rz = Math.atan2(-m01, m00)
  } else {
    rx = Math.atan2(m21, m11)
    rz = 0
  }

  const toDeg = (rad: number) => {
    const deg = (rad * 180) / Math.PI
    return deg === 0 ? 0 : Number(deg.toFixed(8))
  }

  return [toDeg(rx), toDeg(ry), toDeg(rz)]
}

/**
 * Вращает трансформацию вокруг произвольной точки `pivot` на угол `angleDeg` вокруг заданной оси.
 */
export function rotateAbout(
  transform: Transform,
  angleDeg: number,
  axis: 'x' | 'y' | 'z',
  pivot: [number, number, number]
): Transform {
  const rad = (angleDeg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)

  // 1. Поворот вектора положения относительно pivot
  const vx = transform.position[0] - pivot[0]
  const vy = transform.position[1] - pivot[1]
  const vz = transform.position[2] - pivot[2]

  let rxPos = vx
  let ryPos = vy
  let rzPos = vz

  if (axis === 'z') {
    rxPos = vx * c - vy * s
    ryPos = vx * s + vy * c
  } else if (axis === 'y') {
    rxPos = vx * c + vz * s
    rzPos = -vx * s + vz * c
  } else {
    ryPos = vy * c - vz * s
    rzPos = vy * s + vz * c
  }

  const newPosition: [number, number, number] = [
    Number((pivot[0] + rxPos).toFixed(8)),
    Number((pivot[1] + ryPos).toFixed(8)),
    Number((pivot[2] + rzPos).toFixed(8)),
  ]

  // 2. Поворот ориентации: R_new = R_delta * R_old
  const mOld = matrixOf({
    position: [0, 0, 0],
    rotation: transform.rotation,
    scale: [1, 1, 1],
  })

  // mOld: 3x3 column-major
  const o00 = mOld[0],
    o10 = mOld[1],
    o20 = mOld[2]
  const o01 = mOld[4],
    o11 = mOld[5],
    o21 = mOld[6]
  const o02 = mOld[8],
    o12 = mOld[9],
    o22 = mOld[10]

  // R_delta:
  let d00 = 1,
    d01 = 0,
    d02 = 0
  let d10 = 0,
    d11 = 1,
    d12 = 0
  let d20 = 0,
    d21 = 0,
    d22 = 1

  if (axis === 'z') {
    d00 = c
    d01 = -s
    d10 = s
    d11 = c
  } else if (axis === 'y') {
    d00 = c
    d02 = s
    d20 = -s
    d22 = c
  } else {
    d11 = c
    d12 = -s
    d21 = s
    d22 = c
  }

  // R_new = R_delta * R_old
  const n00 = d00 * o00 + d01 * o10 + d02 * o20
  const n10 = d10 * o00 + d11 * o10 + d12 * o20
  const n20 = d20 * o00 + d21 * o10 + d22 * o20

  const n01 = d00 * o01 + d01 * o11 + d02 * o21
  const n11 = d10 * o01 + d11 * o11 + d12 * o21
  const n21 = d20 * o01 + d21 * o11 + d22 * o21

  const n02 = d00 * o02 + d01 * o12 + d02 * o22
  const n12 = d10 * o02 + d11 * o12 + d12 * o22
  const n22 = d20 * o02 + d21 * o12 + d22 * o22

  const newRotation = eulerXYZFromMat3(n00, n10, n20, n01, n11, n21, n02, n12, n22)

  return {
    position: newPosition,
    rotation: newRotation,
    scale: [...transform.scale],
  }
}
