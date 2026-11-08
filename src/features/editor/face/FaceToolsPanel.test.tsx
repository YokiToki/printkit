// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FaceToolsPanel } from './FaceToolsPanel'
import { UnitProvider } from '../../../ui/UnitProvider'
import { getWasm } from '../../../geometry/wasm'
import { topologyOfSolid } from '../../../geometry/topology/solid'
import type { MeshTopology } from '../../../geometry/topology'
import '../../../i18n'

async function cubeTopology(): Promise<MeshTopology> {
  const w = await getWasm()
  return topologyOfSolid(w.Manifold.cube([20, 20, 20], true))
}

function renderPanel(props: Partial<React.ComponentProps<typeof FaceToolsPanel>> = {}) {
  const defaults: React.ComponentProps<typeof FaceToolsPanel> = {
    mode: 'face',
    topology: null,
    faceSelection: [],
    edgeSelection: [],
    sharpness: 30,
    onSharpnessChange: vi.fn(),
    distance: 5,
    onDistanceChange: vi.fn(),
    onApplyPushPull: vi.fn(),
    breakKind: 'chamfer',
    onBreakKindChange: vi.fn(),
    size: 1,
    onSizeChange: vi.fn(),
    onApplyEdgeBreak: vi.fn(),
    onSketchOnFace: vi.fn(),
    onProjectEdges: vi.fn(),
  }
  return render(
    <UnitProvider>
      <FaceToolsPanel {...defaults} {...props} />
    </UnitProvider>
  )
}

describe('features/editor/face/FaceToolsPanel (44)', () => {
  it('в режиме грани показывает выдавливание и эскиз на грани', async () => {
    const topo = await cubeTopology()
    renderPanel({ topology: topo })

    expect(screen.getByTestId('face-tools-panel')).toBeTruthy()
    expect(screen.getByTestId('face-apply-pushpull')).toBeTruthy()
    expect(screen.getByTestId('face-sketch-on-face')).toBeTruthy()
    expect(screen.getByTestId('face-project-edges')).toBeTruthy()
  })

  it('без выбранной грани кнопка применения выключена', async () => {
    const topo = await cubeTopology()
    renderPanel({ topology: topo, faceSelection: [] })
    expect(screen.getByTestId('face-apply-pushpull').hasAttribute('disabled')).toBe(true)
  })

  it('с выбранной гранью показывает площадь и включает кнопку', async () => {
    const topo = await cubeTopology()
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    renderPanel({ topology: topo, faceSelection: [top.id] })

    expect(screen.getByTestId('face-apply-pushpull').hasAttribute('disabled')).toBe(false)
    const status = screen.getByTestId('topology-status').textContent ?? ''
    expect(status).toContain('400.0')
  })

  it('в режиме ребра показывает фаску и скругление', async () => {
    const topo = await cubeTopology()
    const edge = topo.edges[0]
    renderPanel({ mode: 'edge', topology: topo, edgeSelection: [edge.id] })

    expect(screen.getByTestId('edge-apply-break')).toBeTruthy()
    expect(screen.getByTestId('edge-apply-break').hasAttribute('disabled')).toBe(false)
    const status = screen.getByTestId('topology-status').textContent ?? ''
    expect(status).toContain('20.0')
  })

  it('переключает вид обработки ребра', async () => {
    const topo = await cubeTopology()
    const onBreakKindChange = vi.fn()
    renderPanel({ mode: 'edge', topology: topo, onBreakKindChange })

    const fillet = screen.getByRole('button', { name: 'Fillet' })
    fireEvent.click(fillet)
    expect(onBreakKindChange).toHaveBeenCalledWith('fillet')
  })

  it('вызывает обработчики применения', async () => {
    const topo = await cubeTopology()
    const onApplyPushPull = vi.fn()
    const onSketchOnFace = vi.fn()
    const onProjectEdges = vi.fn()
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    renderPanel({
      topology: topo,
      faceSelection: [top.id],
      onApplyPushPull,
      onSketchOnFace,
      onProjectEdges,
    })

    fireEvent.click(screen.getByTestId('face-apply-pushpull'))
    fireEvent.click(screen.getByTestId('face-sketch-on-face'))
    fireEvent.click(screen.getByTestId('face-project-edges'))
    expect(onApplyPushPull).toHaveBeenCalled()
    expect(onSketchOnFace).toHaveBeenCalled()
    expect(onProjectEdges).toHaveBeenCalled()
  })

  it('показывает ошибку операции и сообщение о лимите', async () => {
    const topo = await cubeTopology()
    renderPanel({
      topology: topo,
      error: 'face.error.missing',
      limitError: 'topology.error.tooManyTriangles',
    })
    expect(screen.getByTestId('face-tools-error').textContent ?? '').toContain('face')
    expect(screen.getByTestId('face-tools-limit')).toBeTruthy()
  })

  it('меняет порог резкости ребра', async () => {
    const onSharpnessChange = vi.fn()
    renderPanel({ onSharpnessChange })
    fireEvent.click(screen.getByRole('button', { name: /Edge sharpness/i }))
    const input = screen.getByRole('textbox', { name: /Angle/i }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '45' } })
    fireEvent.blur(input)
    expect(onSharpnessChange).toHaveBeenCalledWith(45)
  })
})
