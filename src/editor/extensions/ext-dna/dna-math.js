/**
 * B-DNA double-helix geometry along a polyline — ported from LabCanvas
 * (2d-editor/brushes/dna + helix-brush-params).
 * @license MIT
 */

export const DEFAULTS = {
  thickness: 1,
  styleMode: 'cartoon', // cartoon | molecular
  strandColor: '#2563eb',
  rungColor: '#f59e0b',
  basePairMode: 'mono', // mono | at-gc
  basePairColorAT: '#3b82f6',
  basePairColorGC: '#ef4444',
  singleStrandOnly: false,
  showBasePairs: true,
  showDirectionality: false,
  showHistones: false,
  histoneEveryBp: 60,
  annotationEveryBp: 0,
  annotationStartBp: 1
}

/** LabCanvas B-DNA fixed scales */
const BP_PER_TURN = 10.5
const HELIX_RADIUS_SCALE = 9
const GROOVE_PHASE_OFFSET = 0.62

/**
 * @param {number} thickness
 */
export const helixParamsFromThickness = (thickness) => {
  const t = Math.max(0.5, Number(thickness) || 1)
  const basePairSpacing = 4 * t
  return {
    thickness: t,
    helixRadius: HELIX_RADIUS_SCALE * t,
    strandWidth: 3.2 * t,
    basePairSpacing,
    bpPerTurn: BP_PER_TURN,
    twistPitch: basePairSpacing * BP_PER_TURN,
    groovePhaseOffset: GROOVE_PHASE_OFFSET
  }
}

/**
 * @param {'mono'|'at-gc'} mode
 * @param {number} rungIndex
 * @param {string} rungColor
 * @param {string} colorAT
 * @param {string} colorGC
 */
export const basePairRungColor = (mode, rungIndex, rungColor, colorAT, colorGC) => {
  if (mode === 'at-gc') {
    return rungIndex % 2 === 0 ? colorAT : colorGC
  }
  return rungColor
}

/**
 * @param {{x:number,y:number}[]} verts
 * @returns {number}
 */
export const getPathLength = (verts) => {
  if (!verts || verts.length < 2) return 0
  let total = 0
  for (let i = 1; i < verts.length; i++) {
    total += Math.hypot(verts[i].x - verts[i - 1].x, verts[i].y - verts[i - 1].y)
  }
  return total
}

/**
 * @param {{x:number,y:number}[]} verts
 * @param {number} targetLength
 * @returns {{point:{x:number,y:number}, angle:number}}
 */
export const getPointAtLength = (verts, targetLength) => {
  if (!verts || verts.length < 2) {
    return { point: { x: 0, y: 0 }, angle: 0 }
  }
  const total = getPathLength(verts)
  if (total <= 1e-12) {
    return { point: { x: verts[0].x, y: verts[0].y }, angle: 0 }
  }
  let s = Math.min(Math.max(0, targetLength), total - 1e-9)
  let acc = 0
  for (let i = 0; i < verts.length - 1; i++) {
    const a = verts[i]
    const b = verts[i + 1]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (acc + L >= s - 1e-8) {
      const t = L <= 1e-12 ? 0 : (s - acc) / L
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle
      }
    }
    acc += L
  }
  const a = verts[verts.length - 2]
  const b = verts[verts.length - 1]
  return {
    point: { x: b.x, y: b.y },
    angle: Math.atan2(b.y - a.y, b.x - a.x)
  }
}

/**
 * @param {string} pointsAttr JSON or "x,y x,y ..."
 * @returns {{x:number,y:number}[]}
 */
export const parsePoints = (pointsAttr) => {
  if (!pointsAttr) return []
  try {
    const parsed = JSON.parse(pointsAttr)
    if (Array.isArray(parsed)) {
      return parsed
        .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    }
  } catch (_) { /* fall through */ }
  const out = []
  const re = /([-\d.]+)[,\s]+([-\d.]+)/g
  let m
  while ((m = re.exec(pointsAttr))) {
    out.push({ x: Number(m[1]), y: Number(m[2]) })
  }
  return out
}

/**
 * @param {{x:number,y:number}[]} verts
 * @returns {string}
 */
export const serializePoints = (verts) => JSON.stringify(
  verts.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }))
)

/**
 * Polyline points → SVG path d (open path, line segments).
 * @param {{x:number,y:number}[]} verts
 * @returns {string}
 */
export const pointsToPathD = (verts) => {
  if (!verts?.length) return ''
  let d = `M${verts[0].x} ${verts[0].y}`
  for (let i = 1; i < verts.length; i++) {
    d += ` L${verts[i].x} ${verts[i].y}`
  }
  return d
}

/** Default minimum spacing between spine edit anchors (screen px). */
export const SPINE_MIN_DIST = 28

/** Max anchor points on the editable Bézier spine after simplification. */
export const SPINE_MAX_POINTS = 20

/**
 * Thin freehand points so the editable spine has a manageable node count.
 * @param {{x:number,y:number}[]} verts
 * @param {number} [minDist=SPINE_MIN_DIST]
 */
export const simplifyPoints = (verts, minDist = SPINE_MIN_DIST) => {
  if (!verts || verts.length < 2) return verts || []
  const out = [verts[0]]
  for (let i = 1; i < verts.length - 1; i++) {
    const last = out[out.length - 1]
    if (Math.hypot(verts[i].x - last.x, verts[i].y - last.y) >= minDist) {
      out.push(verts[i])
    }
  }
  const end = verts[verts.length - 1]
  const last = out[out.length - 1]
  if (last !== end && Math.hypot(end.x - last.x, end.y - last.y) > 0.5) {
    out.push(end)
  } else if (last !== end) {
    out[out.length - 1] = end
  }
  return out
}

/**
 * Freehand points → smooth cubic Bézier path (Catmull–Rom → cubic).
 * Double-click spine edit then shows normal SVGEdit Bézier handles.
 * @param {{x:number,y:number}[]} verts
 * @param {{minDist?:number, maxPts?:number}} [opts]
 * @returns {string}
 */
export const pointsToSmoothPathD = (verts, opts = {}) => {
  const maxPts = opts.maxPts ?? SPINE_MAX_POINTS
  let minDist = opts.minDist ?? SPINE_MIN_DIST
  let pts = simplifyPoints(verts, minDist)
  while (pts.length > maxPts && minDist < 160) {
    minDist += 10
    pts = simplifyPoints(verts, minDist)
  }
  if (pts.length < 2) return pointsToPathD(pts)
  if (pts.length === 2) return pointsToPathD(pts)
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`
  }
  return d
}

/** Reusable off-DOM path for getTotalLength / getPointAtLength */
let _measurePath = null
const getMeasurePath = () => {
  if (typeof document === 'undefined') return null
  if (_measurePath) return _measurePath
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.cssText = 'position:absolute;left:-9999px;top:-9999px;overflow:hidden'
  _measurePath = document.createElementNS(ns, 'path')
  svg.appendChild(_measurePath)
  if (document.body) document.body.appendChild(svg)
  return _measurePath
}

const cubicAt = (p0, p1, p2, p3, t) => {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  }
}

const quadAt = (p0, p1, p2, t) => {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  }
}

/**
 * Densify M/L/C/Q path `d` into a polyline (absolute commands; our emitters use these).
 * Fallback when SVGGeometryElement APIs are unavailable (e.g. Node).
 * @param {string} d
 * @param {number} [stepsPerCurve=10]
 * @returns {{x:number,y:number}[]}
 */
export const pathDToPolyline = (d, stepsPerCurve = 10) => {
  if (!d || typeof d !== 'string') return []
  const parts = d.match(/[MLCQZmlcqz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)
  if (!parts?.length) return []
  const pts = []
  let i = 0
  let cmd = 'M'
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  const num = () => Number(parts[i++])
  while (i < parts.length) {
    const t = parts[i]
    if (/^[MLCQZmlcqz]$/.test(t)) {
      cmd = t
      i++
    }
    if (cmd === 'Z' || cmd === 'z') {
      pts.push({ x: sx, y: sy })
      x = sx
      y = sy
      continue
    }
    if (cmd === 'M' || cmd === 'm') {
      const abs = cmd === 'M'
      const nx = abs ? num() : x + num()
      const ny = abs ? num() : y + num()
      x = nx
      y = ny
      sx = x
      sy = y
      pts.push({ x, y })
      cmd = abs ? 'L' : 'l'
      continue
    }
    if (cmd === 'L' || cmd === 'l') {
      const abs = cmd === 'L'
      x = abs ? num() : x + num()
      y = abs ? num() : y + num()
      pts.push({ x, y })
      continue
    }
    if (cmd === 'C' || cmd === 'c') {
      const abs = cmd === 'C'
      const x1 = abs ? num() : x + num()
      const y1 = abs ? num() : y + num()
      const x2 = abs ? num() : x + num()
      const y2 = abs ? num() : y + num()
      const x3 = abs ? num() : x + num()
      const y3 = abs ? num() : y + num()
      const p0 = { x, y }
      const p1 = { x: x1, y: y1 }
      const p2 = { x: x2, y: y2 }
      const p3 = { x: x3, y: y3 }
      for (let s = 1; s <= stepsPerCurve; s++) {
        pts.push(cubicAt(p0, p1, p2, p3, s / stepsPerCurve))
      }
      x = x3
      y = y3
      continue
    }
    if (cmd === 'Q' || cmd === 'q') {
      const abs = cmd === 'Q'
      const x1 = abs ? num() : x + num()
      const y1 = abs ? num() : y + num()
      const x2 = abs ? num() : x + num()
      const y2 = abs ? num() : y + num()
      const p0 = { x, y }
      const p1 = { x: x1, y: y1 }
      const p2 = { x: x2, y: y2 }
      for (let s = 1; s <= stepsPerCurve; s++) {
        pts.push(quadAt(p0, p1, p2, s / stepsPerCurve))
      }
      x = x2
      y = y2
      continue
    }
    // Unknown / incomplete — bail
    break
  }
  return pts
}

/**
 * Sampler along a path `d` (supports L/C/Q — native SVG geometry in browser).
 * @param {string} d
 * @returns {{pathLength:number, at:(s:number)=>{point:{x:number,y:number}, angle:number}, hitD:string}|null}
 */
export const createPathDSampler = (d) => {
  if (!d || typeof d !== 'string' || !d.trim()) return null
  try {
    const path = getMeasurePath()
    if (path) {
      path.setAttribute('d', d)
      const pathLength = path.getTotalLength()
      if (Number.isFinite(pathLength) && pathLength >= 1e-6) {
        return {
          pathLength,
          hitD: d,
          at (s) {
            const s0 = Math.min(Math.max(0, s), pathLength - 1e-9)
            const p = path.getPointAtLength(s0)
            const back = path.getPointAtLength(Math.max(0, s0 - 0.75))
            const fwd = path.getPointAtLength(Math.min(pathLength, s0 + 0.75))
            return {
              point: { x: p.x, y: p.y },
              angle: Math.atan2(fwd.y - back.y, fwd.x - back.x)
            }
          }
        }
      }
    }
  } catch (_) { /* fall through */ }

  const poly = pathDToPolyline(d, 12)
  const sampler = createPolylineSampler(poly)
  if (!sampler) return null
  return { ...sampler, hitD: d }
}

/**
 * Sampler along polyline vertices (legacy / freehand while drawing).
 * @param {{x:number,y:number}[]} verts
 */
export const createPolylineSampler = (verts) => {
  if (!verts || verts.length < 2) return null
  const pathLength = getPathLength(verts)
  if (pathLength < 1e-6) return null
  return {
    pathLength,
    hitD: pointsToPathD(verts),
    at (s) {
      return getPointAtLength(verts, s)
    }
  }
}

const labelPointOutside = (point, neighbor, side, gap) => {
  const dx = neighbor.x - point.x
  const dy = neighbor.y - point.y
  const len = Math.hypot(dx, dy) || 1
  const tx = dx / len
  const ty = dy / len
  const nx = -ty
  const ny = tx
  return { x: point.x + nx * gap * side, y: point.y + ny * gap * side }
}

/**
 * Sample helix strand positions along a sampler (LabCanvas drawNucleicAcidHelixCanvas2D).
 * @param {{pathLength:number, at:Function}} sampler
 * @param {object} hp helix params from thickness
 * @param {boolean} [preview] coarser/faster sampling while dragging spine nodes
 */
const sampleHelix = (sampler, hp, preview = false) => {
  const pathLength = sampler.pathLength
  if (pathLength <= 0) return { pathLength: 0, samples: [] }
  const step = preview
    ? Math.max(22, hp.twistPitch / 3.5)
    : Math.max(3, Math.min(8, hp.twistPitch / 22))
  const samples = []
  for (let s = 0; s <= pathLength; s += step) {
    const { point, angle } = sampler.at(s)
    const thetaA = (s / Math.max(1, hp.twistPitch)) * Math.PI * 2
    const thetaB = thetaA + Math.PI - hp.groovePhaseOffset
    const tan = { x: Math.cos(angle), y: Math.sin(angle) }
    const perp = { x: Math.cos(angle + Math.PI / 2), y: Math.sin(angle + Math.PI / 2) }
    const lateralA = hp.helixRadius * Math.sin(thetaA)
    const axialA = hp.helixRadius * 0.55 * Math.cos(thetaA)
    const lateralB = hp.helixRadius * Math.sin(thetaB)
    const axialB = hp.helixRadius * 0.55 * Math.cos(thetaB)
    samples.push({
      s,
      a: {
        x: point.x + perp.x * lateralA + tan.x * axialA,
        y: point.y + perp.y * lateralA + tan.y * axialA
      },
      b: {
        x: point.x + perp.x * lateralB + tan.x * axialB,
        y: point.y + perp.y * lateralB + tan.y * axialB
      },
      depth: Math.cos(thetaA)
    })
  }
  return { pathLength, samples }
}

/**
 * Build path d for one strand depth layer (LabCanvas drawStrand).
 * back = depth < 0, front = depth >= 0. Consecutive segments are joined;
 * gaps only where the strand ducks behind at a depth flip.
 */
const strandPathD = (samples, pick, layer) => {
  let d = ''
  let drawing = false
  let last = null
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]
    const cur = samples[i]
    const depth = (prev.depth + cur.depth) * 0.5
    // Match LabCanvas: skip when (back && depth>=0) || (front && depth<0)
    if (layer === 'back' ? depth >= 0 : depth < 0) {
      drawing = false
      last = null
      continue
    }
    const p0 = pick(prev)
    const p1 = pick(cur)
    if (!drawing || !last || Math.hypot(p0.x - last.x, p0.y - last.y) > 0.6) {
      d += `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`
      drawing = true
    }
    d += `L${p1.x.toFixed(2)},${p1.y.toFixed(2)}`
    last = p1
  }
  return d
}

const computeRungs = (sampler, pathLength, hp, params) => {
  const rungs = []
  if (!params.showBasePairs) return rungs
  let rungIndex = 0
  for (let s = hp.basePairSpacing * 0.5; s <= pathLength; s += Math.max(4, hp.basePairSpacing)) {
    const { point, angle } = sampler.at(s)
    const thetaA = (s / Math.max(1, hp.twistPitch)) * Math.PI * 2
    const thetaB = thetaA + Math.PI - hp.groovePhaseOffset
    const tan = { x: Math.cos(angle), y: Math.sin(angle) }
    const perp = { x: Math.cos(angle + Math.PI / 2), y: Math.sin(angle + Math.PI / 2) }
    const a = {
      x: point.x + perp.x * (hp.helixRadius * Math.sin(thetaA)) + tan.x * (hp.helixRadius * 0.55 * Math.cos(thetaA)),
      y: point.y + perp.y * (hp.helixRadius * Math.sin(thetaA)) + tan.y * (hp.helixRadius * 0.55 * Math.cos(thetaA))
    }
    const b = {
      x: point.x + perp.x * (hp.helixRadius * Math.sin(thetaB)) + tan.x * (hp.helixRadius * 0.55 * Math.cos(thetaB)),
      y: point.y + perp.y * (hp.helixRadius * Math.sin(thetaB)) + tan.y * (hp.helixRadius * 0.55 * Math.cos(thetaB))
    }
    const depth = Math.cos(thetaA)
    const depth01 = Math.min(1, Math.max(0, (depth + 1) * 0.5))
    const rungShorten = 0.82 + depth01 * 0.22
    const mid = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }
    const a2 = { x: mid.x + (a.x - mid.x) * rungShorten, y: mid.y + (a.y - mid.y) * rungShorten }
    const b2 = params.singleStrandOnly
      ? mid
      : { x: mid.x + (b.x - mid.x) * rungShorten, y: mid.y + (b.y - mid.y) * rungShorten }
    rungs.push({
      x1: a2.x, y1: a2.y, x2: b2.x, y2: b2.y,
      color: basePairRungColor(
        params.basePairMode, rungIndex, params.rungColor,
        params.basePairColorAT, params.basePairColorGC
      )
    })
    rungIndex += 1
  }
  return rungs
}

const computeHistones = (sampler, pathLength, hp, params) => {
  if (!params.showHistones) return []
  const spacing = Math.max(30, hp.basePairSpacing * params.histoneEveryBp)
  const coreRadius = hp.helixRadius * 1.85
  const wrapRadius = coreRadius * 1.08
  const turns = 1.72
  const steps = 80
  const histones = []

  for (let s = spacing * 0.5; s <= pathLength; s += spacing) {
    const { point, angle } = sampler.at(s)
    const tan = { x: Math.cos(angle), y: Math.sin(angle) }
    const perp = { x: Math.cos(angle + Math.PI / 2), y: Math.sin(angle + Math.PI / 2) }
    const unitR = coreRadius * 0.55
    const units = []
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      const ringR = coreRadius * 0.92
      units.push({
        x: point.x + perp.x * (Math.cos(a) * ringR) + tan.x * (Math.sin(a) * ringR * 0.48),
        y: point.y + perp.y * (Math.cos(a) * ringR) + tan.y * (Math.sin(a) * ringR * 0.48),
        depth: Math.cos(a),
        r: unitR
      })
    }
    const wrapPts = []
    for (let i = 0; i <= steps; i++) {
      const t01 = i / steps
      const theta = (-0.5 * turns * Math.PI * 2) + t01 * (turns * Math.PI * 2)
      wrapPts.push({
        x: point.x + perp.x * (Math.cos(theta) * wrapRadius) + tan.x * (Math.sin(theta) * wrapRadius * 0.52),
        y: point.y + perp.y * (Math.cos(theta) * wrapRadius) + tan.y * (Math.sin(theta) * wrapRadius * 0.52),
        depth: Math.cos(theta)
      })
    }
    const linkLen = coreRadius * 0.9
    histones.push({
      cx: point.x,
      cy: point.y,
      coreR: coreRadius * 0.88,
      units,
      wrapPts,
      strandSep: Math.max(2, hp.strandWidth * 0.55),
      linker: {
        x1: point.x - tan.x * linkLen,
        y1: point.y - tan.y * linkLen,
        x2: point.x - tan.x * (coreRadius * 0.25),
        y2: point.y - tan.y * (coreRadius * 0.25),
        x3: point.x + tan.x * (coreRadius * 0.25),
        y3: point.y + tan.y * (coreRadius * 0.25),
        x4: point.x + tan.x * linkLen,
        y4: point.y + tan.y * linkLen
      }
    })
  }
  return histones
}

/**
 * Resolve a sampler from points and/or spine path d.
 * @param {string|{x:number,y:number}[]|{spineD?:string, points?:{x:number,y:number}[]}} source
 */
export const resolveDnaSampler = (source) => {
  if (typeof source === 'string') return createPathDSampler(source)
  if (Array.isArray(source)) return createPolylineSampler(source)
  if (source && typeof source === 'object') {
    if (source.spineD) return createPathDSampler(source.spineD)
    if (source.points?.length >= 2) return createPolylineSampler(source.points)
  }
  return null
}

/**
 * Full DNA geometry for SVG emission.
 * Source may be polyline points, a path `d`, or `{ spineD, points }`.
 * @param {string|{x:number,y:number}[]|{spineD?:string, points?:{x:number,y:number}[]}} source
 * @param {object} userParams
 */
export const computeDnaGeometry = (source, userParams = {}) => {
  const params = { ...DEFAULTS, ...userParams }
  const preview = !!params.livePreview
  const hp = helixParamsFromThickness(params.thickness)
  const sampler = resolveDnaSampler(source)
  if (!sampler) {
    return { pathLength: 0, empty: true }
  }

  const { pathLength, samples } = sampleHelix(sampler, hp, preview)
  if (pathLength < 2 || samples.length < 2) {
    return { pathLength, empty: true, spineD: sampler.hitD }
  }

  const pickA = (s) => s.a
  const pickB = (s) => s.b
  const backA = strandPathD(samples, pickA, 'back')
  const frontA = strandPathD(samples, pickA, 'front')
  const backB = params.singleStrandOnly ? '' : strandPathD(samples, pickB, 'back')
  const frontB = params.singleStrandOnly ? '' : strandPathD(samples, pickB, 'front')
  const rungs = preview ? [] : computeRungs(sampler, pathLength, hp, params)
  const histones = preview ? [] : computeHistones(sampler, pathLength, hp, params)

  // Molecular atoms/bonds
  let molBondsBack = ''
  let molBondsFront = ''
  let molAtoms = ''
  let molMids = ''
  if (!preview && params.styleMode === 'molecular') {
    const step = 2
    const atomR = Math.max(1.4, hp.strandWidth * 0.25)
    for (let i = step; i < samples.length; i += step) {
      const prev = samples[i - step]
      const cur = samples[i]
      const depth = (prev.depth + cur.depth) * 0.5
      const segA = `M${prev.a.x.toFixed(2)},${prev.a.y.toFixed(2)}L${cur.a.x.toFixed(2)},${cur.a.y.toFixed(2)}`
      const segB = params.singleStrandOnly
        ? ''
        : `M${prev.b.x.toFixed(2)},${prev.b.y.toFixed(2)}L${cur.b.x.toFixed(2)},${cur.b.y.toFixed(2)}`
      if (depth >= 0) {
        molBondsBack += segA + segB
      } else {
        molBondsFront += segA + segB
      }
    }
    for (let i = 0; i < samples.length; i += step) {
      const s = samples[i]
      molAtoms += `M${(s.a.x - atomR).toFixed(2)},${s.a.y.toFixed(2)}a${atomR},${atomR} 0 1,0 ${(atomR * 2).toFixed(2)},0a${atomR},${atomR} 0 1,0 ${(-atomR * 2).toFixed(2)},0`
      if (!params.singleStrandOnly) {
        molAtoms += `M${(s.b.x - atomR).toFixed(2)},${s.b.y.toFixed(2)}a${atomR},${atomR} 0 1,0 ${(atomR * 2).toFixed(2)},0a${atomR},${atomR} 0 1,0 ${(-atomR * 2).toFixed(2)},0`
        if (params.showBasePairs) {
          const mid = { x: (s.a.x + s.b.x) * 0.5, y: (s.a.y + s.b.y) * 0.5 }
          const mr = atomR * 0.85
          molMids += `M${(mid.x - mr).toFixed(2)},${mid.y.toFixed(2)}a${mr},${mr} 0 1,0 ${(mr * 2).toFixed(2)},0a${mr},${mr} 0 1,0 ${(-mr * 2).toFixed(2)},0`
        }
      }
    }
  }

  // Polarity 5'/3'
  const polarity = []
  if (!preview && params.showDirectionality && samples.length >= 2) {
    const first = samples[0]
    const firstNext = samples[Math.min(1, samples.length - 1)]
    const last = samples[samples.length - 1]
    const lastPrev = samples[Math.max(0, samples.length - 2)]
    const tagGap = Math.max(20, hp.helixRadius * 0.85 + hp.strandWidth * 2.2)
    const fontSize = Math.max(11, 9 + hp.thickness * 3.4)
    polarity.push({ text: "5'", ...labelPointOutside(first.a, firstNext.a, -1, tagGap), fontSize })
    polarity.push({ text: "3'", ...labelPointOutside(last.a, lastPrev.a, -1, tagGap), fontSize })
    if (!params.singleStrandOnly) {
      polarity.push({ text: "3'", ...labelPointOutside(first.b, firstNext.b, 1, tagGap), fontSize })
      polarity.push({ text: "5'", ...labelPointOutside(last.b, lastPrev.b, 1, tagGap), fontSize })
    }
  }

  // Annotations
  const annotations = []
  if (!preview && params.annotationEveryBp > 0) {
    const stride = hp.basePairSpacing * params.annotationEveryBp
    let idx = 0
    const fontSize = Math.max(8, 6.5 + hp.thickness * 2.2)
    const labelGap = Math.max(16, hp.helixRadius + hp.strandWidth * 1.8)
    for (let s = hp.basePairSpacing * 0.5; s <= pathLength; s += stride) {
      const { point } = sampler.at(s)
      annotations.push({
        text: String(params.annotationStartBp + idx * params.annotationEveryBp),
        x: point.x,
        y: point.y + labelGap,
        fontSize
      })
      idx += 1
    }
  }

  // Hit / spine = source centerline (supports L/C/Q)
  const hitD = sampler.hitD || ''

  return {
    empty: false,
    pathLength,
    hp,
    params,
    samples,
    cartoon: { backA, frontA, backB, frontB, rungs },
    molecular: { molBondsBack, molBondsFront, molAtoms, molMids },
    histones,
    polarity,
    annotations,
    hitD,
    spineD: hitD
  }
}
