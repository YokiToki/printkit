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
})
