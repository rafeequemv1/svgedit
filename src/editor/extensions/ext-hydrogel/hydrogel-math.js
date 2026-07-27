/**
 * Hydrogel network geometry — ported from LabCanvas 2d-editor/generators/hydrogel.
 * @license MIT
 */

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ x: number, y: number, cp1?: Point, cp2?: Point }} Vertex
 */

export const DEFAULTS = {
  hydrogelShape: 'rectangle',
  density: 50,
  chainLength: 20,
  polymerColor: 'rgba(56, 189, 248, 0.8)',
  polymerThickness: 1.5,
  showParticles: false,
  particleCount: 50,
  particleRadius: 3,
  particleColor: 'rgba(245, 158, 11, 1)',
  poreSize: 15,
  networkType: 'entangled',
  crosslinkDensity: 20,
  crosslinkerRadius: 2.5,
  crosslinkerColor: 'rgba(236, 72, 153, 1)',
  swelling: 50,
  payloadRelease: 0
}

/**
 * Seedable RNG (LabCanvas hydrogel-utils).
 * @param {number} seed
 * @returns {() => number}
 */
const createSeededRandom = (seed) => {
  let s = seed
  return () => {
    const x = Math.sin(s++) * 10000
    return x - Math.floor(x)
  }
}

/**
 * Convert LabCanvas-style vertices (relative cp1/cp2) to an SVG path `d`.
 * @param {Vertex[]} vertices
 * @param {boolean} isClosed
 * @returns {string}
 */
export const verticesToPathD = (vertices, isClosed) => {
  if (!vertices.length) return ''
  let d = `M${vertices[0].x},${vertices[0].y}`
  const n = vertices.length
  const segCount = isClosed ? n : n - 1
  for (let i = 0; i < segCount; i++) {
    const v1 = vertices[i]
    const v2 = vertices[(i + 1) % n]
    if (v1.cp2 || v2.cp1) {
      const p1 = v1.cp2
        ? { x: v1.x + v1.cp2.x, y: v1.y + v1.cp2.y }
        : { x: v1.x, y: v1.y }
      const p2 = v2.cp1
        ? { x: v2.x + v2.cp1.x, y: v2.y + v2.cp1.y }
        : { x: v2.x, y: v2.y }
      d += `C${p1.x},${p1.y} ${p2.x},${p2.y} ${v2.x},${v2.y}`
    } else {
      d += `L${v2.x},${v2.y}`
    }
  }
  if (isClosed) d += 'Z'
  return d
}

/**
 * Merge many open chain path `d` strings into one multi-subpath `d`.
 * @param {Array<{ d: string }>} chains
 * @returns {string}
 */
export const batchChainPathD = (chains) => {
  if (!chains?.length) return ''
  return chains.map((c) => c.d).filter(Boolean).join('')
}

/**
 * Encode circles as a single filled SVG path (two arcs per circle).
 * @param {Array<{ cx: number, cy: number, r: number }>} circles
 * @returns {string}
 */
export const circlesToPathD = (circles) => {
  if (!circles?.length) return ''
  let d = ''
  for (const { cx, cy, r } of circles) {
    if (!(r > 0)) continue
    // Full circle as two semicircular arcs
    d += `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`
  }
  return d
}

/**
 * Batched draw primitives for DOM-light rendering.
 * @param {ReturnType<typeof generateHydrogelGeometry>} geom
 * @returns {{
 *   chainsD: string,
 *   chainsStroke: string,
 *   chainsStrokeWidth: number,
 *   crosslinksD: string,
 *   crosslinksFill: string,
 *   particlesD: string,
 *   particlesFill: string,
 *   bounds: { x: number, y: number, w: number, h: number }
 * }}
 */
export const batchHydrogelGeometry = (geom) => {
  const firstChain = geom.chains[0]
  const firstXl = geom.crosslinks[0]
  const firstPt = geom.particles[0]
  return {
    chainsD: batchChainPathD(geom.chains),
    chainsStroke: firstChain?.stroke || DEFAULTS.polymerColor,
    chainsStrokeWidth: firstChain?.strokeWidth ?? DEFAULTS.polymerThickness,
    crosslinksD: circlesToPathD(geom.crosslinks),
    crosslinksFill: firstXl?.fill || DEFAULTS.crosslinkerColor,
    particlesD: circlesToPathD(geom.particles),
    particlesFill: firstPt?.fill || DEFAULTS.particleColor,
    bounds: geom.bounds
  }
}

/**
 * Generate hydrogel drawing primitives (same logic as LabCanvas).
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {object} options
 * @param {number} seed
 * @returns {{
 *   chains: Array<{ d: string, stroke: string, strokeWidth: number }>,
 *   crosslinks: Array<{ cx: number, cy: number, r: number, fill: string }>,
 *   particles: Array<{ cx: number, cy: number, r: number, fill: string }>,
 *   bounds: { x: number, y: number, w: number, h: number }
 * }}
 */
export const generateHydrogelGeometry = (rect, options = {}, seed = 1) => {
  const opts = { ...DEFAULTS, ...options }
  const {
    hydrogelShape,
    density,
    chainLength,
    polymerColor,
    polymerThickness,
    showParticles,
    particleCount,
    particleRadius,
    particleColor,
    poreSize,
    networkType,
    crosslinkDensity,
    crosslinkerRadius,
    crosslinkerColor,
    swelling,
    payloadRelease
  } = opts

  const random = createSeededRandom(seed)
  const chains = []
  const crosslinks = []
  const particles = []

  // --- Swelling ---
  const swellingEffect = (swelling - 50) / 50
  const sizeMultiplier = 1 + swellingEffect * 0.5
  const newW = rect.w * sizeMultiplier
  const newH = rect.h * sizeMultiplier
  const newX = rect.x + (rect.w - newW) / 2
  const newY = rect.y + (rect.h - newH) / 2
  const newPoreRadius = (poreSize / 2) * sizeMultiplier
  const newStepSize = newPoreRadius > 0 ? newPoreRadius * 0.8 : 5 * sizeMultiplier
  const bounds = { x: newX, y: newY, w: newW, h: newH }

  // 1. Pore centers
  const poreCenters = []
  if (newPoreRadius > 1) {
    const poreArea = Math.PI * newPoreRadius ** 2
    const numPores = Math.floor((newW * newH) / (poreArea * 3) * (1 - (density / 250)))
    const minDistanceSq = (newPoreRadius * 2) ** 2
    for (let i = 0; i < numPores * 10 && poreCenters.length < numPores; i++) {
      const candidate = {
        x: newX + random() * newW,
        y: newY + random() * newH
      }
      let valid = true
      for (const center of poreCenters) {
        const distSq = (center.x - candidate.x) ** 2 + (center.y - candidate.y) ** 2
        if (distSq < minDistanceSq) {
          valid = false
          break
        }
      }
      if (valid) poreCenters.push(candidate)
    }
  }

  // 2. Polymer chains
  const polymerChains = []
  const centerX = newX + newW / 2
  const centerY = newY + newH / 2

  /** @type {(p: Point) => boolean} */
  let isInside
  /** @type {() => Point} */
  let getRandomStartPoint

  if (hydrogelShape === 'circle') {
    const circleRadius = Math.min(newW, newH) / 2
    isInside = (p) => (p.x - centerX) ** 2 + (p.y - centerY) ** 2 < circleRadius ** 2
    getRandomStartPoint = () => {
      const angle = random() * 2 * Math.PI
      const r = Math.sqrt(random()) * circleRadius
      return { x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle) }
    }
  } else {
    isInside = (p) => p.x > newX && p.x < newX + newW && p.y > newY && p.y < newY + newH
    getRandomStartPoint = () => ({ x: newX + random() * newW, y: newY + random() * newH })
  }

  for (let i = 0; i < density; i++) {
    const chainPoints = []
    let startPoint
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidateStart = getRandomStartPoint()
      let inPore = false
      for (const pore of poreCenters) {
        if ((candidateStart.x - pore.x) ** 2 + (candidateStart.y - pore.y) ** 2 < newPoreRadius ** 2) {
          inPore = true
          break
        }
      }
      if (!inPore && isInside(candidateStart)) {
        startPoint = candidateStart
        chainPoints.push(startPoint)
        break
      }
    }
    if (chainPoints.length === 0) continue

    let currentPoint = { ...chainPoints[0] }
    let currentAngle = random() * 2 * Math.PI

    for (let j = 0; j < chainLength; j++) {
      let nextPoint
      let isValidPoint = false

      for (let k = 0; k < 10; k++) {
        currentAngle += (random() - 0.5) * Math.PI * 0.8
        const candidateNext = {
          x: currentPoint.x + Math.cos(currentAngle) * newStepSize,
          y: currentPoint.y + Math.sin(currentAngle) * newStepSize
        }
        let inPore = false
        for (const pore of poreCenters) {
          if ((candidateNext.x - pore.x) ** 2 + (candidateNext.y - pore.y) ** 2 < newPoreRadius ** 2) {
            inPore = true
            break
          }
        }
        if (!inPore && isInside(candidateNext)) {
          nextPoint = candidateNext
          isValidPoint = true
          break
        }
      }

      if (!isValidPoint) {
        currentAngle += Math.PI
        nextPoint = {
          x: currentPoint.x + Math.cos(currentAngle) * newStepSize,
          y: currentPoint.y + Math.sin(currentAngle) * newStepSize
        }
        if (!isInside(nextPoint)) {
          if (hydrogelShape === 'circle') {
            const circleRadius = Math.min(newW, newH) / 2
            const angleToCenter = Math.atan2(nextPoint.y - centerY, nextPoint.x - centerX)
            nextPoint.x = centerX + Math.cos(angleToCenter) * (circleRadius - 1)
            nextPoint.y = centerY + Math.sin(angleToCenter) * (circleRadius - 1)
          } else {
            nextPoint.x = Math.max(newX, Math.min(newX + newW, nextPoint.x))
            nextPoint.y = Math.max(newY, Math.min(newY + newH, nextPoint.y))
          }
        }
      }

      chainPoints.push(nextPoint)
      currentPoint = nextPoint
    }
    polymerChains.push(chainPoints)
  }

  // Smooth Bézier chains
  polymerChains.forEach((points) => {
    if (points.length < 2) return
    const chainVertices = []
    const smoothingFactor = 0.35

    for (let j = 0; j < points.length; j++) {
      const pPrev = points[j - 1] || points[j]
      const pCurr = points[j]
      const pNext = points[j + 1] || points[j]
      const tangent = { x: pNext.x - pPrev.x, y: pNext.y - pPrev.y }
      const tangentMag = Math.sqrt(tangent.x ** 2 + tangent.y ** 2)
      const unitTangent = tangentMag > 0
        ? { x: tangent.x / tangentMag, y: tangent.y / tangentMag }
        : { x: 0, y: 0 }
      const distPrev = j > 0
        ? Math.sqrt((pCurr.x - pPrev.x) ** 2 + (pCurr.y - pPrev.y) ** 2)
        : 0
      const distNext = j < points.length - 1
        ? Math.sqrt((pNext.x - pCurr.x) ** 2 + (pNext.y - pCurr.y) ** 2)
        : 0
      const cp1 = (j > 0)
        ? { x: -unitTangent.x * distPrev * smoothingFactor, y: -unitTangent.y * distPrev * smoothingFactor }
        : undefined
      const cp2 = (j < points.length - 1)
        ? { x: unitTangent.x * distNext * smoothingFactor, y: unitTangent.y * distNext * smoothingFactor }
        : undefined
      chainVertices.push({ x: pCurr.x, y: pCurr.y, cp1, cp2 })
    }

    chains.push({
      d: verticesToPathD(chainVertices, false),
      stroke: polymerColor,
      strokeWidth: polymerThickness
    })
  })

  // Cross-linkers
  if (networkType === 'cross-linked' && crosslinkDensity > 0 && polymerChains.length > 1) {
    const numCrosslinksToPlace = Math.floor((density * chainLength / 100) * crosslinkDensity)
    const distanceThreshold = newStepSize * 1.5

    for (let i = 0; i < numCrosslinksToPlace; i++) {
      const chain1Index = Math.floor(random() * polymerChains.length)
      const point1Index = Math.floor(random() * polymerChains[chain1Index].length)
      const p1 = polymerChains[chain1Index][point1Index]

      let closestDistSq = Infinity
      let closestPoint = null
      for (let j = 0; j < polymerChains.length; j++) {
        if (j === chain1Index) continue
        for (const p2 of polymerChains[j]) {
          const distSq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2
          if (distSq < closestDistSq) {
            closestDistSq = distSq
            closestPoint = p2
          }
        }
      }

      if (closestPoint && closestDistSq < distanceThreshold ** 2) {
        crosslinks.push({
          cx: (p1.x + closestPoint.x) / 2,
          cy: (p1.y + closestPoint.y) / 2,
          r: crosslinkerRadius,
          fill: crosslinkerColor
        })
      }
    }
  }

  // Encapsulated particles
  if (showParticles) {
    const numToRelease = Math.floor(particleCount * (payloadRelease / 100))
    for (let i = 0; i < particleCount; i++) {
      let center
      if (i < numToRelease) {
        const angle = random() * Math.PI * 2
        const dist = Math.max(newW, newH) * (0.55 + random() * 0.3)
        center = {
          x: (newX + newW / 2) + Math.cos(angle) * dist,
          y: (newY + newH / 2) + Math.sin(angle) * dist
        }
      } else {
        for (let attempt = 0; attempt < 20; attempt++) {
          const candidateCenter = getRandomStartPoint()
          let inPore = false
          for (const pore of poreCenters) {
            if ((candidateCenter.x - pore.x) ** 2 + (candidateCenter.y - pore.y) ** 2 < (newPoreRadius + particleRadius) ** 2) {
              inPore = true
              break
            }
          }
          if (!inPore) {
            center = candidateCenter
            break
          }
        }
        if (!center) continue
      }
      particles.push({
        cx: center.x,
        cy: center.y,
        r: particleRadius,
        fill: particleColor
      })
    }
  }

  return { chains, crosslinks, particles, bounds }
}
