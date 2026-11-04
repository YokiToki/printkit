/**
 * Генерация иллюстраций карточек стартовой страницы: настоящие детали через generate(), изометрия, z-буфер, трассировка.
 * Группы со своим масштабом: Gridfinity (baseplate, box, cutout: детали 2×2 ячейки), Keychain (keychainImage, keychainShape) и Rack (rackPanel).
 * Запуск: npm run art. Растр для режима «Изображение» — эмблема-кольцо scripts/art/ring.jpg (из PoC, декодируется jpeg-js). Для выреза нужен образец
 * tmp/cutout.stl (в репозитории его нет: готовые картинки лежат в src/app/art, CI этот скрипт не запускает); без него группа
 * Gridfinity не пересоздаётся, а картинки брелков всё равно записываются.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { decode } from 'jpeg-js'
import { generate, registerImage, registerMesh, type ModelResult } from '../src/geometry/model'
import { getWasm } from '../src/geometry/wasm'
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
import type { GrayImage } from '../src/geometry/raster/threshold'
import { defaultOrientation, describeMesh, parseStl, repairMesh } from '../src/geometry/stl-import'
import { ISO } from '../src/geometry/art/projection'
import { defaultArtOptions, projectedSize, renderSvg, type ArtOptions } from '../src/geometry/art/svg'
import type { TriMesh } from '../src/geometry/art/raster'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(root, 'src/app/art')
const SAMPLE = resolve(root, 'tmp/cutout.stl')
/** Свободное поле с каждой стороны рисунка, доля размера поля (спека «Same air on every card»: минимум 6 %). */
const ART_MARGIN = 0.06
/** Высота рисунка коробки Gridfinity (box.svg) в единицах viewBox: по ней выравнивается карточка Keychain на главной. */
const BOX_ART_HEIGHT = 145.2 // (1 − 2·ART_MARGIN) × 165
/** Высота рисунка брелка-картинки как доля высоты коробки: оставляет на карточке тот же воздух, что у карточек Gridfinity. */
const KEYCHAIN_ART_RATIO = 0.8
/** Сглаживание масок рисунков брелков (единицы viewBox): убирает ступени растра трассировки; у Gridfinity выключено. */
const KEYCHAIN_SMOOTH = 0.9
/** Исходник эмблемы для карточки Keychain Image (кольцо с отверстием и острыми зубьями, из PoC). */
const RING = resolve(root, 'scripts/art/ring.jpg')

/** JPEG → GrayImage для реестра воркера: яркость по Rec. 601, альфа полная. */
function loadGray(path: string): GrayImage {
  const img = decode(readFileSync(path), { useTArray: true, formatAsRGBA: true })
  const n = img.width * img.height
  const gray = new Uint8Array(n), alpha = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    gray[i] = Math.round(0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2])
    alpha[i] = img.data[i * 4 + 3]
  }
  return { width: img.width, height: img.height, gray, alpha }
}

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
  registerImage('art-ring', loadGray(RING))
  const quality = { cell: 0.12, maxTriangles: 2_000_000 }
  // «Изображение»: эмблема-кольцо, большая область (отверстие) открыта, мелкие между штрихами залиты (правило областей change 18);
  // ушка нет: сквозное отверстие уже есть в эмблеме
  const probe = await generate('keychain', { ...defaultKeychain, imageId: 'art-ring', size: { ...defaultKeychain.size, longest: 50 }, quality })
  const areas = probe.keychain?.preview?.areas ?? []
  const largest = areas.reduce<(typeof areas)[number] | undefined>((m, a) => (m && m.size >= a.size ? m : a), undefined)
  if (!largest) throw new Error('У эмблемы-кольца нет замкнутой области: проверьте scripts/art/ring.jpg')
  const image = await generate('keychain', {
    ...defaultKeychain, imageId: 'art-ring', size: { ...defaultKeychain.size, longest: 50 }, quality,
    silhouette: { ...defaultKeychain.silhouette, areas: { [largest.id]: { mode: 'open', level: 0 } } },
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

/**
 * Rack: все три детали 1 U (типичный случай и умолчание полки), одна группа с общим масштабом — ширина стойки на всех карточках одна.
 * Панель с узором Skadis (на 1 U узор мельче: шаг уменьшен только для картинки, чтобы элементы читались); корпус вокруг низкого
 * устройства (~25 мм) с одним keystone; полка со стенками, умещающимися в 1 U. Лицевые грани на столе, вид сверху-сбоку.
 */
async function rackModels(): Promise<Record<string, TriMesh>> {
  const panel = await generate('rackPanel', { ...defaultRackPanel, units: 1, pattern: { ...defaultPattern, kind: 'skadis', skadis: { ...defaultPattern.skadis, pitch: 20 } } })
  const rackCase = await generate('rackCase', {
    ...defaultRackCase, device: { width: 120, depth: 90, height: 25 }, openings: [{ kind: 'keystone', count: 1, perRow: 1, zone: 'right', diameter: 8 }],
    vents: { enabled: true, width: 14, wall: 2.4, margin: 8 }, ears: { ...defaultRackCase.ears, positions: 'outer' },
  })
  const shelf = await generate('rackShelf', { ...defaultRackShelf, units: 1, sides: { height: 30, wall: 3 }, shelf: { ...defaultRackShelf.shelf, depth: 90 }, ears: { ...defaultRackShelf.ears, positions: 'outer' } })
  return { rackPanel: meshOf(panel), rackCase: meshOf(rackCase), rackShelf: meshOf(shelf) }
}

async function editorModel(): Promise<Record<string, TriMesh>> {
  const w = await getWasm()
  const M = w.Manifold
  // L-Bracket
  const baseBracket = M.cube([32, 20, 32], false).subtract(
    M.cube([24, 22, 24], false).translate([8, -1, 8])
  )
  const hole1 = M.cylinder(12, 3.5, 3.5, 32, false).translate([20, 10, -1])
  const hole2 = M.cylinder(12, 3.5, 3.5, 32, false).rotate([0, 90, 0]).translate([-1, 10, 20])
  const bracket = baseBracket.subtract(hole1).subtract(hole2)

  // Box
  const box = M.cube([18, 18, 18], false).translate([-28, 0, 0])

  // Cylinder
  const cyl = M.cylinder(24, 7, 7, 32, false).translate([0, 26, 0])

  // Gizmo on the box
  const arrowX = M.cylinder(14, 0.8, 0.8, 16, false)
    .add(M.cylinder(5, 2, 0, 16, false).translate([0, 0, 14]))
    .rotate([0, 90, 0])
    .translate([-19, 9, 9])

  const arrowY = M.cylinder(14, 0.8, 0.8, 16, false)
    .add(M.cylinder(5, 2, 0, 16, false).translate([0, 0, 14]))
    .rotate([-90, 0, 0])
    .translate([-19, 9, 9])

  const arrowZ = M.cylinder(14, 0.8, 0.8, 16, false)
    .add(M.cylinder(5, 2, 0, 16, false).translate([0, 0, 14]))
    .translate([-19, 9, 9])

  const combined = M.union([bracket, box, cyl, arrowX, arrowY, arrowZ])
  const m = combined.getMesh()
  const n = m.vertProperties.length / m.numProp
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = m.vertProperties[i * m.numProp + k]
  return { editor: { positions, triangles: m.triVerts } }
}

/** Размеры рисунков (доли поля 250 × 165) для манифеста: тест держит поля по краям и рост брелка не выше коробки. */
const manifestPath = resolve(OUT, 'manifest.json')
const manifest: Record<string, { w: number; h: number }> = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : {}

/**
 * Рендерит группу и пишет SVG. Без `heightOf` у группы один общий масштаб (картинки одной группы одного размера). С `heightOf`
 * (имя детали → высота рисунка в единицах viewBox) эта деталь получает масштаб, при котором стоит в карточке заданной высоты
 * (доля высоты коробки Gridfinity); остальным масштаб не больше этого и такой, чтобы деталь не вышла за поле (запас в 1 единицу
 * с каждой стороны). Масштаб общий не для всех: форма шире эмблемы, и по общей ширине эмблема не доставала бы до своей высоты.
 * Размер каждого рисунка (доли поля) добавляется в manifest.json.
 */
function writeGroup(all: Record<string, TriMesh>, heightOf?: { name: string; height: number }, o: ArtOptions = defaultArtOptions) {
  const fitWidth = (m: TriMesh) => (o.width - 2) / projectedSize(m, ISO).w
  const common = Math.min(...Object.values(all).map((m) => { const s = projectedSize(m, ISO); return Math.min((o.width - 2 * o.pad) / s.w, (o.height - 2 * o.pad) / s.h) }))
  const want = heightOf ? heightOf.height / projectedSize(all[heightOf.name], ISO).h : 0
  mkdirSync(OUT, { recursive: true })
  for (const [name, mesh] of Object.entries(all)) {
    // потолок масштаба: рисунок не ближе ART_MARGIN к любому краю поля
    const s0 = projectedSize(mesh, ISO)
    const cap = Math.min(((1 - 2 * ART_MARGIN) * o.width) / s0.w, ((1 - 2 * ART_MARGIN) * o.height) / s0.h)
    const scale = Math.min(heightOf ? Math.min(want, fitWidth(mesh)) : common, cap)
    const s = projectedSize(mesh, ISO)
    manifest[name] = { w: (s.w * scale) / o.width, h: (s.h * scale) / o.height }
    const svg = renderSvg(mesh, ISO, o, scale)
    writeFileSync(resolve(OUT, `${name}.svg`), svg)
    console.log(`${name}.svg  ${(svg.length / 1024).toFixed(1)} KB`)
  }
  writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
}

// брелки не требуют внешних STL; Gridfinity — только при наличии образца выреза
// высота рисунка брелка — доля KEYCHAIN_ART_RATIO от высоты коробки Gridfinity (≈ 149 единиц viewBox 250 × 165):
// карточки стоят вровень, но брелок не заполняет всё поле
writeGroup(await keychainModels(), { name: 'keychainImage', height: BOX_ART_HEIGHT * KEYCHAIN_ART_RATIO }, { ...defaultArtOptions, smooth: KEYCHAIN_SMOOTH })
// Rack: одна группа из трёх деталей 1 U с общим масштабом, чтобы остальные картинки не менялись
writeGroup(await rackModels())
// Editor: группа из одной сцены
writeGroup(await editorModel())
if (!existsSync(SAMPLE)) {
  console.error(`Группа Gridfinity пропущена: нужен образец выреза ${SAMPLE} (STL, любая закрытая деталь). Картинки брелков записаны.`)
  process.exit(1)
}
writeGroup(await gridfinityModels())
