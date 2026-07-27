/**
 * 3D box projection for SVG.
 * Y-up, camera on +Z. Visibility: face normal · view > 0.
 * Draw order: average camera-space Z (far faces first).
 * @license MIT
 */

/** Face corners CCW when viewed from outside. */
const FACE_INDICES = [
  [4, 5, 6, 7], // front  (+Z)
  [0, 1, 2, 3], // back   (-Z)
  [4, 0, 3, 7], // left   (-X)
  [1, 5, 6, 2], // right  (+X)
  [3, 2, 6, 7], // top    (+Y)
  [4, 5, 1, 0] // bottom (-Y)
]

const FACE_NORMALS = [
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  { x: -1, y: 0, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 }
]

const VIEW_DIR = { x: 0, y: 0, z: 1 }
/** 0 = isometric (parallel). Higher values add perspective foreshortening. */
export const DEFAULT_PERSPECTIVE = 0
const LIGHT = normalize({ x: -0.45, y: 0.75, z: 0.5 })
/** Faces with normal·view below this are edge-on / back-facing. */
const VIS_EPS = 1e-9

/** Cube edges as corner index pairs. */
export const CUBE_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
]

/** Base brightness per face so adjacent sides stay visually distinct. */
const FACE_BASE_SHADE = [0.72, 0.42, 0.55, 0.62, 0.88, 0.35]

/**
 * @param {number} deg
 * @returns {number}
 */
export const degToRad = (deg) => (Number(deg) * Math.PI) / 180

/**
 * @param {{x:number,y:number,z:number}} v
 * @returns {{x:number,y:number,z:number}}
 */
function normalize (v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

/**
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @returns {number}
 */
function dot (a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

/**
 * Rotate point/vector: X then Y then Z.
 */
export const rotate3D = (p, rx, ry, rz) => {
  let { x, y, z } = p

  const cosX = Math.cos(rx)
  const sinX = Math.sin(rx)
  let y1 = y * cosX - z * sinX
  let z1 = y * sinX + z * cosX
  y = y1
  z = z1

  const cosY = Math.cos(ry)
  const sinY = Math.sin(ry)
  let x1 = x * cosY + z * sinY
  z1 = -x * sinY + z * cosY
  x = x1
  z = z1

  const cosZ = Math.cos(rz)
  const sinZ = Math.sin(rz)
  x1 = x * cosZ - y * sinZ
  y1 = x * sinZ + y * cosZ
  return { x: x1, y: y1, z }
}

/** Inverse rotation (undo Z, Y, X). */
export const rotate3DInverse = (p, rx, ry, rz) => {
  let { x, y, z } = p

  const cosZ = Math.cos(-rz)
  const sinZ = Math.sin(-rz)
  let x1 = x * cosZ - y * sinZ
  let y1 = x * sinZ + y * cosZ
  x = x1
  y = y1

  const cosY = Math.cos(-ry)
  const sinY = Math.sin(-ry)
  x1 = x * cosY + z * sinY
  let z1 = -x * sinY + z * cosY
  x = x1
  z = z1

  const cosX = Math.cos(-rx)
  const sinX = Math.sin(-rx)
  y1 = y * cosX - z * sinX
  z1 = y * sinX + z * cosX
  return { x, y: y1, z: z1 }
}

/**
 * Camera distance for perspective foreshortening (unused at 0).
 * @param {number} [perspective=DEFAULT_PERSPECTIVE]
 * @returns {{cameraZ: number, strength: number}}
 */
export const getProjectionParams = (perspective = DEFAULT_PERSPECTIVE) => {
  const strength = Math.min(100, Math.max(0, Number(perspective))) / 100
  return {
    cameraZ: 8 - strength * 5,
    strength
  }
}

/**
 * Project to SVG coordinates.
 * Size always sets isometric scale; perspective only adds depth foreshortening.
 * @param {{x:number,y:number,z:number}} p
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @param {number} [perspective=DEFAULT_PERSPECTIVE]
 */
export const projectPoint = (p, cx, cy, size, perspective = DEFAULT_PERSPECTIVE, scaleCorrection = 1) => {
  const { cameraZ, strength } = getProjectionParams(perspective)
  const isoX = cx + p.x * size
  const isoY = cy - p.y * size

  if (strength <= 0) {
    return { x: isoX, y: isoY, z: p.z, depth: 0 }
  }

  const depth = cameraZ - p.z
  const safeDepth = Math.max(depth, 0.35)
  const safeCenterDepth = Math.max(cameraZ, 0.35)
  const foreshorten = safeCenterDepth / safeDepth
  const perspX = cx + p.x * size * foreshorten
  const perspY = cy - p.y * size * foreshorten

  const blendedX = isoX + (perspX - isoX) * strength
  const blendedY = isoY + (perspY - isoY) * strength

  return {
    x: cx + (blendedX - cx) * scaleCorrection,
    y: cy + (blendedY - cy) * scaleCorrection,
    z: p.z,
    depth
  }
}

/**
 * @param {Array<{x:number,y:number}>} pts
 * @returns {number}
 */
function bboxMaxSpan (pts) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  return Math.max(maxX - minX, maxY - minY)
}

/**
 * Scale perspective projection to match isometric bounding size.
 * @param {Array<{x:number,y:number,z:number}>} corners3
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @param {number} perspective
 * @returns {number}
 */
export const computeProjectionScaleCorrection = (corners3, cx, cy, size, perspective) => {
  const { strength } = getProjectionParams(perspective)
  if (strength <= 0) return 1

  const isoPts = corners3.map((p) => ({ x: cx + p.x * size, y: cy - p.y * size }))
  const perspPts = corners3.map((p) => projectPoint(p, cx, cy, size, perspective, 1))
  const isoSpan = bboxMaxSpan(isoPts)
  const perspSpan = bboxMaxSpan(perspPts)
  return perspSpan > 1e-9 ? isoSpan / perspSpan : 1
}

/** Scaled box corners (Y-up). */
export const getCorners = (sx, sy, sz) => {
  const hx = 0.5 * Math.max(sx, 0.01)
  const hy = 0.5 * Math.max(sy, 0.01)
  const hz = 0.5 * Math.max(sz, 0.01)
  return [
    { x: -hx, y: -hy, z: -hz },
    { x: hx, y: -hy, z: -hz },
    { x: hx, y: hy, z: -hz },
    { x: -hx, y: hy, z: -hz },
    { x: -hx, y: -hy, z: hz },
    { x: hx, y: -hy, z: hz },
    { x: hx, y: hy, z: hz },
    { x: -hx, y: hy, z: hz }
  ]
}

const parseColor = (color) => {
  if (!color || color === 'none' || color === 'transparent') {
    return { r: 180, g: 180, b: 180 }
  }
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    const n = Number.parseInt(hex, 16)
    if (!Number.isNaN(n)) {
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color)
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  return { r: 180, g: 180, b: 180 }
}

export const shadeFill = (fill, shade) => {
  const { r, g, b } = parseColor(fill)
  const t = Math.min(1, Math.max(0.22, shade))
  return `rgb(${Math.round(r * t)},${Math.round(g * t)},${Math.round(b * t)})`
}

/**
 * Per-face shade: object-space base + lighting (keeps 3-face views readable).
 * @param {number} faceIndex
 * @param {{x:number,y:number,z:number}} rotatedNormal
 * @returns {number}
 */
export const faceShade = (faceIndex, rotatedNormal) => {
  const base = FACE_BASE_SHADE[faceIndex] ?? 0.6
  const lit = 0.78 + 0.22 * Math.max(0, dot(rotatedNormal, LIGHT))
  return base * lit
}

/** Camera direction in object space (for tests / debugging). */
export const getToCameraObjectSpace = (rx, ry, rz) =>
  normalize(rotate3DInverse(VIEW_DIR, rx, ry, rz))

/**
 * Visible faces: rotated outward normal must face the camera (+Z).
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 * @returns {number[]}
 */
export const getVisibleFaceIndices = (rx, ry, rz) => {
  const ids = []
  FACE_NORMALS.forEach((normal, faceIndex) => {
    const n = rotate3D(normal, rx, ry, rz)
    if (dot(n, VIEW_DIR) > VIS_EPS) ids.push(faceIndex)
  })
  return ids
}

/**
 * Ensure 2D polygon is CCW for SVG non-zero fill rule.
 * @param {Array<{x:number,y:number}>} pts
 * @returns {Array<{x:number,y:number}>}
 */
function ensureScreenCCW (pts) {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return area < 0 ? pts.slice().reverse() : pts
}

/**
 * @param {Array<{x:number,y:number,z:number}>} corners3
 * @param {number[]} indices
 * @returns {number}
 */
function faceAvgZ (corners3, indices) {
  let sum = 0
  for (const i of indices) sum += corners3[i].z
  return sum / indices.length
}

/**
 * @param {Array<{x:number,y:number,z:number}>} corners3
 * @param {number[]} indices
 * @returns {number}
 */
function faceMinZ (corners3, indices) {
  let min = Infinity
  for (const i of indices) min = Math.min(min, corners3[i].z)
  return min
}

/**
 * @param {Array<{x:number,y:number,z:number}>} corners3
 * @param {number[]} indices
 * @returns {number}
 */
function faceMaxZ (corners3, indices) {
  let max = -Infinity
  for (const i of indices) max = Math.max(max, corners3[i].z)
  return max
}

/**
 * Compute visible faces, far → near for painter's algorithm.
 */
export const computeCubeFaces = ({
  cx,
  cy,
  size,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  perspective = DEFAULT_PERSPECTIVE,
  fill = '#cccccc'
}) => {
  const rxr = degToRad(rx)
  const ryr = degToRad(ry)
  const rzr = degToRad(rz)

  const corners3 = getCorners(sx, sy, sz).map((p) => rotate3D(p, rxr, ryr, rzr))
  const scaleCorrection = computeProjectionScaleCorrection(corners3, cx, cy, size, perspective)
  const corners2 = corners3.map((p) => projectPoint(p, cx, cy, size, perspective, scaleCorrection))

  const visibleIds = getVisibleFaceIndices(rxr, ryr, rzr)

  const faces = visibleIds.map((faceIndex) => {
    const indices = FACE_INDICES[faceIndex]
    const n = rotate3D(FACE_NORMALS[faceIndex], rxr, ryr, rzr)

    let pts = indices.map((i) => ({ x: corners2[i].x, y: corners2[i].y }))
    pts = ensureScreenCCW(pts)

    const avgZ = faceAvgZ(corners3, indices)
    const minZ = faceMinZ(corners3, indices)
    const maxZ = faceMaxZ(corners3, indices)
    const points = pts.map((p) => `${p.x},${p.y}`).join(' ')

    return {
      faceIndex,
      points,
      avgZ,
      minZ,
      maxZ,
      facing: dot(n, VIEW_DIR),
      fill: shadeFill(fill, faceShade(faceIndex, n))
    }
  })

  // Farther faces (lower Z) drawn first; tie-break with maxZ then index.
  return faces.sort((a, b) => {
    const dz = a.avgZ - b.avgZ
    if (Math.abs(dz) > 1e-7) return dz
    const dm = a.maxZ - b.maxZ
    if (Math.abs(dm) > 1e-7) return dm
    return a.faceIndex - b.faceIndex
  })
}

/**
 * Projected cube wireframe (12 edges), for drawing on top of faces.
 */
export const computeCubeWireframe = ({
  cx,
  cy,
  size,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
  perspective = DEFAULT_PERSPECTIVE
}) => {
  const rxr = degToRad(rx)
  const ryr = degToRad(ry)
  const rzr = degToRad(rz)

  const corners3 = getCorners(sx, sy, sz).map((p) => rotate3D(p, rxr, ryr, rzr))
  const scaleCorrection = computeProjectionScaleCorrection(corners3, cx, cy, size, perspective)
  const corners2 = corners3.map((p) => projectPoint(p, cx, cy, size, perspective, scaleCorrection))

  return CUBE_EDGES.map(([a, b]) => ({
    x1: corners2[a].x,
    y1: corners2[a].y,
    x2: corners2[b].x,
    y2: corners2[b].y
  }))
}
