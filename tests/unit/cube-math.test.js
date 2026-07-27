import { describe, expect, it } from 'vitest'
import {
  computeCubeFaces,
  computeCubeWireframe,
  projectPoint,
  rotate3D,
  rotate3DInverse,
  degToRad,
  getCorners,
  getVisibleFaceIndices,
  DEFAULT_PERSPECTIVE
} from '../../src/editor/extensions/ext-cube3d/cube-math.js'

function polyArea (ptsStr) {
  const pts = ptsStr.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number)
    return { x, y }
  })
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a) / 2
}

describe('cube-math', () => {
  it('shows only the front face at identity rotation', () => {
    const faces = computeCubeFaces({
      cx: 100,
      cy: 100,
      size: 50,
      rx: 0,
      ry: 0,
      rz: 0,
      fill: '#ccc'
    })
    expect(faces.length).toBe(1)
    expect(faces[0].faceIndex).toBe(0)
    const pts = faces[0].points.split(' ').map((p) => {
      const [x, y] = p.split(',').map(Number)
      return { x, y }
    })
    const width = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
    const height = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
    expect(Math.abs(width - height)).toBeLessThan(0.5)
  })

  it('shows three faces for a corner view', () => {
    const rx = degToRad(35)
    const ry = degToRad(-45)
    const rz = 0
    expect(getVisibleFaceIndices(rx, ry, rz)).toHaveLength(3)
  })

  it('keeps three face fills visually distinct with a light fill color', () => {
    const faces = computeCubeFaces({
      cx: 100,
      cy: 100,
      size: 50,
      rx: 35,
      ry: -45,
      rz: 0,
      fill: '#ffffff'
    })
    expect(faces.length).toBe(3)
    const fills = new Set(faces.map((f) => f.fill))
    expect(fills.size).toBe(3)
  })

  it('shows three faces at extreme user-reported rotation with non-zero area', () => {
    const faces = computeCubeFaces({
      cx: 54.1,
      cy: 122,
      size: 50,
      rx: 160,
      ry: 45,
      rz: -75,
      sx: 10,
      sy: 1,
      sz: 1,
      fill: '#ccc'
    })
    expect(faces.length).toBe(3)
    faces.forEach((f) => {
      expect(polyArea(f.points)).toBeGreaterThan(1)
    })
  })

  it('never returns zero visible faces across a rotation sweep', () => {
    for (let rx = -180; rx <= 180; rx += 13) {
      for (let ry = -180; ry <= 180; ry += 17) {
        for (let rz = -180; rz <= 180; rz += 23) {
          const faces = computeCubeFaces({
            cx: 0,
            cy: 0,
            size: 40,
            rx,
            ry,
            rz,
            fill: '#ccc'
          })
          expect(faces.length).toBeGreaterThan(0)
          expect(faces.length).toBeLessThanOrEqual(3)
        }
      }
    }
  })

  it('keeps painter order far → near (ascending avgZ)', () => {
    for (let ry = -80; ry <= 80; ry += 10) {
      for (let rx = -60; rx <= 60; rx += 15) {
        const faces = computeCubeFaces({
          cx: 0,
          cy: 0,
          size: 40,
          rx,
          ry,
          rz: 0,
          fill: '#ccc'
        })
        for (let i = 1; i < faces.length; i++) {
          expect(faces[i].avgZ).toBeGreaterThanOrEqual(faces[i - 1].avgZ - 1e-6)
        }
      }
    }
  })

  it('rotates 90° around Y to show the left face toward camera', () => {
    const faces = computeCubeFaces({
      cx: 0,
      cy: 0,
      size: 40,
      rx: 0,
      ry: 90,
      rz: 0,
      fill: '#ccc'
    })
    const ids = faces.map((f) => f.faceIndex).sort()
    expect(ids).toContain(2)
    expect(ids).not.toContain(0)
  })

  it('inverse rotation undoes forward rotation', () => {
    const p = { x: 0.3, y: -0.2, z: 0.5 }
    const rx = degToRad(25)
    const ry = degToRad(-40)
    const rz = degToRad(15)
    const back = rotate3DInverse(rotate3D(p, rx, ry, rz), rx, ry, rz)
    expect(back.x).toBeCloseTo(p.x, 6)
    expect(back.y).toBeCloseTo(p.y, 6)
    expect(back.z).toBeCloseTo(p.z, 6)
  })

  it('projects with SVG Y inverted', () => {
    const a = projectPoint({ x: 0, y: 1, z: 0 }, 0, 0, 10)
    const b = projectPoint({ x: 0, y: -1, z: 0 }, 0, 0, 10)
    expect(a.y).toBeLessThan(b.y)
  })

  it('scales corners on each axis independently', () => {
    const c = getCorners(2, 1, 1)
    expect(c[1].x).toBeCloseTo(1)
    expect(c[2].y).toBeCloseTo(0.5)
  })

  it('returns twelve wireframe edges', () => {
    const edges = computeCubeWireframe({
      cx: 0,
      cy: 0,
      size: 40,
      rx: 35,
      ry: -45,
      rz: 0
    })
    expect(edges).toHaveLength(12)
    edges.forEach((e) => {
      expect(Number.isFinite(e.x1)).toBe(true)
      expect(Number.isFinite(e.y1)).toBe(true)
      expect(Number.isFinite(e.x2)).toBe(true)
      expect(Number.isFinite(e.y2)).toBe(true)
    })
  })

  it('uses isometric by default and preserves size when perspective changes', () => {
    expect(DEFAULT_PERSPECTIVE).toBe(0)

    const iso = projectPoint({ x: 0.5, y: 0, z: 0 }, 0, 0, 50, 0)
    const persp = projectPoint({ x: 0.5, y: 0, z: 0 }, 0, 0, 50, 80)
    expect(iso.x).toBeCloseTo(25, 5)
    expect(persp.x).toBeCloseTo(25, 5)

    const near = projectPoint({ x: 0.5, y: 0, z: 0.3 }, 0, 0, 50, 80)
    const far = projectPoint({ x: 0.5, y: 0, z: -0.3 }, 0, 0, 50, 80)
    expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x))
  })

  it('keeps front-face width stable at identity rotation across perspective', () => {
    const isoFaces = computeCubeFaces({
      cx: 100, cy: 100, size: 50, rx: 0, ry: 0, rz: 0, perspective: 0, fill: '#ccc'
    })
    const perspFaces = computeCubeFaces({
      cx: 100, cy: 100, size: 50, rx: 0, ry: 0, rz: 0, perspective: 80, fill: '#ccc'
    })
    const width = (ptsStr) => {
      const pts = ptsStr.split(' ').map((p) => Number(p.split(',')[0]))
      return Math.max(...pts) - Math.min(...pts)
    }
    expect(width(perspFaces[0].points)).toBeCloseTo(width(isoFaces[0].points), 1)
  })
})
