/**
 * Декларативные описания плавающего HUD-ввода инструментов эскиза.
 * Схема — чистые данные: какие поля на какой ступени ввода, подписи,
 * единицы и клавиши переключения. Значения по умолчанию из положения
 * курсора и точек инструмента считает hudDefaults. React-free.
 */

export type HudUnit = 'mm' | 'deg' | 'plain'

export interface ToolHudField {
  /** Имя поля в передаваемых значениях (x, y, w, h, size, a1, a2, n). */
  name: string
  /** Подпись у поля: координаты и размеры — общепринятые обозначения CAD. */
  label: string
  /** Альтернативная подпись после переключения (R ↔ Ø). */
  altLabel?: string
  /** Клавиша переключения подписи и смысла поля. */
  toggleKey?: string
  unit?: HudUnit
}

export interface ToolHudStage {
  fields: ToolHudField[]
}

export interface ToolHudSchema {
  tool: string
  stages: ToolHudStage[]
}

const xyFields: ToolHudField[] = [
  { name: 'x', label: 'X', unit: 'mm' },
  { name: 'y', label: 'Y', unit: 'mm' },
]

/** Радиус с переключением на диаметр клавишей D. */
const radiusField: ToolHudField = {
  name: 'size',
  label: 'R',
  altLabel: 'Ø',
  toggleKey: 'd',
  unit: 'mm',
}

const CIRCLE: ToolHudSchema = {
  tool: 'circle',
  stages: [{ fields: xyFields }, { fields: [radiusField] }],
}

const LINE: ToolHudSchema = {
  tool: 'line',
  stages: [{ fields: xyFields }, { fields: xyFields }],
}

const RECT_2PT: ToolHudSchema = {
  tool: 'rect-2pt',
  stages: [
    { fields: xyFields },
    {
      fields: [
        { name: 'w', label: 'W', unit: 'mm' },
        { name: 'h', label: 'H', unit: 'mm' },
      ],
    },
  ],
}

const RECT_CENTER: ToolHudSchema = { ...RECT_2PT, tool: 'rect-center' }

const POINT: ToolHudSchema = {
  tool: 'point',
  stages: [{ fields: xyFields }],
}

const ARC_3PT: ToolHudSchema = {
  tool: 'arc-3pt',
  stages: [{ fields: xyFields }, { fields: xyFields }, { fields: xyFields }],
}

/** Дуга по центру: центр → радиус → углы начала и конца. */
const ARC_CENTER: ToolHudSchema = {
  tool: 'arc-center',
  stages: [
    { fields: xyFields },
    { fields: [{ name: 'size', label: 'R', unit: 'mm' }] },
    {
      fields: [
        { name: 'a1', label: 'A1', unit: 'deg' },
        { name: 'a2', label: 'A2', unit: 'deg' },
      ],
    },
  ],
}

const POLYGON: ToolHudSchema = {
  tool: 'polygon',
  stages: [
    { fields: xyFields },
    {
      fields: [
        { name: 'size', label: 'R', unit: 'mm' },
        { name: 'n', label: 'N', unit: 'plain' },
      ],
    },
  ],
}

const SCHEMAS: Record<string, ToolHudSchema> = {
  line: LINE,
  'rect-2pt': RECT_2PT,
  'rect-center': RECT_CENTER,
  circle: CIRCLE,
  point: POINT,
  'arc-3pt': ARC_3PT,
  'arc-center': ARC_CENTER,
  polygon: POLYGON,
}

/** Схема HUD инструмента; у инструментов без ввода значений — null. */
export function hudSchemaFor(tool: string | undefined): ToolHudSchema | null {
  if (!tool) return null
  return SCHEMAS[tool] ?? null
}

/** Контекст для значений по умолчанию: курсор и зафиксированные точки. */
export interface HudContext {
  cursor?: { x: number; y: number } | null
  startPt?: { x: number; y: number } | null
  secondPt?: { x: number; y: number } | null
}

/** Угол курсора вокруг центра в градусах, 0…360. */
function cursorAngleDeg(center: { x: number; y: number }, cursor: { x: number; y: number }): number {
  let deg = (Math.atan2(cursor.y - center.y, cursor.x - center.x) * 180) / Math.PI
  if (deg < 0) deg += 360
  return deg
}

/**
 * Значения полей ступени по умолчанию, в порядке полей схемы и в мм/градусах:
 * координаты — из курсора, размеры — от зафиксированной точки до курсора.
 */
export function hudDefaults(schema: ToolHudSchema, stage: number, ctx: HudContext): number[] {
  const s = schema.stages[Math.min(Math.max(stage, 0), schema.stages.length - 1)]
  const cursor = ctx.cursor ?? { x: 0, y: 0 }
  const start = ctx.startPt ?? cursor
  return s.fields.map((f) => {
    switch (f.name) {
      case 'x':
        return cursor.x
      case 'y':
        return cursor.y
      case 'w':
        return Math.abs(cursor.x - start.x)
      case 'h':
        return Math.abs(cursor.y - start.y)
      case 'size':
        return Math.hypot(cursor.x - start.x, cursor.y - start.y)
      case 'a1':
      case 'a2':
        return cursorAngleDeg(start, cursor)
      case 'n':
        return 6
      default:
        return 0
    }
  })
}

/** Число ступеней ввода инструмента. */
export function hudStageCount(schema: ToolHudSchema): number {
  return schema.stages.length
}
