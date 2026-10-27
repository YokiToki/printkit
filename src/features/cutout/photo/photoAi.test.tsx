// @vitest-environment jsdom
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from '../../../i18n'
import { defaultCutout } from '../../../geometry/cutout'
import type { Rectified } from '../../../geometry/photo/homography'
import { paperSize } from '../../../geometry/photo/paper'
import { discObject, grayOfRgb, rectObject, syntheticColorPhoto } from '../../../geometry/photo/synthetic'
import { useModelManagerOpen } from '../../ml/managerState'
import { UnitContext } from '../../../ui/units'
import { CutoutPanel } from '../CutoutPanel'
import { insetCorners } from './usePhotoTrace'

const decode = vi.hoisted(() => vi.fn())
const detect = vi.hoisted(() => vi.fn())
const silhouetteAlpha = vi.hoisted(() => vi.fn())
const fake = vi.hoisted(() => {
  const listeners = new Set<() => void>(), ready = new Set<string>()
  let ver = 0
  return {
    subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }, version: () => ver,
    set(id: string, on: boolean) { if (on) ready.add(id); else ready.delete(id); ver++; listeners.forEach((f) => f()) },
    status: (id: string) => ({ state: ready.has(id) ? 'ready' : 'absent' }), activeFor: () => undefined, usedBytes: () => 0,
  }
})
vi.mock('../../keychain/decodeImage', async (orig) => ({ ...(await orig<typeof import('../../keychain/decodeImage')>()), decodeColorImage: decode }))
vi.mock('../../../geometry/photo/detect', async (orig) => ({ ...(await orig<typeof import('../../../geometry/photo/detect')>()), detectPaper: (c: unknown) => detect(c) }))
vi.mock('../../../ml/service', async (orig) => ({ ...(await orig<typeof import('../../../ml/service')>()), getMlService: () => ({ silhouetteAlpha }) }))
vi.mock('../../../ml/useMl', async () => {
  const React = await import('react')
  return { useModelStore: () => { React.useSyncExternalStore(fake.subscribe, fake.version); return fake }, useCapabilities: () => ({ webgpu: false, f16: false }) }
})

const MODEL = 'isnet-general-int8'
const A4 = paperSize('a4', 'landscape')
const W = 800, H = 600
const colorPhoto = () => {
  const c = syntheticColorPhoto({ paper: A4, quad: insetCorners(W, H), width: W, height: H, objects: [rectObject(40, 60, 40, 20), discObject(190, 130, 15)] })
  return { image: grayOfRgb(c.rgb, W, H), color: { width: W, height: H, rgb: c.rgb }, original: { width: W, height: H }, downscaled: false }
}
/** Альфа «сети»: единицы на двух предметах сцены, раздутых на grow мм. */
const alphaFor = (r: Rectified, grow = 0.5) => {
  const { width: w, height: h } = r.image, a = new Float32Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i + 0.5) / r.scale, y = (j + 0.5) / r.scale
    a[j * w + i] = (x >= 40 - grow && x <= 80 + grow && y >= 60 - grow && y <= 80 + grow) || Math.hypot(x - 190, y - 130) <= 15 + grow ? 1 : 0
  }
  return a
}

function Probe() { return useModelManagerOpen() ? <span data-testid="manager-open" /> : null }
function Harness() {
  const [p, setP] = useState(defaultCutout)
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ id: string; x: number; y: number } | null>(null)
  const [snap, setSnap] = useState(true)
  return (
    <UnitContext.Provider value={{ unit: 'mm', setUnit: () => {} }}>
      <Probe />
      <CutoutPanel params={p} onChange={setP} selectedId={sel} onSelect={setSel} meshes={new Map()} onImport={() => {}} importMessage={null} draft={draft} onDraft={setDraft} snap={snap} onSnap={setSnap} />
    </UnitContext.Provider>
  )
}
const toStep3 = async () => {
  render(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: /Expand: Cutouts/ }))
  await userEvent.click(screen.getByRole('button', { name: 'From photo' }))
  decode.mockResolvedValue(colorPhoto())
  await userEvent.upload(screen.getByTestId('photo-input'), new File(['x'], 'tools.jpg', { type: 'image/jpeg' }))
  await screen.findByTestId('corner-svg')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled(), { timeout: 4000 })
  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findByRole('button', { name: /Create 2 cutouts/ }, { timeout: 5000 })
}
const sizes = () => within(screen.getByRole('list', { name: 'Silhouettes' })).getAllByRole('listitem').map((li) => li.textContent)

describe('окно «Из фото»: движок ИИ (32, 5.2 и 5.3)', () => {
  beforeEach(async () => { decode.mockReset(); detect.mockReset(); detect.mockReturnValue(null); silhouetteAlpha.mockReset(); fake.set(MODEL, false); await i18n.changeLanguage('en') })

  it('по умолчанию «Классический» и чувствительность; выбор «ИИ» скрывает чувствительность и показывает блок ИИ', async () => {
    await toStep3()
    expect(screen.getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Sensitivity')).toBeInTheDocument()
    expect(silhouetteAlpha).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect(screen.queryByLabelText('Sensitivity')).toBeNull()
    expect(screen.getByTestId('ai-controls')).toBeInTheDocument()
    expect(silhouetteAlpha).not.toHaveBeenCalled() // переключение само модель не запускает
  }, 30000)

  it('порог и сглаживание видны сразу под ИИ, до запуска: два числа и два ползунка', async () => {
    await toStep3()
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect(screen.getByTestId('mask-tuning')).toBeInTheDocument()
    // «Outline smoothness» есть и в настройках контура (35): берём поле блока подгонки маски
    const tuning = screen.getByTestId('mask-tuning')
    expect(screen.getByLabelText('Edge reach')).toBeInTheDocument(); expect(within(tuning).getByLabelText('Outline smoothness')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Edge reach (slider)' })).toBeInTheDocument(); expect(within(tuning).getByRole('slider', { name: 'Outline smoothness (slider)' })).toBeInTheDocument()
    expect(screen.getByText(/The effect shows after the AI run/)).toBeInTheDocument()
  }, 30000)

  it('без готовой модели кнопка запуска выключена с подсказкой и ссылкой на менеджер; она сама включается, когда модель скачана, и снова выключается после удаления', async () => {
    await toStep3()
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('button', { name: 'Run AI' })).toBeDisabled()
    expect(screen.getByTestId('ai-hint')).toHaveTextContent('Download a model to use AI')
    await userEvent.click(screen.getByRole('button', { name: 'Models…' }))
    expect(screen.getByTestId('manager-open')).toBeInTheDocument()
    act(() => fake.set(MODEL, true))
    expect(screen.getByRole('button', { name: 'Run AI' })).toBeEnabled()
    act(() => fake.set(MODEL, false))
    expect(screen.getByRole('button', { name: 'Run AI' })).toBeDisabled()
  }, 30000)

  it('запуск: силуэты ИИ становятся активными; Охват края меняет размеры без нового запуска модели; сброс возвращает значения модели', async () => {
    await toStep3()
    act(() => fake.set(MODEL, true))
    silhouetteAlpha.mockImplementation(async (_m: unknown, r: Rectified) => alphaFor(r, 1.5))
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run AI' }))
    await screen.findByTestId('mask-tuning', undefined, { timeout: 5000 })
    expect(silhouetteAlpha).toHaveBeenCalledTimes(1)
    const first = sizes()
    // охват края: мягкая зона не настроена, поэтому сглаживание 3 мм заметно меняет угловой прямоугольник
    // поле подгонки маски, не «Outline smoothness» из настроек контура (35)
    const smooth = within(screen.getByTestId('mask-tuning')).getByLabelText('Outline smoothness') as HTMLInputElement
    await userEvent.clear(smooth); await userEvent.type(smooth, '3'); await userEvent.tab()
    await waitFor(() => expect(sizes()).not.toEqual(first), { timeout: 5000 })
    expect(silhouetteAlpha).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Reset to model defaults' }))
    await waitFor(() => expect(sizes()).toEqual(first), { timeout: 5000 })
  }, 40000)

  it('ошибка запуска: баннер и классический результат остаются', async () => {
    await toStep3()
    act(() => fake.set(MODEL, true))
    silhouetteAlpha.mockRejectedValue(new Error('bad_alloc'))
    const classicSizes = sizes()
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run AI' }))
    expect(await screen.findByText(/The AI run failed/)).toBeInTheDocument()
    expect(screen.getByText(/The classic result is shown/)).toBeInTheDocument()
    expect(sizes()).toEqual(classicSizes)
  }, 30000)

  it('сравнение выключено по умолчанию и не запускает ИИ; включённое рисует пунктир другого движка и таблицу размеров (классика, ИИ, Δ)', async () => {
    await toStep3()
    expect(screen.queryByTestId('compare-overlay')).toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Compare engines' }))
    expect(screen.getByTestId('compare-hint')).toHaveTextContent('Run AI')
    expect(silhouetteAlpha).not.toHaveBeenCalled()
    act(() => fake.set(MODEL, true))
    silhouetteAlpha.mockImplementation(async (_m: unknown, r: Rectified) => alphaFor(r))
    await userEvent.click(screen.getByRole('button', { name: 'AI' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run AI' }))
    await screen.findByTestId('compare-table', undefined, { timeout: 5000 })
    expect(screen.getAllByTestId('compare-row')).toHaveLength(2)
    expect(screen.getByTestId('compare-overlay')).toBeInTheDocument()
    expect(screen.getAllByTestId('compare-outline')).toHaveLength(2) // контуры классики поверх ИИ
    await userEvent.click(screen.getByRole('checkbox', { name: 'Compare engines' }))
    expect(screen.queryByTestId('compare-overlay')).toBeNull()
  }, 40000)
})
