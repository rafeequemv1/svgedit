import { describe, expect, it } from 'vitest'
import {
  shapeToPathD,
  splitPathD,
  multipolygonToPathD,
  unionElements,
  subtractElements,
  intersectElements,
  excludeElements
} from '../../src/editor/extensions/ext-pathfinder/path-boolean.js'

const makeOverlappingRects = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  document.body.append(svg)
  const a = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  a.setAttribute('x', '0')
  a.setAttribute('y', '0')
  a.setAttribute('width', '20')
  a.setAttribute('height', '20')
  const b = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  b.setAttribute('x', '10')
  b.setAttribute('y', '10')
  b.setAttribute('width', '20')
  b.setAttribute('height', '20')
  svg.append(a, b)
  return { svg, a, b }
}

describe('path-boolean', () => {
  it('converts a rect to path d', () => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('x', '10')
    rect.setAttribute('y', '20')
    rect.setAttribute('width', '30')
    rect.setAttribute('height', '40')
    const d = shapeToPathD(rect)
    expect(d).toContain('M')
    expect(d).toContain('Z')
  })

  it('splits path subpaths', () => {
    const parts = splitPathD('M0,0 L10,0 L10,10 Z M20,20 L30,20 L30,30 Z')
    expect(parts).toHaveLength(2)
  })

  it('formats multipolygon as svg path d', () => {
    const d = multipolygonToPathD([[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]])
    expect(d).toMatch(/^M.*Z$/)
  })

  it('unions two overlapping rects', () => {
    const { svg, a, b } = makeOverlappingRects()
    const d = unionElements([a, b])
    svg.remove()
    expect(d).toBeTruthy()
    expect(d.length).toBeGreaterThan(10)
  })

  it('subtracts front rect from back (minus front)', () => {
    const { svg, a, b } = makeOverlappingRects()
    const d = subtractElements([a, b])
    svg.remove()
    expect(d).toBeTruthy()
    expect(d.length).toBeGreaterThan(10)
  })

  it('intersects two overlapping rects', () => {
    const { svg, a, b } = makeOverlappingRects()
    const d = intersectElements([a, b])
    svg.remove()
    expect(d).toBeTruthy()
    expect(d.length).toBeGreaterThan(10)
  })

  it('excludes overlap (xor) of two rects', () => {
    const { svg, a, b } = makeOverlappingRects()
    const d = excludeElements([a, b])
    svg.remove()
    expect(d).toBeTruthy()
    expect(d.length).toBeGreaterThan(10)
  })
})
