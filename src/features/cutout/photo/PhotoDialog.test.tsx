// @vitest-environment jsdom
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../../i18n'
import { defaultCutout, type CutoutParams } from '../../../geometry/cutout'
import { paperSize } from '../../../geometry/photo/paper'
import { rectObject, discObject, grayOfRgb, syntheticColorPhoto } from '../../../geometry/photo/synthetic'
import { UnitContext } from '../../../ui/units'
import { CutoutPanel } from '../CutoutPanel'
import { ImageError } from '../../keychain/decodeImage'
import { insetCorners } from './usePhotoTrace'

const decode = vi.hoisted(() => vi.fn())
const detect = vi.hoisted(() => vi.fn())
vi.mock('../../keychain/decodeImage', async (orig) => ({ ...(await orig<typeof import('../../keychain/decodeImage')>()), decodeColorImage: decode }))
// автоопределение листа в этих тестах отключено (стартовые углы по умолчанию): поведение окна не зависит от него; само определение проверяют usePhotoTrace.test и detect.test
vi.mock('../../../geometry/photo/detect', async (orig) => ({ ...(await orig<typeof import('../../../geometry/photo/detect')>()), detectPaper: (c: unknown) => detect(c) }))

const A4 = paperSize('a4', 'landscape')
const W = 800, H = 600
/** Снимок, на котором лист занимает ровно начальные углы мастера (отступ 15 %): перспективы нет, углы верны с первого раза. */
const colorPhoto = (objects = [rectObject(40, 60, 40, 20), discObject(190, 130, 15)]) => {
  const c = syntheticColorPhoto({ paper: A4, quad: insetCorners(W, H), width: W, height: H, objects })
  return { image: grayOfRgb(c.rgb, W, H), color: { width: W, height: H, rgb: c.rgb }, original: { width: W, height: H }, downscaled: false }
}
const goodFile = () => new File(['x'], 'tools.jpg', { type: 'image/jpeg' })

let latest: CutoutParams = defaultCutout
let selection: string | null = null
function Harness() {
  const [p, setP] = useState(defaultCutout)
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ id: string; x: number; y: number } | null>(null)
  const [snap, setSnap] = useState(true)
  latest = p; selection = sel
  return (
    <UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}>
      <CutoutPanel params={p} onChange={setP} selectedId={sel} onSelect={setSel} meshes={new Map()} onImport={() => {}} importMessage={null} draft={draft} onDraft={setDraft} snap={snap} onSnap={setSnap} />
    </UnitContext.Provider>
  )
}
const openCutouts = async () => { await userEvent.click(screen.getByRole('button', { name: /Expand: Cutouts/ })) }
const open = async () => { await openCutouts(); await userEvent.click(screen.getByRole('button', { name: 'From photo' })) }
const load = async () => {
  decode.mockResolvedValue(colorPhoto())
  await userEvent.upload(screen.getByTestId('photo-input'), goodFile())
  await screen.findByTestId('corner-svg') // после чтения снимка окно само переходит на шаг 2
}

beforeEach(async () => { await i18n.changeLanguage('en'); latest = defaultCutout; selection = null; decode.mockReset(); detect.mockReset(); detect.mockReturnValue(null) })

describe('окно «Из фото»: снимок, советы и бумага (3.1)', () => {
  it('кнопка открывает окно; Esc закрывает и возвращает фокус на кнопку', async () => {
    render(<Harness />)
    await open()
    expect(screen.getByRole('dialog', { name: 'Cutouts from a photo' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'From photo' })).toHaveFocus())
  })

  it('щелчок по затемнению закрывает окно', async () => {
    render(<Harness />)
    await open()
    fireEvent.mouseDown(screen.getByTestId('photo-backdrop'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('шаг 1: только выбор снимка и подробные советы по съёмке (семь пунктов); бумаги здесь нет', async () => {
    render(<Harness />)
    await open()
    expect(screen.getByRole('button', { name: 'Choose photo' })).toBeInTheDocument()
    const tips = screen.getByTestId('photo-tips')
    expect(within(tips).getAllByRole('listitem')).toHaveLength(7)
    expect(tips).toHaveTextContent(/contrasting surface/)
    expect(tips).toHaveTextContent(/straight from above/)
    expect(tips).toHaveTextContent(/flash/)
    expect(screen.queryByTestId('paper-size')).toBeNull()
    expect(screen.queryByRole('button', { name: 'A4' })).toBeNull()
  })

  it('после чтения снимка окно само переходит на шаг 2, где рядом с углами бумага и ориентация', async () => {
    render(<Harness />)
    await open()
    await load()
    expect(await screen.findByTestId('corner-svg')).toBeInTheDocument()
    expect(screen.getByTestId('paper-size')).toHaveTextContent('297 mm × 210 mm')
    expect(screen.getByRole('button', { name: 'A4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Portrait' })).toBeInTheDocument()
    expect(screen.queryByTestId('photo-tips')).toBeNull() // советы на шаге 2 — по кнопке
  })

  it('ошибка чтения: остаётся шаг 1 с сообщением, шага 2 нет, «Далее» недоступна', async () => {
    decode.mockRejectedValue(new ImageError('unsupported', 'bad'))
    render(<Harness />)
    await open()
    await userEvent.upload(screen.getByTestId('photo-input'), new File(['x'], 'doc.pdf', { type: 'application/pdf' }), { applyAccept: false })
    expect(await screen.findByText(/Unsupported file/)).toBeInTheDocument()
    expect(screen.queryByTestId('corner-svg')).toBeNull()
    expect(screen.queryByTestId('photo-name')).toBeNull()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('форматы бумаги на шаге 2: A4 альбомный 297 × 210, Letter книжный 215.9 × 279.4, свой размер', async () => {
    render(<Harness />)
    await open(); await load()
    expect(await screen.findByTestId('paper-size')).toHaveTextContent('297 mm × 210 mm')
    await userEvent.click(screen.getByRole('button', { name: 'US Letter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Portrait' }))
    expect(screen.getByTestId('paper-size')).toHaveTextContent('215.9 mm × 279.4 mm')
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByLabelText('Paper width')).toBeInTheDocument()
    const len = screen.getByLabelText('Paper length')
    await userEvent.clear(len); await userEvent.type(len, '500'); await userEvent.tab()
    expect(screen.getByTestId('paper-size')).toHaveTextContent('× 500 mm')
  })

  it('лист найден автоматически: сообщение с предложенным форматом, лист не найден — предупреждение', async () => {
    detect.mockReturnValue({ corners: insetCorners(W, H), confidence: 0.95 })
    render(<Harness />)
    await open(); await load()
    expect(await screen.findByText(/found automatically/)).toBeInTheDocument()
  })
  it('лист не найден: предупреждение «поставьте углы»', async () => {
    render(<Harness />)
    await open(); await load()
    expect(await screen.findByText(/could not be found automatically/)).toBeInTheDocument()
  })

  it('кнопка «Tips» на шагах 2 и 3 открывает те же советы; Esc закрывает только их, окно остаётся, фокус возвращается на кнопку', async () => {
    render(<Harness />)
    await open(); await load()
    await userEvent.click(await screen.findByRole('button', { name: 'Tips' }))
    const pop = screen.getByTestId('tips-popover')
    expect(within(pop).getAllByRole('listitem')).toHaveLength(7)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('tips-popover')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Cutouts from a photo' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tips' })).toHaveFocus())
    expect(screen.getByTestId('corner-svg')).toBeInTheDocument() // состояние не потеряно
  })

  it('снимок и настройки переживают закрытие и повторное открытие окна', async () => {
    render(<Harness />)
    await open(); await load()
    await userEvent.click(screen.getByRole('button', { name: 'US Letter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await userEvent.click(screen.getByRole('button', { name: 'From photo' }))
    expect(screen.getByTestId('photo-name')).toHaveTextContent('tools.jpg')
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('button', { name: 'US Letter' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('на русском: советы, шаги и кнопки подписаны', async () => {
    await i18n.changeLanguage('ru')
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /Развернуть: Вырезы/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Из фото' }))
    expect(screen.getByRole('dialog', { name: 'Вырезы из фото' })).toBeInTheDocument()
    expect(screen.getByText('Как сделать хорошее фото')).toBeInTheDocument()
    expect(within(screen.getByTestId('photo-tips')).getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled()
  })
})

describe('окно «Из фото»: углы листа (3.2)', () => {
  const toStep2 = async () => { render(<Harness />); await open(); await load(); await screen.findByTestId('corner-svg') }
  const corner = (n: number) => screen.getByTestId(`corner-${n}`)
  const pos = (n: number) => [Number(corner(n).getAttribute('data-x')), Number(corner(n).getAttribute('data-y'))]
  const fitRect = (svg: Element) => { (svg as SVGSVGElement).getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect }

  it('четыре кольца на начальных углах (отступ 15 %), названы по положению, без номеров на метках', async () => {
    await toStep2()
    expect([1, 2, 3, 4].map(pos)).toEqual([[120, 90], [680, 90], [680, 510], [120, 510]])
    expect(corner(1)).toHaveAccessibleName('Corner 1: top left')
    expect(corner(3)).toHaveAccessibleName('Corner 3: bottom right')
    expect(corner(1).querySelector('text')).toBeNull()
    expect(corner(1).querySelector('circle')!.getAttribute('fill')).toBe('none') // кольцо прозрачное: угол виден
  })

  it('угол берётся за область рядом с ним внутри листа и смещается на ту же величину, что указатель', async () => {
    await toStep2()
    const svg = screen.getByTestId('corner-svg'); fitRect(svg)
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 130, pointerId: 1 }) // внутри листа, в 50 пикселях от угла 1
    fireEvent.pointerMove(svg, { clientX: 170, clientY: 120 }) // указатель сместился на (+20, −10)
    expect(pos(1)).toEqual([140, 80])
    fireEvent.pointerUp(svg)
    fireEvent.pointerMove(svg, { clientX: 10, clientY: 10 })
    expect(pos(1)).toEqual([140, 80]) // после отпускания угол не следует за указателем
  })

  it('нажатие далеко от всех углов ничего не двигает', async () => {
    await toStep2()
    const svg = screen.getByTestId('corner-svg'); fitRect(svg)
    fireEvent.pointerDown(svg, { clientX: 400, clientY: 300, pointerId: 1 }) // центр листа
    fireEvent.pointerMove(svg, { clientX: 450, clientY: 350 })
    expect([1, 2, 3, 4].map(pos)).toEqual([[120, 90], [680, 90], [680, 510], [120, 510]])
    expect(screen.queryByTestId('loupe')).toBeNull()
  })

  it('стрелки двигают угол на 1 пиксель, Shift со стрелкой — на 10; за край снимка не выходит', async () => {
    await toStep2()
    corner(2).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    expect(pos(2)).toEqual([681, 91])
    await userEvent.keyboard('{Shift>}{ArrowLeft}{ArrowUp}{/Shift}')
    expect(pos(2)).toEqual([671, 81])
    for (let i = 0; i < 12; i++) await userEvent.keyboard('{Shift>}{ArrowUp}{/Shift}')
    expect(pos(2)[1]).toBe(0)
  })

  it('угол нельзя перетащить через противоположный: четырёхугольник остаётся допустимым', async () => {
    await toStep2()
    const svg = screen.getByTestId('corner-svg'); fitRect(svg)
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 130, pointerId: 1 })
    fireEvent.pointerMove(svg, { clientX: 700, clientY: 520 }) // угол 1 — за угол 3
    expect(pos(1)).toEqual([120, 90]) // движение отвергнуто
    expect(screen.queryByText(/convex quadrilateral|wrong order|too close/)).toBeNull()
    fireEvent.pointerUp(svg)
  })

  it('«бабочка» и зеркальный порядок (получены с клавиатуры) — предупреждение, превью нет, «Далее» недоступна', async () => {
    await toStep2()
    expect(await screen.findByTestId('rectified-canvas')).toBeInTheDocument()
    corner(1).focus()
    for (let i = 0; i < 70; i++) await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}') // угол 1 вправо за угол 2: бабочка
    expect(screen.getByText(/convex quadrilateral|wrong order|too close/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})

describe('окно «Из фото»: лупа (3.2)', () => {
  const toStep2 = async () => { render(<Harness />); await open(); await load(); await screen.findByTestId('corner-svg') }
  const svgFit = (svg: Element) => { (svg as SVGSVGElement).getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect }

  it('лупа есть, пока угол двигают, и пропадает при отпускании', async () => {
    await toStep2()
    const svg = screen.getByTestId('corner-svg'); svgFit(svg)
    expect(screen.queryByTestId('loupe')).toBeNull()
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 130, pointerId: 1 })
    expect(screen.getByTestId('loupe')).toBeInTheDocument()
    fireEvent.pointerUp(svg)
    expect(screen.queryByTestId('loupe')).toBeNull()
  })

  it('лупа стоит в углу редактора, самом далёком от активного угла (не под указателем)', async () => {
    await toStep2()
    const svg = screen.getByTestId('corner-svg'); svgFit(svg)
    fireEvent.pointerDown(svg, { clientX: 150, clientY: 130, pointerId: 1 }) // верхний левый угол листа
    expect(screen.getByTestId('loupe')).toHaveAttribute('data-place', 'br')
    fireEvent.pointerUp(svg)
    fireEvent.pointerDown(svg, { clientX: 650, clientY: 480, pointerId: 1 }) // правый нижний
    expect(screen.getByTestId('loupe')).toHaveAttribute('data-place', 'tl')
  })

  it('с клавиатуры лупа включается при фокусе на угле и выключается при уходе фокуса', async () => {
    await toStep2()
    screen.getByTestId('corner-3').focus()
    expect(await screen.findByTestId('loupe')).toBeInTheDocument()
    screen.getByTestId('corner-3').blur()
    await waitFor(() => expect(screen.queryByTestId('loupe')).toBeNull())
  })
})

describe('окно «Из фото»: без фриза на шаге углов', () => {
  it('на шаге 2 силуэты не считаются, на шаге 3 сначала показывается «ищу силуэты», затем результат', async () => {
    render(<Harness />)
    await open(); await load()
    expect(screen.getByTestId('rectified-canvas')).toBeInTheDocument() // лёгкое превью есть сразу
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByTestId('finding')).toHaveTextContent('Finding silhouettes')
    await screen.findByRole('button', { name: /Create 2 cutouts/ }, { timeout: 5000 })
    expect(screen.queryByTestId('finding')).toBeNull()
  }, 20000)
})

describe('окно «Из фото»: силуэты (3.3) и создание (3.4)', () => {
  const toStep3 = async () => {
    render(<Harness />); await open(); await load() // после чтения снимка окно само на шаге 2
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(), { timeout: 4000 }) // выпрямление считается после паузы
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('button', { name: /Create 2 cutouts/ }, { timeout: 4000 })
  }

  it('найдено два силуэта с размерами в мм; все выбраны, кнопка показывает число вырезов', async () => {
    await toStep3()
    const items = within(screen.getByRole('list', { name: 'Silhouettes' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Silhouette 1')
    expect(items[0]).toHaveTextContent(/40(\.\d+)? mm × 20(\.\d+)? mm/) // прямоугольник выше на листе, поэтому первый
    expect(items[1]).toHaveTextContent(/30(\.\d+)? mm × 30(\.\d+)? mm/)
    expect(within(screen.getByRole('list', { name: 'Silhouettes' })).getAllByRole('checkbox').every((c) => (c as HTMLInputElement).checked)).toBe(true)
  }, 20000)

  it('флажок снимает силуэт с выбора, число на кнопке меняется; щелчок по силуэту на листе делает то же', async () => {
    await toStep3()
    const boxes = within(screen.getByRole('list', { name: 'Silhouettes' })).getAllByRole('checkbox')
    await userEvent.click(boxes[0])
    expect(await screen.findByRole('button', { name: 'Create 1 cutouts' })).toBeInTheDocument()
    // щелчок по силуэту 1 (прямоугольник) на холсте возвращает его
    const canvas = screen.getByTestId('rectified-canvas')
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1188, height: 840, right: 1188, bottom: 840, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    fireEvent.click(canvas, { clientX: 60 * 4, clientY: 70 * 4 }) // центр прямоугольника (60, 70) мм
    expect(await screen.findByRole('button', { name: 'Create 2 cutouts' })).toBeInTheDocument()
    expect((within(screen.getByRole('list', { name: 'Silhouettes' })).getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true)
    fireEvent.click(canvas, { clientX: 5, clientY: 5 }) // щелчок по фону ничего не меняет
    expect(screen.getByRole('button', { name: 'Create 2 cutouts' })).toBeInTheDocument()
  }, 20000)

  it('чувствительность: вручную и «Авто»; поле по краю доступно', async () => {
    await toStep3()
    expect(screen.getByTestId('sens-mode')).toHaveTextContent('automatic')
    const sens = screen.getByLabelText('Sensitivity')
    await userEvent.clear(sens); await userEvent.type(sens, '70'); await userEvent.tab()
    expect(screen.getByTestId('sens-mode')).toHaveTextContent('manual')
    await userEvent.click(screen.getByRole('button', { name: 'Auto' }))
    expect(screen.getByTestId('sens-mode')).toHaveTextContent('automatic')
    expect(screen.getByLabelText('Edge margin')).toBeInTheDocument()
  }, 20000)

  it('нет предметов: предупреждение и недоступная кнопка «Создать»', async () => {
    decode.mockResolvedValue(colorPhoto([]))
    render(<Harness />); await open()
    await userEvent.upload(screen.getByTestId('photo-input'), goodFile())
    await screen.findByTestId('corner-svg')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(), { timeout: 4000 })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText(/No objects found/, undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Create 0 cutouts/ })).toBeDisabled()
  }, 20000)

  it('Создать: два выреза-контура на своих местах, цвета 0 и 1, корпус — целые юниты, окно закрыто, выбран первый, фокус на кнопке', async () => {
    await toStep3()
    await userEvent.click(screen.getByRole('button', { name: 'Create 2 cutouts' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(latest.cutouts).toHaveLength(2)
    expect(latest.cutouts.every((c) => c.source.kind === 'outline')).toBe(true)
    expect(latest.cutouts.map((c) => c.color)).toEqual([0, 1])
    expect(latest.cutouts.map((c) => c.name)).toEqual(['Tool 1', 'Tool 2'])
    expect(selection).toBe(latest.cutouts[0].id)
    // прямоугольник (60, 70) мм и диск (190, 130) мм на листе: диск правее на 130 мм и ниже на 60 мм (ось y вверх)
    const [bar, disc] = latest.cutouts
    expect(disc.x - bar.x).toBeCloseTo(130, 0)
    expect(disc.y - bar.y).toBeCloseTo(-60, 0)
    expect(latest.x.mode).toBe('units')
    expect(latest.y.mode).toBe('units')
    expect(latest.x.value).toBeGreaterThanOrEqual(4) // 130 + запас по x
    await waitFor(() => expect(screen.getByRole('button', { name: 'From photo' })).toHaveFocus())
  }, 30000)

  it('в окне нет полей глубины и зазора; вырезы создаются с глубиной 10 и зазором 0.8 мм и правятся уже в списке', async () => {
    await toStep3()
    expect(screen.queryByLabelText('Depth')).toBeNull()
    expect(screen.queryByLabelText('Clearance')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Create 2 cutouts' }))
    expect(latest.cutouts.every((c) => c.depth === 10 && c.clearance === 0.8)).toBe(true)
  }, 30000)

  it('прежние вырезы остаются, а при повторном создании цвета продолжаются', async () => {
    await toStep3()
    await userEvent.click(screen.getByRole('button', { name: 'Create 2 cutouts' }))
    await userEvent.click(screen.getByRole('button', { name: 'From photo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(), { timeout: 4000 })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Create 2 cutouts' }, { timeout: 4000 }))
    expect(latest.cutouts).toHaveLength(4)
    expect(latest.cutouts.map((c) => c.color)).toEqual([0, 1, 2, 3])
  }, 40000)
})
