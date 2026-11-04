// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { parseSvg } from './svg'

describe('parseSvg', () => {
  it('parses a closed path with a hole', () => {
    // Outer 100x100 box, inner 40x40 hole
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <path d="M 0 0 L 100 0 L 100 100 L 0 100 Z M 30 30 L 70 30 L 70 70 L 30 70 Z" />
      </svg>
    `
    const res = parseSvg(svg, { scaleMode: 'fitWidth', fitWidthMm: 100 })
    expect(res.segmentCount).toBe(8)
    expect(Object.keys(res.sketch.curves).length).toBe(8)
    expect(Object.keys(res.sketch.points).length).toBe(8) // Merged endpoints
    expect(res.bounds.maxX - res.bounds.minX).toBeCloseTo(100, 1)
    expect(res.bounds.maxY - res.bounds.minY).toBeCloseTo(100, 1)
  })

  it('preserves circles and arcs under similarity transforms', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <circle cx="50" cy="50" r="20" transform="translate(10, 20) rotate(45) scale(2)" />
        <path d="M 10 10 A 15 15 0 0 1 40 10" transform="scale(2)" />
      </svg>
    `
    const res = parseSvg(svg)
    const curves = Object.values(res.sketch.curves)
    const hasCircle = curves.some((c) => c.kind === 'circle')
    const hasArc = curves.some((c) => c.kind === 'arc')
    expect(hasCircle).toBe(true)
    expect(hasArc).toBe(true)
  })

  it('handles nested group transforms with rotation', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <g transform="translate(50, 50)">
          <g transform="rotate(90)">
            <rect x="0" y="0" width="40" height="20" />
          </g>
        </g>
      </svg>
    `
    const res = parseSvg(svg, { scaleMode: 'scale', scale: 1 })
    expect(res.segmentCount).toBe(4)
    // 40 wide rotated 90 becomes 40 tall, 20 high becomes 20 wide
    expect(res.bounds.maxX - res.bounds.minX).toBeCloseTo(20, 1)
    expect(res.bounds.maxY - res.bounds.minY).toBeCloseTo(40, 1)
  })

  it('supports all relative path commands (m, l, h, v, c, s, q, t, a, z)', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <path d="m 10 10 l 20 0 h 10 v 20 c 5 0 5 10 10 10 s 5 10 10 10 q 5 0 10 10 t 10 10 a 5 5 0 0 1 5 5 z" />
      </svg>
    `
    const res = parseSvg(svg)
    expect(res.segmentCount).toBeGreaterThan(5)
  })

  it('throws when exceeding 50,000 segments limit', () => {
    // Generate an SVG path with > 50,001 points
    let d = 'M 0 0 '
    for (let i = 1; i <= 50005; i++) {
      d += `L ${i} ${i % 2} `
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}" /></svg>`
    expect(() => parseSvg(svg)).toThrow('sketch.error.tooManySegments')
  })

  it('collects notices for unsupported elements such as text and image', () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect x="0" y="0" width="50" height="50" />
        <text x="10" y="20">Hello PrintKit</text>
        <image href="test.png" width="10" height="10" />
      </svg>
    `
    const res = parseSvg(svg)
    expect(res.notices).toContain('text')
    expect(res.notices).toContain('image')
    expect(res.segmentCount).toBe(4) // rect lines still parsed
  })

  it('rejects files larger than 5 MB', () => {
    const hugeSvg = '<svg>' + ' '.repeat(5 * 1024 * 1024 + 10) + '</svg>'
    expect(() => parseSvg(hugeSvg)).toThrow('sketch.error.fileTooLarge')
  })
})
