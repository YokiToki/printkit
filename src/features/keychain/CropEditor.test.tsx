// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../i18n'
import type { Crop } from '../../geometry/keychain'
import type { GrayImage } from '../../geometry/raster/threshold'
import { CropEditor } from './CropEditor'

const image: GrayImage = { width: 300, height: 200, gray: new Uint8Array(300 * 200), alpha: null }
const full: Crop = { x: 0, y: 0, w: 1, h: 1 }

function setup(crop: Crop = full, subjectBox: { x0: number; y0: number; x1: number; y1: number } | null = null) {
  const onChange = vi.fn()
  const ui = (c: Crop) => <CropEditor image={image} crop={c} onChange={onChange} subjectBox={subjectBox} />
  const view = render(ui(crop))
  // холст 300 × 200 пикселей на экране: пиксели курсора переводятся в доли изображения
  const box = screen.getByTestId('crop-editor').querySelector('div.relative')!
  vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 300, bottom: 200, width: 300, height: 200, x: 0, y: 0, toJSON() {} } as DOMRect)
  return { onChange, box, rerender: (c: Crop) => view.rerender(ui(c)) }
}
const last = (f: ReturnType<typeof vi.fn>): Crop => f.mock.calls.at(-1)![0]

describe('CropEditor (34, 4.1)', () => {
  beforeEach(async () => { await i18n.changeLanguage('en') })

  it('перетаскивание ручки меняет окно, перенос двигает его; результат внутри изображения', () => {
    const { onChange } = setup({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
    const se = screen.getByTestId('crop-se')
    fireEvent.pointerDown(se, { clientX: 210, clientY: 140, pointerId: 1 })
    fireEvent.pointerMove(se, { clientX: 240, clientY: 160, pointerId: 1 }) // +30 px = 0.1 по x, +20 px = 0.1 по y
    expect(last(onChange)).toMatchObject({ x: 0.2, y: 0.2 }); expect(last(onChange).w).toBeCloseTo(0.6, 6); expect(last(onChange).h).toBeCloseTo(0.6, 6)
    fireEvent.pointerUp(se, { pointerId: 1 })
    onChange.mockClear()
    const mv = screen.getByTestId('crop-move')
    fireEvent.pointerDown(mv, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(mv, { clientX: 400, clientY: 400, pointerId: 1 }) // далеко за край
    const c = last(onChange); expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9); expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9)
    onChange.mockClear(); fireEvent.pointerMove(mv, { clientX: 0, clientY: 0, pointerId: 1 }) // без нажатой кнопки после up ничего
  })

  it('без нажатия движение мыши ничего не меняет', () => {
    const { onChange } = setup({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
    fireEvent.pointerMove(screen.getByTestId('crop-se'), { clientX: 240, clientY: 160, pointerId: 1 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('фиксация пропорций: выбор 1:1 сразу выравнивает окно, потом ручки держат пропорцию в пикселях', async () => {
    const { onChange } = setup({ x: 0.1, y: 0.1, w: 0.6, h: 0.5 })
    await userEvent.click(screen.getByRole('button', { name: '1:1' }))
    const c = last(onChange); expect((c.w * 300) / (c.h * 200)).toBeCloseTo(1, 6)
    onChange.mockClear()
    const se = screen.getByTestId('crop-se')
    fireEvent.pointerDown(se, { clientX: 100, clientY: 100, pointerId: 2 }); fireEvent.pointerMove(se, { clientX: 130, clientY: 105, pointerId: 2 })
    const d = last(onChange); expect((d.w * 300) / (d.h * 200)).toBeCloseTo(1, 6)
  })

  it('«По предмету» использует габарит маски; без маски выключена с подсказкой; «Сбросить» возвращает весь кадр', async () => {
    const a = setup({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, { x0: 0.3, y0: 0.2, x1: 0.7, y1: 0.8 })
    await userEvent.click(screen.getByRole('button', { name: 'Fit to subject' }))
    const c = last(a.onChange); expect(c.x).toBeLessThan(0.3); expect(c.x + c.w).toBeGreaterThan(0.7); expect(c.y).toBeLessThan(0.2)
    await userEvent.click(screen.getByRole('button', { name: 'Reset' })); expect(last(a.onChange)).toEqual(full)
    document.body.innerHTML = ''
    setup({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 })
    expect(screen.getByRole('button', { name: 'Fit to subject' })).toBeDisabled(); expect(screen.getByTestId('crop-fit-hint')).toBeInTheDocument()
    document.body.innerHTML = ''
    setup(full); expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  it('клавиатура: стрелки на ручках двигают на 1 %, с Shift на 5 %; минимум 5 % не нарушается', () => {
    const { onChange } = setup({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 })
    fireEvent.keyDown(screen.getByTestId('crop-move'), { key: 'ArrowRight' }); expect(last(onChange).x).toBeCloseTo(0.21, 6)
    fireEvent.keyDown(screen.getByTestId('crop-move'), { key: 'ArrowDown', shiftKey: true }); expect(last(onChange).y).toBeCloseTo(0.25, 6)
    fireEvent.keyDown(screen.getByTestId('crop-e'), { key: 'ArrowLeft' }); expect(last(onChange).w).toBeCloseTo(0.49, 6)
    onChange.mockClear(); fireEvent.keyDown(screen.getByTestId('crop-e'), { key: 'a' }); expect(onChange).not.toHaveBeenCalled()
    document.body.innerHTML = ''
    const tiny = setup({ x: 0.2, y: 0.2, w: 0.05, h: 0.5 })
    fireEvent.keyDown(screen.getByTestId('crop-e'), { key: 'ArrowLeft', shiftKey: true }); expect(last(tiny.onChange).w).toBeGreaterThanOrEqual(0.05 - 1e-9)
  })

  it('читаемое значение кадра и подписи на обоих языках', async () => {
    setup({ x: 0, y: 0, w: 0.8, h: 0.6 })
    expect(screen.getByTestId('crop-readout')).toHaveTextContent('80 % × 60 % of the picture')
    await i18n.changeLanguage('ru'); document.body.innerHTML = ''
    setup(full); expect(screen.getByRole('button', { name: 'По предмету' })).toBeInTheDocument(); expect(screen.getByTestId('crop-nw')).toHaveAttribute('aria-label', 'левый верхний угол')
  })
})
