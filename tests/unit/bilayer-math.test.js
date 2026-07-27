import { describe, expect, it } from 'vitest'
import {
  computeBilayerGeometry,
  countLipids,
  DEFAULTS
} from '../../src/editor/extensions/ext-lipidbilayer/bilayer-math.js'

describe('bilayer-math', () => {
  it('returns no sites for very short drag', () => {
    const { sites, membranePoints } = computeBilayerGeometry({
      x1: 0, y1: 0, x2: 1, y2: 0
    })
    expect(sites).toHaveLength(0)
    expect(membranePoints).toBe('')
  })

  it('generates lipids along a horizontal membrane', () => {
    const { sites } = computeBilayerGeometry({
      x1: 0, y1: 100, x2: 200, y2: 100,
      spacing: 25
    })
    expect(sites.length).toBeGreaterThan(3)
    sites.forEach((site) => {
      expect(site.upperHead.r).toBe(DEFAULTS.headRadius)
      expect(site.upperHead.y).toBeLessThan(site.lowerHead.y)
      expect(site.upperTails).toHaveLength(2)
      expect(site.lowerTails).toHaveLength(2)
    })
  })

  it('increases lipid count when spacing decreases', () => {
    const sparse = countLipids({ x1: 0, y1: 0, x2: 200, y2: 0, spacing: 40 })
    const dense = countLipids({ x1: 0, y1: 0, x2: 200, y2: 0, spacing: 15 })
    expect(dense).toBeGreaterThan(sparse)
  })

  it('offsets upper and lower heads with waviness', () => {
    const flat = computeBilayerGeometry({
      x1: 0, y1: 50, x2: 300, y2: 50, waviness: 0
    })
    const wavy = computeBilayerGeometry({
      x1: 0, y1: 50, x2: 300, y2: 50, waviness: 10, wavinessFreq: 3
    })
    const flatMid = flat.sites[Math.floor(flat.sites.length / 2)].upperHead.y
    const wavyYs = wavy.sites.map((s) => s.upperHead.y)
    expect(Math.max(...wavyYs) - Math.min(...wavyYs)).toBeGreaterThan(2)
    expect(flatMid).toBeCloseTo(50 - DEFAULTS.bilayerGap / 2 - DEFAULTS.tailLength, 0)
  })

  it('builds a closed membrane polygon', () => {
    const { membranePoints } = computeBilayerGeometry({
      x1: 10, y1: 20, x2: 210, y2: 20
    })
    const pts = membranePoints.split(' ')
    expect(pts.length).toBeGreaterThan(6)
    pts.forEach((pt) => {
      expect(pt).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    })
  })
})
