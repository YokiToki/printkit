import { describe, it, expect } from 'vitest'
import { hudSchemaFor, hudDefaults, hudStageCount } from './sketchHudSchema'

describe('sketchHudSchema — декларативные описания HUD-ввода (44c)', () => {
  it('окружность: ступень 0 — центр X/Y, ступень 1 — радиус с переключением на диаметр', () => {
    const schema = hudSchemaFor('circle')
    expect(schema).not.toBeNull()
    expect(hudStageCount(schema!)).toBe(2)

    expect(schema!.stages[0].fields.map((f) => f.name)).toEqual(['x', 'y'])
    expect(schema!.stages[0].fields.every((f) => f.unit === 'mm')).toBe(true)

    const size = schema!.stages[1].fields[0]
    expect(size.name).toBe('size')
    expect(size.label).toBe('R')
    expect(size.altLabel).toBe('Ø')
    expect(size.toggleKey).toBe('d')
  })

  it('точка: одна ступень с координатами X/Y', () => {
    const schema = hudSchemaFor('point')
    expect(schema).not.toBeNull()
    expect(hudStageCount(schema!)).toBe(1)
    expect(schema!.stages[0].fields.map((f) => f.name)).toEqual(['x', 'y'])
  })

  it('дуга по трём точкам — три ступени координат, дуга по центру — центр, радиус, углы', () => {
    const a3 = hudSchemaFor('arc-3pt')!
    expect(hudStageCount(a3)).toBe(3)
    expect(a3.stages.every((s) => s.fields.map((f) => f.name).join(',') === 'x,y')).toBe(true)

    const ac = hudSchemaFor('arc-center')!
    expect(hudStageCount(ac)).toBe(3)
    expect(ac.stages[0].fields.map((f) => f.name)).toEqual(['x', 'y'])
    expect(ac.stages[1].fields.map((f) => f.name)).toEqual(['size'])
    const angles = ac.stages[2].fields
    expect(angles.map((f) => f.name)).toEqual(['a1', 'a2'])
    expect(angles.every((f) => f.unit === 'deg')).toBe(true)
  })

  it('многоугольник: центр, затем радиус и число сторон', () => {
    const schema = hudSchemaFor('polygon')!
    expect(hudStageCount(schema)).toBe(2)
    expect(schema.stages[0].fields.map((f) => f.name)).toEqual(['x', 'y'])
    expect(schema.stages[1].fields.map((f) => f.name)).toEqual(['size', 'n'])
    expect(schema.stages[1].fields[1].unit).toBe('plain')
  })

  it('прямоугольники: ступень 1 — ширина и высота; линия — координаты конца', () => {
    for (const tool of ['rect-2pt', 'rect-center'] as const) {
      const schema = hudSchemaFor(tool)!
      expect(schema.stages[1].fields.map((f) => f.name)).toEqual(['w', 'h'])
    }
    const line = hudSchemaFor('line')!
    expect(line.stages[1].fields.map((f) => f.name)).toEqual(['x', 'y'])
  })

  it('инструментам без ввода значений схема не назначена', () => {
    expect(hudSchemaFor('select')).toBeNull()
    expect(hudSchemaFor('dimension')).toBeNull()
    expect(hudSchemaFor(undefined)).toBeNull()
  })

  it('значения по умолчанию: координаты из курсора, размеры от точки до курсора', () => {
    const circle = hudSchemaFor('circle')!
    expect(hudDefaults(circle, 0, { cursor: { x: 25, y: 15 } })).toEqual([25, 15])
    expect(
      hudDefaults(circle, 1, { cursor: { x: 25, y: 10 }, startPt: { x: 10, y: 10 } }),
    ).toEqual([15])

    const rect = hudSchemaFor('rect-2pt')!
    expect(
      hudDefaults(rect, 1, { cursor: { x: 60, y: 40 }, startPt: { x: 20, y: 10 } }),
    ).toEqual([40, 30])

    const polygon = hudSchemaFor('polygon')!
    expect(hudDefaults(polygon, 1, { cursor: { x: 3, y: 4 }, startPt: { x: 0, y: 0 } })).toEqual([
      5, 6,
    ])
  })

  it('значения по умолчанию углов дуги — направление на курсор в градусах 0…360', () => {
    const arc = hudSchemaFor('arc-center')!
    expect(
      hudDefaults(arc, 2, { cursor: { x: 0, y: 5 }, startPt: { x: 0, y: 0 } }),
    ).toEqual([90, 90])
    expect(
      hudDefaults(arc, 2, { cursor: { x: -1, y: -1 }, startPt: { x: 0, y: 0 } }),
    ).toEqual([225, 225])
  })

  it('ступень за пределами схемы зажимается, курсор без точки — нули', () => {
    const point = hudSchemaFor('point')!
    expect(hudDefaults(point, 5, {})).toEqual([0, 0])
    expect(hudDefaults(point, -1, { cursor: { x: 7, y: 8 } })).toEqual([7, 8])
  })
})
