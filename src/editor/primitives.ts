import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { PrimitiveShape } from './scene'

export interface PrimitiveParamDescriptor {
  key: string
  labelKey: string
  min: number
  max?: number
  step: number
  default: number
  unit: 'mm'
}

export interface PrimitiveDescriptor {
  shape: PrimitiveShape
  labelKey: string
  params: PrimitiveParamDescriptor[]
}

export const PRIMITIVE_DESCRIPTORS: Record<PrimitiveShape, PrimitiveDescriptor> = {
  box: {
    shape: 'box',
    labelKey: 'editor.primitive.box',
    params: [
      { key: 'width', labelKey: 'editor.primitive.width', min: 0.1, step: 1, default: 20, unit: 'mm' },
      { key: 'depth', labelKey: 'editor.primitive.depth', min: 0.1, step: 1, default: 20, unit: 'mm' },
      { key: 'height', labelKey: 'editor.primitive.height', min: 0.1, step: 1, default: 20, unit: 'mm' },
    ],
  },
  cylinder: {
    shape: 'cylinder',
    labelKey: 'editor.primitive.cylinder',
    params: [
      { key: 'diameter', labelKey: 'editor.primitive.diameter', min: 0.1, step: 1, default: 20, unit: 'mm' },
      { key: 'height', labelKey: 'editor.primitive.height', min: 0.1, step: 1, default: 20, unit: 'mm' },
    ],
  },
  sphere: {
    shape: 'sphere',
    labelKey: 'editor.primitive.sphere',
    params: [
      { key: 'diameter', labelKey: 'editor.primitive.diameter', min: 0.1, step: 1, default: 20, unit: 'mm' },
    ],
  },
  cone: {
    shape: 'cone',
    labelKey: 'editor.primitive.cone',
    params: [
      { key: 'bottomDiameter', labelKey: 'editor.primitive.bottomDiameter', min: 0.1, step: 1, default: 20, unit: 'mm' },
      { key: 'height', labelKey: 'editor.primitive.height', min: 0.1, step: 1, default: 20, unit: 'mm' },
    ],
  },
  torus: {
    shape: 'torus',
    labelKey: 'editor.primitive.torus',
    params: [
      { key: 'diameter', labelKey: 'editor.primitive.diameter', min: 1, step: 1, default: 30, unit: 'mm' },
      { key: 'tubeDiameter', labelKey: 'editor.primitive.tubeDiameter', min: 0.1, step: 0.5, default: 6, unit: 'mm' },
    ],
  },
  wedge: {
    shape: 'wedge',
    labelKey: 'editor.primitive.wedge',
    params: [
      { key: 'width', labelKey: 'editor.primitive.width', min: 0.1, step: 1, default: 20, unit: 'mm' },
      { key: 'depth', labelKey: 'editor.primitive.depth', min: 0.1, step: 1, default: 20, unit: 'mm' },
      { key: 'height', labelKey: 'editor.primitive.height', min: 0.1, step: 1, default: 20, unit: 'mm' },
    ],
  },
}

export const SEGMENTS = 96

/**
 * Строит геометрию примитива в Manifold (96 сегментов).
 * Все примитивы центрированы по X и Y и стоят на столе z = 0.
 */
export function buildPrimitiveManifold(
  w: ManifoldToplevel,
  shape: PrimitiveShape,
  params: Record<string, number>
): Manifold {
  switch (shape) {
    case 'box': {
      const width = Math.max(0.01, params.width ?? 20)
      const depth = Math.max(0.01, params.depth ?? 20)
      const height = Math.max(0.01, params.height ?? 20)
      return w.Manifold.cube([width, depth, height], false).translate([-width / 2, -depth / 2, 0])
    }
    case 'cylinder': {
      const radius = Math.max(0.01, (params.diameter ?? 20) / 2)
      const height = Math.max(0.01, params.height ?? 20)
      return w.Manifold.cylinder(height, radius, radius, SEGMENTS, false)
    }
    case 'sphere': {
      const radius = Math.max(0.01, (params.diameter ?? 20) / 2)
      return w.Manifold.sphere(radius, SEGMENTS).translate([0, 0, radius])
    }
    case 'cone': {
      const radius = Math.max(0.01, (params.bottomDiameter ?? 20) / 2)
      const height = Math.max(0.01, params.height ?? 20)
      return w.Manifold.cylinder(height, radius, 0, SEGMENTS, false)
    }
    case 'torus': {
      const majorRadius = Math.max(0.1, (params.diameter ?? 30) / 2)
      const tubeRadius = Math.max(0.01, (params.tubeDiameter ?? 6) / 2)
      const cs = w.CrossSection.circle(tubeRadius, SEGMENTS).translate([majorRadius, 0])
      return w.Manifold.revolve(cs, SEGMENTS).translate([0, 0, tubeRadius])
    }
    case 'wedge': {
      const width = Math.max(0.01, params.width ?? 20)
      const depth = Math.max(0.01, params.depth ?? 20)
      const height = Math.max(0.01, params.height ?? 20)
      const tri = w.CrossSection.ofPolygons([[[-depth / 2, 0], [depth / 2, 0], [depth / 2, height]]])
      return w.Manifold.extrude(tri, width, 0, 0, [1, 1], false)
        .rotate([90, 0, 90])
        .translate([-width / 2, 0, 0])
    }
    default:
      throw new Error(`Unknown primitive shape: ${String(shape)}`)
  }
}
