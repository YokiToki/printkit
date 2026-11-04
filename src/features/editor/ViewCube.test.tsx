// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ViewCube } from './ViewCube'

describe('editor/ViewCube', () => {
  it('renders all 6 faces and triggers onSelectFace on click', () => {
    const onSelect = vi.fn()
    render(<ViewCube onSelectFace={onSelect} />)

    expect(screen.getByTestId('view-cube')).toBeDefined()

    const topBtn = screen.getByTestId('view-cube-top')
    fireEvent.click(topBtn)
    expect(onSelect).toHaveBeenCalledWith('top')

    const frontBtn = screen.getByTestId('view-cube-front')
    fireEvent.click(frontBtn)
    expect(onSelect).toHaveBeenCalledWith('front')
  })

  it('triggers onOrbit when dragged and does not trigger onSelectFace', () => {
    const onSelect = vi.fn()
    const onOrbit = vi.fn()
    render(<ViewCube onSelectFace={onSelect} onOrbit={onOrbit} />)

    const cube = screen.getByTestId('view-cube')
    fireEvent.pointerDown(cube, { clientX: 100, clientY: 100, button: 0, pointerId: 1 })
    fireEvent.pointerMove(cube, { clientX: 120, clientY: 110, pointerId: 1 })
    fireEvent.pointerUp(cube, { clientX: 120, clientY: 110, pointerId: 1 })

    expect(onOrbit).toHaveBeenCalledWith(20, 10)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
