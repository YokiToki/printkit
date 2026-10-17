/**
 * Генерация иллюстраций карточек стартовой страницы: настоящие детали через generate(), изометрия, z-буфер, трассировка.
 * Группы со своим масштабом: Gridfinity (baseplate, box, cutout: детали 2×2 ячейки), Keychain (keychainImage, keychainShape) и Rack (rackPanel).
 * Запуск: npm run art. Брелки не требуют файлов: растр для режима «Изображение» (лапа) строится кодом, см. geometry/art/paw.ts. Для выреза нужен образец
 * tmp/cutout.stl (в репозитории его нет: готовые картинки лежат в src/app/art, CI этот скрипт не запускает); без него группа
 * Gridfinity не пересоздаётся, а картинки брелков всё равно записываются.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { generate, registerImage, registerMesh, type ModelResult } from '../src/geometry/model'
import { toGeometry, defaultParams } from '../src/geometry/baseplate'
import { defaultBox, equalDividers, boxLayout } from '../src/geometry/box'
import { defaultCutout, newCutoutId, type Cutout } from '../src/geometry/cutout'
import { defaultFasteners } from '../src/geometry/fasteners'
import { defaultKeychain, defaultMount } from '../src/geometry/keychain'
import { defaultShape } from '../src/geometry/shapes'
import { defaultRackPanel } from '../src/geometry/rack/panel'
import { defaultRackCase } from '../src/geometry/rack/case'
import { defaultRackShelf } from '../src/geometry/rack/shelf'
import { defaultPattern } from '../src/geometry/rack/patterns/types'
import { defaultShapeState, shapeParams } from '../src/features/keychain/shapeState'
import { pawBitmap } from '../src/geometry/art/paw'
import { defaultOrientation, describeMesh, parseStl, repairMesh } from '../src/geometry/stl-import'
import { ISO } from '../src/geometry/art/projection'
import { defaultArtOptions, projectedSize, renderSvg, type ArtOptions } from '../src/geometry/art/svg'
import type { TriMesh } from '../src/geometry/art/raster'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(root, 'src/app/art')
const SAMPLE = resolve(root, 'tmp/cutout.stl')
/** Высота рисунка коробки Gridfinity (box.svg) в единицах viewBox: по ней выравнивается карточка Keychain на главной. */
const BOX_ART_HEIGHT = 149
/** Сглаживание масок рисунков брелков (единицы viewBox): убирает ступени растра трассировки; у Gridfinity выключено. */
const KEYCHAIN_SMOOTH = 0.9

const meshOf = (r: ModelResult): TriMesh => {
  const m = r.parts[0].mesh
  const n = m.vertProperties.length / m.numProp
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = m.vertProperties[i * m.numProp + k]
  return { positions, triangles: m.triVerts }
}

async function gridfinityModels(): Promise<Record<string, TriMesh>> {
  if (!existsSync(SAMPLE)) throw new Error(`Нужен образец для выреза: ${SAMPLE} (STL, любая закрытая деталь). Положите файл и запустите npm run art ещё раз.`)
  const fasteners = { ...defaultFasteners, magnets: { mode: 'corner' as const, slots: [] } }
  const baseplate = await generate('baseplate', toGeometry({ ...defaultParams, fasteners }))

  // ящик 2×2×3 с двумя перегородками крестом (одна вдоль X, одна вдоль Y): четыре отсека
  const layout = boxLayout(defaultBox)
  const box = await generate('box', { ...defaultBox, compartments: { cols: 2, rows: 2, xDividers: equalDividers(2, layout.cavityX, defaultBox.thickness.innerWall), yDividers: equalDividers(2, layout.cavityY, defaultBox.thickness.innerWall), removed: [] } })

  // блок 2×2×3 с карманом по образцу: деталь лежит на боку и наполовину утоплена
  const buf = readFileSync(SAMPLE)
  const { mesh } = repairMesh(parseStl(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer))
  registerMesh('sample', mesh)
  const orientation = { ...defaultOrientation, rx: 1 }
  const info = describeMesh(mesh.vertProperties, 'mm', orientation)
  const cutout: Cutout = {
    id: newCutoutId(), name: 'Sample', x: 0, y: 0, rotation: 0, depth: 15, clearance: 0.5, visible: true,
    source: { kind: 'mesh', meshId: 'sample', filename: 'cutout.stl', unit: 'mm', orientation, mode: '3d', size: info.size, hull: info.hull },
  }
  const block = await generate('cutout', { ...defaultCutout, cutouts: [cutout] })
  return { baseplate: meshOf(baseplate), box: meshOf(box), cutout: meshOf(block) }
}


async function keychainModels(): Promise<Record<string, TriMesh>> {
  registerImage('art-paw', pawBitmap(1000))
  const quality = { cell: 0.12, maxTriangles: 2_000_000 }
  // «Изображение»: лапа со скосом по краю и ушком
  const image = await generate('keychain', {
    ...defaultKeychain, imageId: 'art-paw', size: { ...defaultKeychain.size, longest: 56 }, quality,
    relief: { ...defaultKeychain.relief, hmax: 2.4, edgeWidth: 5 },
    base: { ...defaultKeychain.base, thickness: 1.6 },
    mount: { ...defaultMount, style: 'eyelet', x: 0.5, y: 1.02, diameter: 4, outer: 9 },
  })
  // «Форма»: скруглённая бирка с бортиком и отверстием под кольцо
  const shape = await generate('keychain', {
    ...shapeParams({
      ...defaultShapeState, quality,
      shape: { ...defaultShape, kind: 'rect', width: 54, height: 30, radius: 8, rim: { enabled: true, width: 2, height: 1.6 } },
      mount: { ...defaultMount, style: 'hole', x: 0.12, y: 0.5, diameter: 4 },
    }),
  })
  return { keychainImage: meshOf(image), keychainShape: meshOf(shape) }
}

/** Rack: панель 2 U с узором Skadis, ушами с пазами и задней стенкой нет; вид сверху-сбоку, чтобы читались и уши, и узор. */
async function rackModels(): Promise<Record<string, TriMesh>> {
  const panel = await generate('rackPanel', { ...defaultRackPanel, pattern: { ...defaultPattern, kind: 'skadis' } })
  return { rackPanel: meshOf(panel) }
}

/** Rack: корпус 2 U с окном, двумя keystone и сотами; лицевая грань на столе, оболочка растёт вверх открытой стороной к зрителю. */
async function rackCaseModels(): Promise<Record<string, TriMesh>> {
  const r = await generate('rackCase', {
    ...defaultRackCase, device: { width: 120, depth: 90, height: 60 }, openings: [{ kind: 'keystone', count: 2, perRow: 1, zone: 'right', diameter: 8 }],
    vents: { enabled: true, width: 14, wall: 2.4, margin: 8 }, ears: { ...defaultRackCase.ears, positions: 'outer' },
  })
  return { rackCase: meshOf(r) }
}

/** Rack: полка 2 U лицом на столе: щелевой пол и боковые стенки со скосом растут вверх. */
async function rackShelfModels(): Promise<Record<string, TriMesh>> {
  const r = await generate('rackShelf', { ...defaultRackShelf, shelf: { ...defaultRackShelf.shelf, depth: 90 }, ears: { ...defaultRackShelf.ears, positions: 'outer' } })
  return { rackShelf: meshOf(r) }
}

/**
 * Рендерит группу и пишет SVG. Без `heightOf` у группы один общий масштаб (картинки одной группы одного размера). С `heightOf`
 * (имя детали → высота рисунка в единицах viewBox) эта деталь получает масштаб, при котором стоит в карточке той же высоты, что
 * коробка Gridfinity; остальным масштаб не больше этого и такой, чтобы деталь не вышла за поле (запас в 1 единицу с каждой стороны).
 * Масштаб общий не для всех: форма шире лапы, и по общей ширине лапа не доставала бы до высоты коробки.
 */
function writeGroup(all: Record<string, TriMesh>, heightOf?: { name: string; height: number }, o: ArtOptions = defaultArtOptions) {
  const fitWidth = (m: TriMesh) => (o.width - 2) / projectedSize(m, ISO).w
  const common = Math.min(...Object.values(all).map((m) => { const s = projectedSize(m, ISO); return Math.min((o.width - 2 * o.pad) / s.w, (o.height - 2 * o.pad) / s.h) }))
  const want = heightOf ? heightOf.height / projectedSize(all[heightOf.name], ISO).h : 0
  mkdirSync(OUT, { recursive: true })
  for (const [name, mesh] of Object.entries(all)) {
    const scale = heightOf ? Math.min(want, fitWidth(mesh)) : common
    const svg = renderSvg(mesh, ISO, o, scale)
    writeFileSync(resolve(OUT, `${name}.svg`), svg)
    console.log(`${name}.svg  ${(svg.length / 1024).toFixed(1)} KB`)
  }
}

// брелки не требуют файлов; Gridfinity — только при наличии образца выреза
// высота рисунка брелка равна высоте коробки Gridfinity (≈ 149 единиц viewBox 250 × 165), чтобы карточки на главной стояли вровень
writeGroup(await keychainModels(), { name: 'keychainImage', height: BOX_ART_HEIGHT }, { ...defaultArtOptions, smooth: KEYCHAIN_SMOOTH })
// Rack: своя группа с одной деталью, чтобы остальные картинки не менялись
writeGroup(await rackModels())
writeGroup(await rackCaseModels())
writeGroup(await rackShelfModels())
if (!existsSync(SAMPLE)) {
  console.error(`Группа Gridfinity пропущена: нужен образец выреза ${SAMPLE} (STL, любая закрытая деталь). Картинки брелков записаны.`)
  process.exit(1)
}
writeGroup(await gridfinityModels())
