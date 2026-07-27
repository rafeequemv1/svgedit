import { describe, expect, it } from 'vitest'
import {
  computeNanoparticleGeometry,
  countParticles,
  DEFAULTS
} from '../../src/editor/extensions/ext-nanoparticle/nanoparticle-math.js'

describe('nanoparticle-math', () => {
  it('returns no sites for tiny radius', () => {
    const { sites } = computeNanoparticleGeometry({
      cx: 0, cy: 0, radius: 2, particleRadius: 5
    })
    expect(sites).toHaveLength(0)
  })

  it('packs yellow lattice circles inside a disk', () => {
    const { sites, outerR } = computeNanoparticleGeometry({
      cx: 100,
      cy: 80,
      radius: 60,
      spacing: 14,
      particleRadius: 5
    })
    expect(outerR).toBe(60)
    expect(sites.length).toBeGreaterThan(5)
    sites.forEach((s) => {
      expect(s.r).toBe(DEFAULTS.particleRadius)
      expect(Math.hypot(s.x - 100, s.y - 80)).toBeLessThanOrEqual(60)
    })
  })

  it('increases particle count when spacing decreases', () => {
    const sparse = countParticles({ cx: 0, cy: 0, radius: 80, spacing: 24 })
    const dense = countParticles({ cx: 0, cy: 0, radius: 80, spacing: 10 })
    expect(dense).toBeGreaterThan(sparse)
  })

  it('supports square packing', () => {
    const hex = countParticles({ cx: 0, cy: 0, radius: 50, packing: 'hex' })
    const square = countParticles({ cx: 0, cy: 0, radius: 50, packing: 'square' })
    expect(hex).toBeGreaterThan(0)
    expect(square).toBeGreaterThan(0)
  })
})
