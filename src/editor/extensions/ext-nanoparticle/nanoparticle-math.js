/**
 * Circular lattice nanoparticle geometry (hex packing inside a disk).
 * @license MIT
 */

export const DEFAULTS = {
  spacing: 14,
  particleRadius: 5,
  packing: 'hex' // 'hex' | 'square'
}

/**
 * Sites for circles packed in a disk centered at (cx, cy) with outer radius R.
 * @param {object} params
 * @returns {{sites: Array<{x:number,y:number,r:number}>, outerR: number}}
 */
export const computeNanoparticleGeometry = (params) => {
  const {
    cx = 0,
    cy = 0,
    radius = 0,
    spacing = DEFAULTS.spacing,
    particleRadius = DEFAULTS.particleRadius,
    packing = DEFAULTS.packing
  } = params

  const outerR = Math.max(0, Number(radius) || 0)
  if (outerR < particleRadius + 1) {
    return { sites: [], outerR }
  }

  const step = Math.max(particleRadius * 1.6, Number(spacing) || DEFAULTS.spacing)
  const limit = outerR - particleRadius * 0.35
  /** @type {Array<{x:number,y:number,r:number}>} */
  const sites = []

  if (packing === 'square') {
    const n = Math.ceil(limit / step)
    for (let iy = -n; iy <= n; iy++) {
      for (let ix = -n; ix <= n; ix++) {
        const x = ix * step
        const y = iy * step
        if (Math.hypot(x, y) <= limit) {
          sites.push({ x: cx + x, y: cy + y, r: particleRadius })
        }
      }
    }
  } else {
    // Hexagonal lattice
    const rowH = step * Math.sin(Math.PI / 3)
    const nRows = Math.ceil(limit / rowH)
    for (let row = -nRows; row <= nRows; row++) {
      const y = row * rowH
      const offset = (row & 1) ? step / 2 : 0
      const nCols = Math.ceil((limit + step) / step)
      for (let col = -nCols; col <= nCols; col++) {
        const x = col * step + offset
        if (Math.hypot(x, y) <= limit) {
          sites.push({ x: cx + x, y: cy + y, r: particleRadius })
        }
      }
    }
  }

  // Ensure at least a center particle
  if (!sites.length) {
    sites.push({ x: cx, y: cy, r: particleRadius })
  }

  return { sites, outerR }
}

/**
 * @param {object} params
 * @returns {number}
 */
export const countParticles = (params) =>
  computeNanoparticleGeometry(params).sites.length
