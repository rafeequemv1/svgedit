/**
 * Arc math for three-point curved arrows.
 * Based on Steve Ruiz, "All About Arcs" / tldraw arrow geometry.
 * @see https://www.steveruiz.me/posts/all-about-arcs
 */

/**
 * @typedef {{ x: number, y: number }} VecLike
 */

/**
 * Find a circle that passes through three points.
 * @param {VecLike} a
 * @param {VecLike} b
 * @param {VecLike} c
 * @returns {{ center: VecLike, radius: number } | null}
 */
export function getCircleFromThreePoints (a, b, c) {
  const u =
    -2 * (a.x * (b.y - c.y) - a.y * (b.x - c.x) + b.x * c.y - c.x * b.y)

  if (!Number.isFinite(u) || Math.abs(u) < 1e-9) {
    return null
  }

  const center = {
    x:
      ((a.x * a.x + a.y * a.y) * (c.y - b.y) +
        (b.x * b.x + b.y * b.y) * (a.y - c.y) +
        (c.x * c.x + c.y * c.y) * (b.y - a.y)) /
      u,
    y:
      ((a.x * a.x + a.y * a.y) * (b.x - c.x) +
        (b.x * b.x + b.y * b.y) * (c.x - a.x) +
        (c.x * c.x + c.y * c.y) * (a.x - b.x)) /
      u
  }

  const radius = Math.hypot(center.y - a.y, center.x - a.x)
  if (!Number.isFinite(radius) || radius < 1e-6) {
    return null
  }

  return { center, radius }
}

/**
 * Sweep flag from three points (1 = clockwise in SVG y-down coords).
 * @param {VecLike} a
 * @param {VecLike} b
 * @param {VecLike} c
 * @returns {0|1}
 */
export function getSweepFlagFromThreePoints (a, b, c) {
  return +((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0)
}

/**
 * SVG large-arc-flag: 1 when the arc spans more than π.
 * @param {number} theta
 * @returns {0|1}
 */
export function largeArcFlag (theta) {
  return +(theta > Math.PI)
}

/**
 * Mid control point from start/end and a bend distance (tldraw-style).
 * Positive bend curves to the left of the A→C direction (SVG y-down).
 * @param {VecLike} a
 * @param {VecLike} c
 * @param {number} bend signed offset distance from chord midpoint
 * @returns {VecLike}
 */
export function getMidPointFromBend (a, c, bend) {
  const mx = (a.x + c.x) / 2
  const my = (a.y + c.y) / 2
  const dx = c.x - a.x
  const dy = c.y - a.y
  const len = Math.hypot(dx, dy) || 1
  // Perpendicular unit (left of A→C in SVG coords)
  const nx = -dy / len
  const ny = dx / len
  return {
    x: mx + nx * bend,
    y: my + ny * bend
  }
}

/**
 * Default bend magnitude from chord length (gentle curve like tldraw arcs).
 * @param {number} chordLen
 * @returns {number}
 */
export function defaultBend (chordLen) {
  return chordLen * 0.22
}

/**
 * @param {number} a
 * @returns {number}
 */
const norm = (a) => {
  const t = Math.PI * 2
  let v = a % t
  if (v < 0) v += t
  return v
}

/**
 * @param {number} startAngle
 * @param {number} endAngle
 * @param {0|1} sweepFlag
 * @returns {number}
 */
function angularDelta (startAngle, endAngle, sweepFlag) {
  const s = norm(startAngle)
  const e = norm(endAngle)
  if (sweepFlag) {
    let d = e - s
    if (d <= 0) d += Math.PI * 2
    return d
  }
  let d = s - e
  if (d <= 0) d += Math.PI * 2
  return d
}

/**
 * @param {number} startAngle
 * @param {number} delta
 * @param {0|1} sweepFlag
 * @param {number} midAngle
 * @returns {boolean}
 */
function midOnArc (startAngle, delta, sweepFlag, midAngle) {
  return angularDelta(startAngle, midAngle, sweepFlag) <= delta + 1e-6
}

/**
 * Travel direction (radians) at the arc end — used to aim the arrowhead.
 * @param {VecLike} center
 * @param {VecLike} end
 * @param {0|1} sweepFlag
 * @returns {number}
 */
export function getEndTangentAngle (center, end, sweepFlag) {
  const angle = Math.atan2(end.y - center.y, end.x - center.x)
  // sweep 1 = increasing atan2 in SVG = clockwise visually
  return sweepFlag ? angle + Math.PI / 2 : angle - Math.PI / 2
}

/**
 * Filled triangle arrowhead at tip, aimed along tangentAngle.
 * Tip sits on the end point; base sits behind it (Steve Ruiz: kick head back).
 * Elongated proportions match tldraw-style arrowheads.
 * @param {VecLike} tip
 * @param {number} tangentAngle
 * @param {number} size length from tip to base
 * @returns {{ points: string, base: VecLike, size: number }}
 */
export function getArrowheadGeometry (tip, tangentAngle, size) {
  const back = size
  const halfW = size * 0.45
  const bx = tip.x - Math.cos(tangentAngle) * back
  const by = tip.y - Math.sin(tangentAngle) * back
  const px = -Math.sin(tangentAngle) * halfW
  const py = Math.cos(tangentAngle) * halfW
  const left = { x: bx + px, y: by + py }
  const right = { x: bx - px, y: by - py }
  const base = { x: bx, y: by }
  const points = `${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`
  return { points, base, size }
}

/**
 * Shorten a straight shaft so it meets the arrowhead base.
 * @param {VecLike} tip
 * @param {number} tangentAngle
 * @param {number} headSize
 * @returns {VecLike}
 */
export function getShaftEndPoint (tip, tangentAngle, headSize) {
  const inset = headSize
  return {
    x: tip.x - Math.cos(tangentAngle) * inset,
    y: tip.y - Math.sin(tangentAngle) * inset
  }
}

/**
 * Point on the circle that is `arcInset` distance before the tip along the arc
 * (Steve Ruiz: kick the endpoint back so the head sits on the path).
 * @param {VecLike} center
 * @param {number} radius
 * @param {number} endAngle
 * @param {0|1} sweepFlag
 * @param {number} arcInset
 * @returns {VecLike}
 */
export function getShaftEndOnArc (center, radius, endAngle, sweepFlag, arcInset) {
  const dTheta = Math.min(arcInset / Math.max(radius, 1e-6), Math.PI - 1e-3)
  // Walk backward along travel direction
  const shaftAngle = sweepFlag ? endAngle - dTheta : endAngle + dTheta
  return {
    x: center.x + radius * Math.cos(shaftAngle),
    y: center.y + radius * Math.sin(shaftAngle)
  }
}

/**
 * SVG path for a circular arc.
 * @param {VecLike} start
 * @param {VecLike} end
 * @param {number} radius
 * @param {number} largeArc
 * @param {number} sweep
 * @returns {string}
 */
export function getArcPath (start, end, radius, largeArc, sweep) {
  return `M${start.x},${start.y}A${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x},${end.y}`
}

/**
 * @param {VecLike} start
 * @param {VecLike} end
 * @returns {string}
 */
export function getLinePath (start, end) {
  return `M${start.x},${start.y}L${end.x},${end.y}`
}

/**
 * Full curved-arrow geometry: shaft path + arrowhead triangle.
 * Shaft end is pushed back so the head tip lands on `c` (tldraw feel).
 * @param {VecLike} a start
 * @param {VecLike} b mid (through-point)
 * @param {VecLike} c end (arrow tip)
 * @param {number} [strokeWidth=2]
 * @returns {{
 *   shaftD: string,
 *   headPoints: string,
 *   center: VecLike | null,
 *   radius: number,
 *   theta: number,
 *   largeArcFlag: 0|1,
 *   sweepFlag: 0|1,
 *   length: number,
 *   collinear: boolean,
 *   tangentAngle: number,
 *   headSize: number
 * }}
 */
export function getCurvedArrowGeometry (a, b, c, strokeWidth = 2) {
  const chord = Math.hypot(c.x - a.x, c.y - a.y)
  // Head scales with stroke; capped so short arrows stay readable
  const headSize = Math.max(strokeWidth * 2.8, Math.min(chord * 0.16, strokeWidth * 6.5))

  if (chord < 1e-6) {
    return {
      shaftD: getLinePath(a, a),
      headPoints: '',
      center: null,
      radius: 0,
      theta: 0,
      largeArcFlag: 0,
      sweepFlag: 0,
      length: 0,
      collinear: true,
      tangentAngle: 0,
      headSize
    }
  }

  const circle = getCircleFromThreePoints(a, b, c)
  let tangentAngle
  let shaftD
  let center = null
  let radius = 0
  let theta = 0
  let large = /** @type {0|1} */ (0)
  let sweep = /** @type {0|1} */ (0)
  let collinear = false
  let length = chord

  if (!circle) {
    collinear = true
    tangentAngle = Math.atan2(c.y - a.y, c.x - a.x)
    const shaftEnd = getShaftEndPoint(c, tangentAngle, headSize)
    // Avoid inverted shaft on very short arrows
    const shaftLen = Math.hypot(shaftEnd.x - a.x, shaftEnd.y - a.y)
    shaftD = shaftLen > headSize * 0.35 ? getLinePath(a, shaftEnd) : getLinePath(a, a)
  } else {
    center = circle.center
    radius = circle.radius
    const startAngle = Math.atan2(a.y - center.y, a.x - center.x)
    const midAngle = Math.atan2(b.y - center.y, b.x - center.x)
    const endAngle = Math.atan2(c.y - center.y, c.x - center.x)

    sweep = getSweepFlagFromThreePoints(a, b, c)
    theta = angularDelta(startAngle, endAngle, sweep)
    if (!midOnArc(startAngle, theta, sweep, midAngle)) {
      sweep = /** @type {0|1} */ (1 - sweep)
      theta = angularDelta(startAngle, endAngle, sweep)
    }
    large = largeArcFlag(theta)
    length = Math.abs(theta) * radius
    tangentAngle = getEndTangentAngle(center, c, sweep)

    const inset = headSize
    // Keep shaft end ON the circle (not a linear back-step off-curve)
    const shaftEnd = getShaftEndOnArc(center, radius, endAngle, sweep, inset)
    const shortAngle = Math.atan2(shaftEnd.y - center.y, shaftEnd.x - center.x)
    const shortTheta = angularDelta(startAngle, shortAngle, sweep)
    if (shortTheta >= theta - 1e-4 || shortTheta < 1e-4 || length <= inset * 1.2) {
      shaftD = getArcPath(a, c, radius, large, sweep)
    } else {
      shaftD = getArcPath(a, shaftEnd, radius, largeArcFlag(shortTheta), sweep)
    }
  }

  const head = getArrowheadGeometry(c, tangentAngle, headSize)

  return {
    shaftD,
    headPoints: head.points,
    center,
    radius,
    theta,
    largeArcFlag: large,
    sweepFlag: sweep,
    length,
    collinear,
    tangentAngle,
    headSize
  }
}
