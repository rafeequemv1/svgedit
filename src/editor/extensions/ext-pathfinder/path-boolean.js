/**
 * Boolean path ops via polygon-clipping (Martinez).
 * Shapes are sampled in #svgcontent coordinates, then merged.
 * @license MIT
 */

import polygonClipping from 'polygon-clipping'

const SVGNS = 'http://www.w3.org/2000/svg'
const SHAPE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])

const getPathDFromSegments = (segs) =>
  segs.map(([cmd, pts]) => `${cmd}${pts.join(',')}`).join('')

/**
 * @param {Element} elem
 * @returns {SVGSVGElement|null}
 */
const getContentRoot = (elem) => {
  const svg = elem?.ownerSVGElement
  if (!svg) return null
  return svg.querySelector('#svgcontent') || svg
}

/**
 * Matrix mapping elem local coords → #svgcontent (or owner SVG) coords.
 * Avoids getCTM() which includes editor zoom / pan.
 * @param {Element} elem
 * @returns {{a:number,b:number,c:number,d:number,e:number,f:number}|null}
 */
const getLocalToContentMatrix = (elem) => {
  const content = getContentRoot(elem)
  if (!content || typeof elem.getScreenCTM !== 'function') return null
  const elemCTM = elem.getScreenCTM()
  const contentCTM = content.getScreenCTM?.()
  if (!elemCTM || !contentCTM) return elemCTM
  try {
    return contentCTM.inverse().multiply(elemCTM)
  } catch (_) {
    return elemCTM
  }
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{a:number,b:number,c:number,d:number,e:number,f:number}|null} m
 * @returns {[number, number]}
 */
const applyMatrix = (x, y, m) => {
  if (!m) return [x, y]
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
}

/**
 * @param {Element} elem
 * @returns {string|undefined}
 */
export const shapeToPathD = (elem) => {
  let num = 1.81
  let d
  let rx
  let ry
  switch (elem.tagName) {
    case 'ellipse':
    case 'circle': {
      rx = Number(elem.getAttribute('rx'))
      ry = Number(elem.getAttribute('ry'))
      const cx = Number(elem.getAttribute('cx'))
      const cy = Number(elem.getAttribute('cy'))
      if (elem.tagName === 'circle' && elem.hasAttribute('r')) {
        ry = Number(elem.getAttribute('r'))
        rx = ry
      }
      d = getPathDFromSegments([
        ['M', [cx - rx, cy]],
        ['C', [cx - rx, cy - ry / num, cx - rx / num, cy - ry, cx, cy - ry]],
        ['C', [cx + rx / num, cy - ry, cx + rx, cy - ry / num, cx + rx, cy]],
        ['C', [cx + rx, cy + ry / num, cx + rx / num, cy + ry, cx, cy + ry]],
        ['C', [cx - rx / num, cy + ry, cx - rx, cy + ry / num, cx - rx, cy]],
        ['Z', []]
      ])
      break
    }
    case 'path':
      d = elem.getAttribute('d')
      break
    case 'line': {
      const x1 = elem.getAttribute('x1')
      const y1 = elem.getAttribute('y1')
      const x2 = elem.getAttribute('x2')
      const y2 = elem.getAttribute('y2')
      d = `M${x1},${y1}L${x2},${y2}`
      break
    }
    case 'polyline':
      d = `M${elem.getAttribute('points')}`
      break
    case 'polygon':
      d = `M${elem.getAttribute('points')}Z`
      break
    case 'rect': {
      rx = Number(elem.getAttribute('rx') || 0)
      ry = Number(elem.getAttribute('ry') || 0)
      const x = Number(elem.getAttribute('x') || 0)
      const y = Number(elem.getAttribute('y') || 0)
      const w = Number(elem.getAttribute('width') || 0)
      const h = Number(elem.getAttribute('height') || 0)
      num = 4 - num
      d = !rx && !ry
        ? getPathDFromSegments([
          ['M', [x, y]],
          ['L', [x + w, y]],
          ['L', [x + w, y + h]],
          ['L', [x, y + h]],
          ['Z', []]
        ])
        : getPathDFromSegments([
          ['M', [x, y + ry]],
          ['C', [x, y + ry / num, x + rx / num, y, x + rx, y]],
          ['L', [x + w - rx, y]],
          ['C', [x + w - rx / num, y, x + w, y + ry / num, x + w, y + ry]],
          ['L', [x + w, y + h - ry]],
          ['C', [x + w, y + h - ry / num, x + w - rx / num, y + h, x + w - rx, y + h]],
          ['L', [x + rx, y + h]],
          ['C', [x + rx / num, y + h, x, y + h - ry / num, x, y + h - ry]],
          ['Z', []]
        ])
      break
    }
    default:
      break
  }
  return d || undefined
}

/**
 * @param {string} d
 * @returns {string[]}
 */
export const splitPathD = (d) => {
  if (!d) return []
  const trimmed = d.trim()
  const parts = trimmed.match(/[Mm][^Mm]*/g)
  return parts?.map((p) => p.trim()).filter(Boolean) || [trimmed]
}

/**
 * @param {SVGPathElement} pathEl
 * @param {{a:number,b:number,c:number,d:number,e:number,f:number}|null} matrix
 * @param {number} [segments=64]
 * @returns {Array<[number, number]>}
 */
export const samplePathRing = (pathEl, matrix, segments = 64) => {
  const len = pathEl.getTotalLength()
  if (!Number.isFinite(len) || len <= 0) return []
  const steps = Math.max(12, segments)
  const ring = []
  for (let i = 0; i <= steps; i++) {
    const p = pathEl.getPointAtLength((len * i) / steps)
    ring.push(applyMatrix(p.x, p.y, matrix))
  }
  if (ring.length >= 2) {
    const [fx, fy] = ring[0]
    const [lx, ly] = ring[ring.length - 1]
    if (Math.hypot(fx - lx, fy - ly) > 1e-3) {
      ring.push([fx, fy])
    }
  }
  return ring
}

/**
 * @param {Element} elem
 * @returns {Array<[number, number]>}
 */
const bboxRing = (elem) => {
  let b
  try {
    b = elem.getBBox()
  } catch (_) {
    return []
  }
  const matrix = getLocalToContentMatrix(elem)
  return [
    applyMatrix(b.x, b.y, matrix),
    applyMatrix(b.x + b.width, b.y, matrix),
    applyMatrix(b.x + b.width, b.y + b.height, matrix),
    applyMatrix(b.x, b.y + b.height, matrix),
    applyMatrix(b.x, b.y, matrix)
  ]
}

/**
 * Ensure polygon-clipping MultiPolygon shape.
 * @param {any} geom
 * @returns {Array<Array<Array<[number, number]>>>}
 */
const asMultiPolygon = (geom) => {
  if (!geom?.length) return []
  // Polygon: [ring, ...] where ring[0] is [x,y]
  if (typeof geom[0]?.[0]?.[0] === 'number') {
    return [geom]
  }
  // MultiPolygon
  return geom
}

/**
 * @param {Element} elem
 * @returns {Array<Array<Array<[number, number]>>>}
 */
export const elementToPolygons = (elem) => {
  const d = shapeToPathD(elem)
  if (!d) return []

  const canSample = typeof document.createElementNS === 'function' &&
    typeof SVGPathElement !== 'undefined' &&
    typeof SVGPathElement.prototype.getTotalLength === 'function'

  if (!canSample) {
    const ring = bboxRing(elem)
    return ring.length >= 3 ? [[ring]] : []
  }

  const owner = elem.ownerSVGElement
  if (!owner) {
    const ring = bboxRing(elem)
    return ring.length >= 3 ? [[ring]] : []
  }

  // Sample in the element's own local space (no parent append), then map to content.
  const matrix = getLocalToContentMatrix(elem)
  const polygons = []
  for (const sub of splitPathD(d)) {
    const closed = /[Zz]\s*$/.test(sub) ? sub : `${sub}Z`
    const path = document.createElementNS(SVGNS, 'path')
    path.setAttribute('d', closed)
    // Attach under same parent briefly so getTotalLength works in more browsers
    const parent = elem.parentNode || owner
    parent.append(path)
    let ring = samplePathRing(path, matrix)
    path.remove()
    if (!ring.length) {
      ring = bboxRing(elem)
    }
    if (ring.length >= 3) {
      polygons.push([ring])
    }
  }
  return polygons
}

/**
 * @param {Element} elem
 * @param {Element[]} out
 * @returns {Element[]}
 */
export const collectShapeElements = (elem, out = []) => {
  if (!elem || elem.nodeType !== 1) return out
  const tag = elem.tagName
  if (tag === 'g' || tag === 'a') {
    Array.from(elem.children).forEach((child) => collectShapeElements(child, out))
    return out
  }
  if (SHAPE_TAGS.has(tag)) out.push(elem)
  return out
}

/**
 * @param {number} n
 * @returns {string}
 */
const fmt = (n) => (Math.abs(n) < 1e-6 ? '0' : Number(n.toFixed(3)).toString())

/**
 * @param {Array<Array<Array<[number, number]>>>} multiPolygon
 * @returns {string}
 */
export const multipolygonToPathD = (multiPolygon) => {
  const chunks = []
  asMultiPolygon(multiPolygon).forEach((polygon) => {
    polygon.forEach((ring) => {
      if (!ring || ring.length < 3) return
      // Skip degenerate rings
      if (typeof ring[0]?.[0] !== 'number') return
      const [first, ...rest] = ring
      chunks.push(`M${fmt(first[0])},${fmt(first[1])}L${rest.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join('L')}Z`)
    })
  })
  return chunks.join(' ')
}

/**
 * Back-to-front document order (first = bottom/back, last = top/front).
 * @param {Element[]} elems
 * @returns {Element[]}
 */
export const sortByDocumentOrder = (elems) => {
  return [...elems].sort((a, b) => {
    if (a === b) return 0
    const pos = a.compareDocumentPosition(b)
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  })
}

/**
 * Union all polygons from the given elements into one MultiPolygon.
 * @param {Element[]} elems
 * @returns {Array<Array<Array<[number, number]>>>|null}
 */
export const elementsToGeom = (elems) => {
  let result = null
  elems.forEach((elem) => {
    elementToPolygons(elem).forEach((poly) => {
      const mp = asMultiPolygon(poly)
      result = result ? polygonClipping.union(result, mp) : mp
    })
  })
  return result?.length ? result : null
}

/**
 * @typedef {'union'|'subtract'|'intersect'|'exclude'} PathfinderOp
 */

/**
 * Boolean op on shape elements → path `d` in svgcontent coords.
 * Subtract = Minus Front (frontmost subtracted from shapes behind).
 * @param {Element[]} elems
 * @param {PathfinderOp} op
 * @returns {string|null}
 */
export const booleanElements = (elems, op) => {
  if (!elems?.length) return null
  try {
    const ordered = sortByDocumentOrder(elems)
    let result = null

    if (op === 'subtract') {
      if (ordered.length < 2) return null
      const front = ordered[ordered.length - 1]
      const back = ordered.slice(0, -1)
      const subject = elementsToGeom(back)
      const clip = elementsToGeom([front])
      if (!subject || !clip) return null
      result = polygonClipping.difference(subject, clip)
    } else if (op === 'intersect') {
      ordered.forEach((elem) => {
        const geom = elementsToGeom([elem])
        if (!geom) return
        result = result == null ? geom : polygonClipping.intersection(result, geom)
      })
    } else if (op === 'exclude') {
      ordered.forEach((elem) => {
        const geom = elementsToGeom([elem])
        if (!geom) return
        result = result == null ? geom : polygonClipping.xor(result, geom)
      })
    } else {
      // union
      result = elementsToGeom(ordered)
    }

    if (!result || !result.length) return null
    const d = multipolygonToPathD(result)
    return d || null
  } catch (err) {
    console.warn(`Pathfinder ${op} failed:`, err)
    return null
  }
}

/**
 * Union selected shape elements into one path `d` string (svgcontent coords).
 * @param {Element[]} elems
 * @returns {string|null}
 */
export const unionElements = (elems) => booleanElements(elems, 'union')

/**
 * Minus Front: subtract frontmost shape from shapes behind it.
 * @param {Element[]} elems
 * @returns {string|null}
 */
export const subtractElements = (elems) => booleanElements(elems, 'subtract')

/**
 * Keep only overlapping area of all shapes.
 * @param {Element[]} elems
 * @returns {string|null}
 */
export const intersectElements = (elems) => booleanElements(elems, 'intersect')

/**
 * Exclude / XOR overlapping areas.
 * @param {Element[]} elems
 * @returns {string|null}
 */
export const excludeElements = (elems) => booleanElements(elems, 'exclude')

/**
 * @param {Element} elem
 * @returns {boolean}
 */
export const isPathfinderShape = (elem) => {
  if (!elem) return false
  if (elem.tagName === 'g' || elem.tagName === 'a') {
    return collectShapeElements(elem).length > 0
  }
  return SHAPE_TAGS.has(elem.tagName)
}
