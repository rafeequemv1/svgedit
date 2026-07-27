/**
 * Procedural lipid bilayer cross-section geometry.
 * @license MIT
 */

export const DEFAULTS = {
  spacing: 22,
  headRadius: 6,
  tailLength: 14,
  bilayerGap: 4,
  tailSpread: 35,
  waviness: 0,
  wavinessFreq: 2,
  curvature: 0
}

/**
 * @param {number} deg
 * @returns {number}
 */
export const degToRad = (deg) => (Number(deg) * Math.PI) / 180

/**
 * @param {object} params
 * @returns {{sites: object[], membranePoints: string}}
 */
export const computeBilayerGeometry = (params) => {
  const {
    x1, y1, x2, y2,
    spacing = DEFAULTS.spacing,
    headRadius = DEFAULTS.headRadius,
    tailLength = DEFAULTS.tailLength,
    bilayerGap = DEFAULTS.bilayerGap,
    tailSpread = DEFAULTS.tailSpread,
    waviness = DEFAULTS.waviness,
    wavinessFreq = DEFAULTS.wavinessFreq,
    curvature = DEFAULTS.curvature
  } = params

  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length < 2) {
    return { sites: [], membranePoints: '' }
  }

  const ux = dx / length
  const uy = dy / length
  const spreadRad = degToRad(tailSpread)
  const fan = Math.tan(Math.min(spreadRad, 1.2))
  const halfThickness = headRadius + tailLength + bilayerGap / 2
  const leafletOffset = bilayerGap / 2 + tailLength
  const count = Math.max(2, Math.round(length / spacing) + 1)

  /** @type {object[]} */
  const sites = []
  /** @type {object[]} */
  const centerPoints = []

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    const along = t * length
    const curveOff = curvature * Math.sin(t * Math.PI) * length * 0.12
    const waveOff = waviness * Math.sin(t * Math.PI * wavinessFreq * 2)

    const cx = x1 + ux * along + (-uy) * (curveOff + waveOff)
    const cy = y1 + uy * along + ux * (curveOff + waveOff)
    const nx = -uy
    const ny = ux
    centerPoints.push({ x: cx, y: cy, nx, ny })

    const stagger = (i % 2 === 0 ? 1 : -1) * headRadius * 0.12
    const sx = cx + ux * stagger
    const sy = cy + uy * stagger

    const upperHead = { x: cx - nx * leafletOffset, y: cy - ny * leafletOffset, r: headRadius }
    const lowerHead = { x: cx + nx * leafletOffset, y: cy + ny * leafletOffset, r: headRadius }

    const makeTails = (head, towardCenter) => {
      const vx = towardCenter.x - head.x
      const vy = towardCenter.y - head.y
      const vlen = Math.hypot(vx, vy) || 1
      const tx = vx / vlen
      const ty = vy / vlen
      const len = tailLength * 0.92
      const px = ux
      const py = uy
      return [
        {
          x1: head.x, y1: head.y,
          x2: head.x + tx * len + px * len * fan,
          y2: head.y + ty * len + py * len * fan
        },
        {
          x1: head.x, y1: head.y,
          x2: head.x + tx * len - px * len * fan,
          y2: head.y + ty * len - py * len * fan
        }
      ]
    }

    const center = { x: sx, y: sy }
    sites.push({
      upperHead,
      lowerHead,
      upperTails: makeTails(upperHead, center),
      lowerTails: makeTails(lowerHead, center)
    })
  }

  const topEdge = centerPoints.map((p) => ({
    x: p.x - p.nx * halfThickness,
    y: p.y - p.ny * halfThickness
  }))
  const bottomEdge = centerPoints.map((p) => ({
    x: p.x + p.nx * halfThickness,
    y: p.y + p.ny * halfThickness
  })).reverse()
  const membranePoints = [...topEdge, ...bottomEdge]
    .map((p) => `${p.x},${p.y}`)
    .join(' ')

  return { sites, membranePoints }
}

/**
 * @param {object} params
 * @returns {number}
 */
export const countLipids = (params) => computeBilayerGeometry(params).sites.length
