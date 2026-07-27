import { describe, expect, it } from 'vitest'
import {
  cornerAngleDegrees,
  cornerWidgetPosition,
  getCornerRadius,
  getShapeCornerPoints,
  isCornerGripEligible,
  parseClosedPolylinePathD,
  parsePoints,
  polygonSignedArea,
  polygonToRoundedPathD,
  radiusFromCornerDrag,
  radiusFromVertexDrag,
  supportsCornerRadius
} from '../../packages/svgcanvas/core/corner-radius.js'

describe('corner-radius', () => {
  it('supports rect, polygon, and rounded paths', () => {
    expect(supportsCornerRadius({ tagName: 'rect' })).toBe(true)
    expect(supportsCornerRadius({ tagName: 'polygon' })).toBe(true)
    expect(supportsCornerRadius({
      tagName: 'path',
      hasAttribute: (n) => n === 'data-corner-points',
      getAttribute: () => null
    })).toBe(true)
    expect(supportsCornerRadius({
      tagName: 'path',
      hasAttribute: () => false,
      getAttribute: (n) => (n === 'd' ? 'M0,0 L100,0 100,100 0,100 Z' : null)
    })).toBe(true)
    expect(supportsCornerRadius({ tagName: 'circle' })).toBe(false)
  })

  it('parses closed pen-tool polylines', () => {
    expect(parseClosedPolylinePathD('M10 10L50 10L50 40L10 40Z')).toEqual([
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 40 },
      { x: 10, y: 40 }
    ])
    expect(parseClosedPolylinePathD('M0,0 C10,10 20,20 30,30 Z')).toBeNull()
    expect(parseClosedPolylinePathD('M0,0 L10,0')).toBeNull()
  })

  it('parses points attributes', () => {
    expect(parsePoints('0,0 10,0 10,10')).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 }
    ])
  })

  it('builds a closed rounded path', () => {
    const d = polygonToRoundedPathD(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      10
    )
    expect(d.startsWith('M')).toBe(true)
    expect(d.includes('Q')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('computes drag radius from a corner', () => {
    const box = { x: 0, y: 0, width: 100, height: 80 }
    expect(radiusFromCornerDrag('nw', box, 20, 15)).toBe(15)
    expect(radiusFromCornerDrag('se', box, 90, 70)).toBe(10)
    expect(radiusFromCornerDrag('nw', box, 200, 200)).toBe(40)
  })

  it('reads rect rx/ry', () => {
    expect(getCornerRadius({
      tagName: 'rect',
      getAttribute: (n) => (n === 'rx' ? '12' : n === 'ry' ? '8' : null)
    })).toBe(12)
  })

  it('places widgets inside polygon corner angles', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 }
    ]
    const area = polygonSignedArea(pts)
    const widget = cornerWidgetPosition(pts[2], pts[0], pts[1], 0, 10, area)
    // Inside the triangle: y > 0 and below the top edge
    expect(widget.x).toBeGreaterThan(0)
    expect(widget.x).toBeLessThan(100)
    expect(widget.y).toBeGreaterThan(0)
    expect(widget.y).toBeLessThan(40)
  })

  it('drags radius along a vertex bisector', () => {
    // CCW square corner at bottom-left (0,100)
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ]
    const area = polygonSignedArea(pts)
    const prev = pts[2]
    const curr = pts[3]
    const next = pts[0]
    const r = radiusFromVertexDrag(prev, curr, next, 20, 80, 50, area)
    expect(r).toBeGreaterThan(5)
    expect(r).toBeLessThanOrEqual(50)
  })

  it('reads polygon corner points', () => {
    expect(getShapeCornerPoints({
      tagName: 'polygon',
      getAttribute: () => '0,0 10,0 10,10'
    })).toHaveLength(3)
  })

  it('hides grips on nearly flat corners like Illustrator', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ]
    const area = polygonSignedArea(square)
    // Square corner at (100,0)
    expect(cornerAngleDegrees(square[0], square[1], square[2])).toBeCloseTo(90, 5)
    expect(isCornerGripEligible(square[0], square[1], square[2], area)).toBe(true)

    // Almost colinear (~170°)
    const flatPrev = { x: 0, y: 0 }
    const flatCurr = { x: 100, y: 0 }
    const flatNext = { x: 200, y: 5 }
    expect(cornerAngleDegrees(flatPrev, flatCurr, flatNext)).toBeGreaterThan(160)
    expect(isCornerGripEligible(flatPrev, flatCurr, flatNext, 1)).toBe(false)
  })

  it('keeps L-shape widgets inside the fill, not in the notch', () => {
    // CCW L polygon
    const pts = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 }
    ]
    const area = polygonSignedArea(pts)
    // Outer corner (60,0)
    const outer = cornerWidgetPosition(pts[0], pts[1], pts[2], 0, 8, area)
    expect(outer.x).toBeLessThan(60)
    expect(outer.y).toBeGreaterThan(0)
    // Inner notch (40,40) — interior ~270°, no grip; if placed, still into fill
    expect(isCornerGripEligible(pts[2], pts[3], pts[4], area)).toBe(false)
  })
})
