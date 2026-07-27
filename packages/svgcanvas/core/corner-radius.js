/**
 * Live corner radius for rect / polygon (Illustrator-style).
 * @module corner-radius
 * @license MIT
 */

const CORNER_SHAPES = new Set(['rect', 'polygon'])

/**
 * Parse a closed polyline path `d` (M/L/H/V/Z only) into corner vertices.
 * Returns null for open paths, curves, or multi-subpath shapes.
 * @param {string} d
 * @returns {Array<{x:number,y:number}>|null}
 */
export const parseClosedPolylinePathD = (d) => {
  if (!d || /[CcSsQqTtAa]/.test(d) || !/[Zz]/.test(d)) return null
  const tokens = d.match(/[MmLlHhVvZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return null

  const pts = []
  let i = 0
  let cmd = null
  let cx = 0
  let cy = 0
  let subpaths = 0

  const readNum = () => {
    const n = Number(tokens[i++])
    return Number.isFinite(n) ? n : null
  }

  while (i < tokens.length) {
    const t = tokens[i]
    if (/^[MmLlHhVvZz]$/.test(t)) {
      cmd = t
      i++
      if (cmd === 'Z' || cmd === 'z') continue
      if (cmd === 'M' || cmd === 'm') {
        subpaths++
        if (subpaths > 1) return null
      }
    } else if (!cmd) {
      return null
    }

    if (cmd === 'M' || cmd === 'L') {
      const x = readNum()
      const y = readNum()
      if (x === null || y === null) return null
      cx = x
      cy = y
      pts.push({ x: cx, y: cy })
      if (cmd === 'M') cmd = 'L'
    } else if (cmd === 'm' || cmd === 'l') {
      const x = readNum()
      const y = readNum()
      if (x === null || y === null) return null
      cx += x
      cy += y
      pts.push({ x: cx, y: cy })
      if (cmd === 'm') cmd = 'l'
    } else if (cmd === 'H') {
      const x = readNum()
      if (x === null) return null
      cx = x
      pts.push({ x: cx, y: cy })
    } else if (cmd === 'h') {
      const x = readNum()
      if (x === null) return null
      cx += x
      pts.push({ x: cx, y: cy })
    } else if (cmd === 'V') {
      const y = readNum()
      if (y === null) return null
      cy = y
      pts.push({ x: cx, y: cy })
    } else if (cmd === 'v') {
      const y = readNum()
      if (y === null) return null
      cy += y
      pts.push({ x: cx, y: cy })
    } else {
      return null
    }
  }

  if (pts.length >= 2) {
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
      pts.pop()
    }
  }
  return pts.length >= 3 ? pts : null
}

/**
 * Sharp corner vertices for a path (stored or parsed from `d`).
 * @param {Element} elem
 * @returns {Array<{x:number,y:number}>|null}
 */
export const extractSharpCornerPoints = (elem) => {
  if (!elem || elem.tagName !== 'path') return null
  if (elem.hasAttribute('data-corner-points')) {
    const pts = parsePoints(elem.getAttribute('data-corner-points'))
    return pts.length >= 3 ? pts : null
  }
  return parseClosedPolylinePathD(elem.getAttribute('d') || '')
}

/**
 * @param {Element|null} elem
 * @returns {boolean}
 */
export const supportsCornerRadius = (elem) => {
  if (!elem) return false
  if (CORNER_SHAPES.has(elem.tagName)) return true
  if (elem.tagName !== 'path') return false
  if (elem.hasAttribute('data-corner-points')) return true
  // Closed pen-tool polygons (polyline paths with Z)
  return extractSharpCornerPoints(elem) != null
}

/**
 * @param {string} pointsAttr
 * @returns {Array<{x:number,y:number}>}
 */
export const parsePoints = (pointsAttr) => {
  if (!pointsAttr) return []
  const nums = String(pointsAttr).trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
  const pts = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i], y: nums[i + 1] })
  }
  return pts
}

/**
 * @param {Array<{x:number,y:number}>} points
 * @returns {string}
 */
export const pointsToAttr = (points) =>
  points.map((p) => `${p.x},${p.y}`).join(' ')

/**
 * Build a closed path with quadratic rounded corners.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} radius
 * @returns {string}
 */
export const polygonToRoundedPathD = (points, radius) => {
  const n = points.length
  if (n < 3) return ''
  if (!(radius > 0)) {
    return `M${points.map((p) => `${p.x},${p.y}`).join('L')}Z`
  }

  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n]
    const curr = points[i]
    const next = points[(i + 1) % n]
    const v1x = curr.x - prev.x
    const v1y = curr.y - prev.y
    const v2x = next.x - curr.x
    const v2y = next.y - curr.y
    const len1 = Math.hypot(v1x, v1y) || 1
    const len2 = Math.hypot(v2x, v2y) || 1
    const r = Math.min(radius, len1 / 2, len2 / 2)
    const p1x = curr.x - (v1x / len1) * r
    const p1y = curr.y - (v1y / len1) * r
    const p2x = curr.x + (v2x / len2) * r
    const p2y = curr.y + (v2y / len2) * r
    if (i === 0) {
      d += `M${p1x},${p1y}`
    } else {
      d += `L${p1x},${p1y}`
    }
    d += `Q${curr.x},${curr.y} ${p2x},${p2y}`
  }
  return `${d}Z`
}

/**
 * @param {Element} elem
 * @returns {number}
 */
export const getCornerRadius = (elem) => {
  if (!elem) return 0
  if (elem.tagName === 'rect') {
    const rx = Number(elem.getAttribute('rx') || 0)
    const ry = Number(elem.getAttribute('ry') || 0)
    return Math.max(0, Number.isFinite(rx) ? rx : 0, Number.isFinite(ry) ? ry : 0)
  }
  const stored = Number(elem.getAttribute('data-corner-radius') || 0)
  return Number.isFinite(stored) ? Math.max(0, stored) : 0
}

/**
 * @param {Array<{x:number,y:number}>} points
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
const pointsBBox = (points) => {
  if (!points.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * If Live Corner source points drifted from path geometry (e.g. old move bug),
 * shift them so their center matches the path bbox center.
 * @param {Element} elem
 * @param {Array<{x:number,y:number}>} points
 * @returns {Array<{x:number,y:number}>}
 */
const repairDesyncedCornerPoints = (elem, points) => {
  if (elem.tagName !== 'path' || points.length < 3) return points
  // Live transform still maps local points — do not "repair" while transforming
  if (elem.getAttribute('transform')) return points
  // With radius > 0 the rounded path bbox legitimately differs from the sharp
  // corner-points bbox. "Repairing" mid-drag translates the whole shape.
  const storedR = Number(elem.getAttribute('data-corner-radius') || 0)
  if (storedR > 0) return points
  try {
    const bb = elem.getBBox()
    const pb = pointsBBox(points)
    if (!pb || !(bb.width > 0 || bb.height > 0)) return points
    const dcx = (bb.x + bb.width / 2) - (pb.x + pb.width / 2)
    const dcy = (bb.y + bb.height / 2) - (pb.y + pb.height / 2)
    if (Math.hypot(dcx, dcy) < 0.75) return points
    const fixed = points.map((p) => ({ x: p.x + dcx, y: p.y + dcy }))
    elem.setAttribute('data-corner-points', pointsToAttr(fixed))
    return fixed
  } catch (_) {
    return points
  }
}

/**
 * Corner vertices in element local space (rect / polygon / closed path).
 * @param {Element} elem
 * @returns {Array<{x:number,y:number}>}
 */
export const getShapeCornerPoints = (elem) => {
  if (!elem) return []
  if (elem.tagName === 'rect') {
    const x = Number(elem.getAttribute('x') || 0)
    const y = Number(elem.getAttribute('y') || 0)
    const w = Number(elem.getAttribute('width') || 0)
    const h = Number(elem.getAttribute('height') || 0)
    if (!(w > 0 && h > 0)) return []
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ]
  }
  if (elem.tagName === 'polygon') {
    return parsePoints(elem.getAttribute('points'))
  }
  const pts = extractSharpCornerPoints(elem) || []
  return repairDesyncedCornerPoints(elem, pts)
}

/**
 * @param {Array<{x:number,y:number}>} points
 * @returns {{x:number,y:number}}
 */
export const polygonCentroid = (points) => {
  let x = 0
  let y = 0
  const n = points.length || 1
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / n, y: y / n }
}

/**
 * Shoelace signed area. >0 means counter-clockwise in this coordinate system.
 * @param {Array<{x:number,y:number}>} points
 * @returns {number}
 */
export const polygonSignedArea = (points) => {
  let a = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const q = points[(i + 1) % n]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** Max interior corner angle (deg) that still shows a Live Corner grip (Illustrator-like). */
export const CORNER_GRIP_MAX_ANGLE_DEG = 160

/**
 * Smaller angle at a vertex between the two adjacent edges (0–180°).
 * @param {{x:number,y:number}} prev
 * @param {{x:number,y:number}} curr
 * @param {{x:number,y:number}} next
 * @returns {number}
 */
export const cornerAngleDegrees = (prev, curr, next) => {
  const v1x = prev.x - curr.x
  const v1y = prev.y - curr.y
  const v2x = next.x - curr.x
  const v2y = next.y - curr.y
  const len1 = Math.hypot(v1x, v1y) || 1
  const len2 = Math.hypot(v2x, v2y) || 1
  const cosA = Math.max(-1, Math.min(1, (v1x / len1) * (v2x / len2) + (v1y / len1) * (v2y / len2)))
  return Math.acos(cosA) * (180 / Math.PI)
}

/**
 * True if this vertex is convex given polygon winding (signedArea).
 * @param {{x:number,y:number}} prev
 * @param {{x:number,y:number}} curr
 * @param {{x:number,y:number}} next
 * @param {number} signedArea
 * @returns {boolean}
 */
export const isConvexCorner = (prev, curr, next, signedArea) => {
  const e1x = curr.x - prev.x
  const e1y = curr.y - prev.y
  const e2x = next.x - curr.x
  const e2y = next.y - curr.y
  const cross = e1x * e2y - e1y * e2x
  if (Math.abs(cross) < 1e-12) return true
  return (cross > 0) === (signedArea > 0)
}

/**
 * Interior angle at a vertex (0–360°), winding-aware.
 * @param {{x:number,y:number}} prev
 * @param {{x:number,y:number}} curr
 * @param {{x:number,y:number}} next
 * @param {number} signedArea
 * @returns {number}
 */
export const cornerInteriorAngleDegrees = (prev, curr, next, signedArea) => {
  const smaller = cornerAngleDegrees(prev, curr, next)
  return isConvexCorner(prev, curr, next, signedArea) ? smaller : (360 - smaller)
}

/**
 * Whether this vertex should show a corner-radius grip (interior &lt; ~160°).
 * @param {{x:number,y:number}} prev
 * @param {{x:number,y:number}} curr
 * @param {{x:number,y:number}} next
 * @param {number} signedArea
 * @param {number} [maxAngleDeg]
 * @returns {boolean}
 */
export const isCornerGripEligible = (
  prev,
  curr,
  next,
  signedArea,
  maxAngleDeg = CORNER_GRIP_MAX_ANGLE_DEG
) => cornerInteriorAngleDegrees(prev, curr, next, signedArea) < maxAngleDeg

/**
 * Unit bisector pointing into the polygon fill (winding-aware).
 * @param {{x:number,y:number}} prev
 * @param {{x:number,y:number}} curr
 * @param {{x:number,y:number}} next
 * @param {number} signedArea
 * @returns {{x:number,y:number,sinHalf:number}}
 */
export const inwardCornerBisector = (prev, curr, next, signedArea) => {
  const e1x = curr.x - prev.x
  const e1y = curr.y - prev.y
  const e2x = next.x - curr.x
  const e2y = next.y - curr.y
  const len1 = Math.hypot(e1x, e1y) || 1
  const len2 = Math.hypot(e2x, e2y) || 1
  // Left normals of edges; flip for clockwise polygons
  const sign = signedArea >= 0 ? 1 : -1
  const n1x = sign * (-e1y / len1)
  const n1y = sign * (e1x / len1)
  const n2x = sign * (-e2y / len2)
  const n2y = sign * (e2x / len2)
  let bx = n1x + n2x
  let by = n1y + n2y
  let blen = Math.hypot(bx, by)
  if (blen < 1e-8) {
    bx = n1x
    by = n1y
    blen = Math.hypot(bx, by) || 1
  }
  bx /= blen
  by /= blen
  const smaller = cornerAngleDegrees(prev, curr, next)
  const sinHalf = Math.sin((smaller * Math.PI) / 180 / 2) || 1e-6
  return { x: bx, y: by, sinHalf }
}

/**
 * Widget position just inside a corner along the fill-side bisector.
 * @param {{x:number,y:number}} prev
 * @param {{x:number,y:number}} curr
 * @param {{x:number,y:number}} next
 * @param {number} radius current corner radius
 * @param {number} minInset minimum inset in the same units as the points
 * @param {number} signedArea
 * @returns {{x:number,y:number}}
 */
export const cornerWidgetPosition = (prev, curr, next, radius, minInset, signedArea) => {
  const { x: bx, y: by, sinHalf } = inwardCornerBisector(prev, curr, next, signedArea)
  const r = Math.max(0, radius || 0)
  const alongBisector = Math.max(minInset, r / sinHalf)
  return {
    x: curr.x + bx * alongBisector,
    y: curr.y + by * alongBisector
  }
}

/**
 * Max uniform radius limited by shortest adjacent edge halves.
 * @param {Array<{x:number,y:number}>} points
 * @returns {number}
 */
export const getMaxCornerRadiusForPoints = (points) => {
  const n = points.length
  if (n < 3) return 0
  let maxR = Infinity
  for (let i = 0; i < n; i++) {
    const prev = points[(i + n - 1) % n]
    const curr = points[i]
    const next = points[(i + 1) % n]
    const len1 = Math.hypot(curr.x - prev.x, curr.y - prev.y)
    const len2 = Math.hypot(next.x - curr.x, next.y - curr.y)
    maxR = Math.min(maxR, len1 / 2, len2 / 2)
  }
  return Number.isFinite(maxR) ? Math.max(0, maxR) : 0
}

/**
 * Maximum uniform corner radius for the element.
 * @param {Element} elem
 * @returns {number}
 */
export const getMaxCornerRadius = (elem) => {
  if (!elem) return 0
  const pts = getShapeCornerPoints(elem)
  if (pts.length >= 3) {
    return getMaxCornerRadiusForPoints(pts)
  }
  try {
    const b = elem.getBBox()
    return Math.max(0, Math.min(b.width, b.height) / 2)
  } catch (_) {
    return 0
  }
}

/**
 * Radius from dragging near a vertex (projection onto inward bisector).
 * @param {{x:number,y:number}} prev
 * @param {{x:number,y:number}} curr
 * @param {{x:number,y:number}} next
 * @param {number} x mouse in user space
 * @param {number} y mouse in user space
 * @param {number} maxR
 * @param {number} signedArea
 * @returns {number}
 */
export const radiusFromVertexDrag = (prev, curr, next, x, y, maxR, signedArea) => {
  const { x: bx, y: by, sinHalf } = inwardCornerBisector(prev, curr, next, signedArea)
  const proj = (x - curr.x) * bx + (y - curr.y) * by
  const r = proj * sinHalf
  return Math.max(0, Math.min(r, maxR))
}

/**
 * Apply uniform corner radius. Mutates the element (may convert polygon→path).
 * @param {Element} elem
 * @param {number} radius
 * @returns {{elem: Element, changedAttrs: Record<string, string|null>}|null}
 *   `elem` may be a replacement path; `changedAttrs` are previous values for undo.
 */
export const applyCornerRadius = (elem, radius) => {
  if (!supportsCornerRadius(elem)) return null
  const r = Math.max(0, Number(radius) || 0)
  const maxR = getMaxCornerRadius(elem)
  const clamped = Math.min(r, maxR || r)

  if (elem.tagName === 'rect') {
    const oldRx = elem.getAttribute('rx')
    const oldRy = elem.getAttribute('ry')
    if (clamped <= 0) {
      elem.removeAttribute('rx')
      elem.removeAttribute('ry')
    } else {
      elem.setAttribute('rx', clamped)
      elem.setAttribute('ry', clamped)
    }
    return { elem, changedAttrs: { rx: oldRx, ry: oldRy } }
  }

  // polygon or closed path (pen tool / converted polygon)
  let points = []
  if (elem.tagName === 'polygon') {
    points = parsePoints(elem.getAttribute('points'))
  } else {
    points = extractSharpCornerPoints(elem) || []
  }
  if (points.length < 3) return null

  const oldD = elem.tagName === 'path' ? elem.getAttribute('d') : null
  const oldPoints = elem.tagName === 'polygon' ? elem.getAttribute('points') : null
  const oldRadius = elem.getAttribute('data-corner-radius')
  const oldCornerPoints = elem.getAttribute('data-corner-points')

  if (elem.tagName === 'polygon') {
    // Convert to path so rounded corners can be expressed
    const path = elem.ownerDocument.createElementNS(elem.namespaceURI, 'path')
    Array.from(elem.attributes).forEach((attr) => {
      if (attr.name === 'points') return
      path.setAttribute(attr.name, attr.value)
    })
    path.setAttribute('data-corner-points', pointsToAttr(points))
    path.setAttribute('data-corner-radius', String(clamped))
    path.setAttribute('d', polygonToRoundedPathD(points, clamped))
    const parent = elem.parentNode
    const nextSibling = elem.nextSibling
    parent?.replaceChild(path, elem)
    return {
      elem: path,
      changedAttrs: {
        points: oldPoints
      },
      replacedFrom: elem,
      parent,
      nextSibling
    }
  }

  elem.setAttribute('data-corner-points', pointsToAttr(points))
  elem.setAttribute('data-corner-radius', String(clamped))
  elem.setAttribute('d', polygonToRoundedPathD(points, clamped))
  return {
    elem,
    changedAttrs: {
      d: oldD,
      'data-corner-radius': oldRadius,
      'data-corner-points': oldCornerPoints
    }
  }
}

/**
 * Compute radius from drag relative to a bbox corner (rect fallback).
 * @param {'nw'|'ne'|'se'|'sw'} dir
 * @param {{x:number,y:number,width:number,height:number}} box
 * @param {number} x mouse in user space
 * @param {number} y mouse in user space
 * @returns {number}
 */
export const radiusFromCornerDrag = (dir, box, x, y) => {
  const corners = {
    nw: { x: box.x, y: box.y, sx: 1, sy: 1 },
    ne: { x: box.x + box.width, y: box.y, sx: -1, sy: 1 },
    se: { x: box.x + box.width, y: box.y + box.height, sx: -1, sy: -1 },
    sw: { x: box.x, y: box.y + box.height, sx: 1, sy: -1 }
  }
  const c = corners[dir]
  if (!c) return 0
  const dx = (x - c.x) * c.sx
  const dy = (y - c.y) * c.sy
  const maxR = Math.min(box.width, box.height) / 2
  return Math.max(0, Math.min(Math.min(dx, dy), maxR))
}
