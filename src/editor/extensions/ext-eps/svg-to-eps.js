/**
 * Convert SVG markup to Encapsulated PostScript (EPS).
 * Supports common vector shapes; paths are approximated with line segments.
 * @license MIT
 */

const NS = 'http://www.w3.org/2000/svg'

/** @typedef {{a:number,b:number,c:number,d:number,e:number,f:number}} Matrix2D */

/** @returns {Matrix2D} */
const identityMatrix = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

/**
 * @param {Matrix2D} m1
 * @param {Matrix2D} m2
 * @returns {Matrix2D}
 */
const multiplyMatrix = (m1, m2) => ({
  a: m1.a * m2.a + m1.c * m2.b,
  b: m1.b * m2.a + m1.d * m2.b,
  c: m1.a * m2.c + m1.c * m2.d,
  d: m1.b * m2.c + m1.d * m2.d,
  e: m1.a * m2.e + m1.c * m2.f + m1.e,
  f: m1.b * m2.e + m1.d * m2.f + m1.f
})

/**
 * @param {Matrix2D} m
 * @param {number} x
 * @param {number} y
 * @returns {{x:number,y:number}}
 */
const applyMatrix = (m, x, y) => ({
  x: m.a * x + m.c * y + m.e,
  y: m.b * x + m.d * y + m.f
})

/**
 * Minimal SVG transform parser (matrix/translate/scale).
 * @param {string|null} transform
 * @returns {Matrix2D}
 */
const parseTransform = (transform) => {
  if (!transform) return identityMatrix()
  let result = identityMatrix()
  const re = /(matrix|translate|scale)\(([^)]+)\)/g
  let match
  while ((match = re.exec(transform))) {
    const nums = match[2].split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n))
    /** @type {Matrix2D} */
    let part = identityMatrix()
    if (match[1] === 'matrix' && nums.length >= 6) {
      part = { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] }
    } else if (match[1] === 'translate') {
      part.e = nums[0] || 0
      part.f = nums[1] || 0
    } else if (match[1] === 'scale') {
      part.a = nums[0] || 1
      part.d = nums[1] ?? nums[0] ?? 1
    }
    result = multiplyMatrix(result, part)
  }
  return result
}

/**
 * @param {string} color
 * @returns {number[]|null}
 */
export const parseColor = (color) => {
  if (!color || color === 'none' || color === 'transparent') return null
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    const n = Number.parseInt(hex, 16)
    if (!Number.isNaN(n)) {
      return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
    }
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(color)
  if (m) {
    return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255]
  }
  return [0, 0, 0]
}

/**
 * @param {string} svgString
 * @param {{w:number,h:number}} [resolution]
 * @returns {string}
 */
export const svgToEps = (svgString, resolution = { w: 800, h: 600 }) => {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.tagName !== 'svg') {
    throw new Error('Invalid SVG')
  }

  const vb = svg.getAttribute('viewBox')?.split(/\s+|,/).map(Number)
  let width = Number(svg.getAttribute('width')) || resolution.w
  let height = Number(svg.getAttribute('height')) || resolution.h
  if (vb && vb.length === 4) {
    width = vb[2]
    height = vb[3]
  }

  /** @type {string[]} */
  const body = []
  const flipY = (y) => height - y

  /**
   * @param {string} cmd
   */
  const emit = (cmd) => { body.push(cmd) }

  /**
   * @param {Element} el
   * @returns {(name:string)=>string|undefined}
   */
  const getStyle = (el) => {
    const style = el.getAttribute('style') || ''
    return (name) => el.getAttribute(name) || (style.match(new RegExp(`${name}\\s*:\\s*([^;]+)`))?.[1]?.trim())
  }

  /**
   * @param {Element} el
   * @param {(x:number,y:number)=>void} plot
   */
  const pathFromD = (el, plot) => {
    const d = el.getAttribute('d')
    if (!d) return
    const probe = document.createElementNS(NS, 'path')
    probe.setAttribute('d', d)
    const len = probe.getTotalLength()
    if (!len) return
    const steps = Math.max(12, Math.ceil(len / 3))
    for (let i = 0; i <= steps; i++) {
      const pt = probe.getPointAtLength((len * i) / steps)
      plot(pt.x, pt.y, i === 0)
    }
  }

  /**
   * @param {Element} el
   * @param {Matrix2D} matrix
   */
  const walk = (el, matrix) => {
    if (el.nodeType !== 1) return
    const tag = el.localName
    if (tag === 'defs' || tag === 'metadata' || tag === 'title' || tag === 'desc') return

    let local = matrix
    const transform = el.getAttribute('transform')
    if (transform) {
      local = multiplyMatrix(matrix, parseTransform(transform))
    }

    const pick = getStyle(el)
    const fill = parseColor(pick('fill'))
    const stroke = parseColor(pick('stroke'))
    const strokeWidth = Number(pick('stroke-width') || 1)
    const opacity = Number(pick('opacity') || el.getAttribute('opacity') || 1)

    /**
     * @param {() => void} draw
     */
    const paint = (draw) => {
      emit('gsave')
      if (opacity < 1) emit(`${opacity} setgray`)
      draw()
      if (fill) {
        emit(`${fill[0]} ${fill[1]} ${fill[2]} setrgbcolor fill`)
      }
      if (stroke && strokeWidth > 0) {
        emit(`${strokeWidth} setlinewidth`)
        emit(`${stroke[0]} ${stroke[1]} ${stroke[2]} setrgbcolor stroke`)
      }
      emit('grestore')
    }

    if (tag === 'g') {
      Array.from(el.children).forEach((child) => walk(child, local))
      return
    }

    const map = (x, y) => {
      const p = applyMatrix(local, x, y)
      return { x: p.x, y: flipY(p.y) }
    }

    if (tag === 'rect') {
      const x = Number(el.getAttribute('x') || 0)
      const y = Number(el.getAttribute('y') || 0)
      const w = Number(el.getAttribute('width') || 0)
      const h = Number(el.getAttribute('height') || 0)
      const p = map(x, y + h)
      paint(() => {
        emit(`${p.x} ${p.y} ${w} ${h} rect`)
      })
      return
    }

    if (tag === 'circle') {
      const cx = Number(el.getAttribute('cx') || 0)
      const cy = Number(el.getAttribute('cy') || 0)
      const r = Number(el.getAttribute('r') || 0)
      const c = map(cx, cy)
      paint(() => {
        emit(`${c.x} ${c.y} ${r} 0 360 arc closepath`)
      })
      return
    }

    if (tag === 'ellipse') {
      const cx = Number(el.getAttribute('cx') || 0)
      const cy = Number(el.getAttribute('cy') || 0)
      const rx = Number(el.getAttribute('rx') || 0)
      const ry = Number(el.getAttribute('ry') || 0)
      const c = map(cx, cy)
      paint(() => {
        emit('gsave')
        emit(`${c.x} ${c.y} translate`)
        emit(`${rx} ${ry} scale`)
        emit('0 0 1 0 360 arc closepath')
        emit('grestore')
      })
      return
    }

    if (tag === 'line') {
      const p1 = map(Number(el.getAttribute('x1')), Number(el.getAttribute('y1')))
      const p2 = map(Number(el.getAttribute('x2')), Number(el.getAttribute('y2')))
      emit('gsave')
      if (stroke) emit(`${stroke[0]} ${stroke[1]} ${stroke[2]} setrgbcolor`)
      emit(`${strokeWidth} setlinewidth`)
      emit(`${p1.x} ${p1.y} moveto ${p2.x} ${p2.y} lineto stroke`)
      emit('grestore')
      return
    }

    if (tag === 'polyline' || tag === 'polygon') {
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
      if (pts.length < 4) return
      paint(() => {
        for (let i = 0; i < pts.length; i += 2) {
          const p = map(pts[i], pts[i + 1])
          emit(`${p.x} ${p.y} ${i === 0 ? 'moveto' : 'lineto'}`)
        }
        if (tag === 'polygon') emit('closepath')
      })
      return
    }

    if (tag === 'path') {
      const d = el.getAttribute('d') || ''
      const closed = /[zZ]\s*$/.test(d.trim())
      paint(() => {
        pathFromD(el, (x, y, first) => {
          const p = map(x, y)
          emit(`${p.x} ${p.y} ${first ? 'moveto' : 'lineto'}`)
        })
        if (closed) emit('closepath')
      })
      return
    }

    if (tag === 'text') {
      const x = Number(el.getAttribute('x') || 0)
      const y = Number(el.getAttribute('y') || 0)
      const p = map(x, y)
      const text = el.textContent || ''
      const size = Number(pick('font-size') || 16)
      emit('gsave')
      if (fill) emit(`${fill[0]} ${fill[1]} ${fill[2]} setrgbcolor`)
      emit(`/Helvetica findfont ${size} scalefont setfont`)
      emit(`${p.x} ${p.y} moveto`)
      emit(`(${text.replace(/[\\()]/g, '\\$&')}) show`)
      emit('grestore')
      return
    }

    if (tag === 'image') {
      return
    }

    Array.from(el.children).forEach((child) => walk(child, local))
  }

  walk(svg, identityMatrix())

  const llx = 0
  const lly = 0
  const urx = Math.ceil(width)
  const ury = Math.ceil(height)

  return [
    '%!PS-Adobe-3.0 EPSF-3.0',
    '%%Creator: SVGEdit',
    `%%BoundingBox: ${llx} ${lly} ${urx} ${ury}`,
    `%%HiResBoundingBox: ${llx} ${lly} ${urx} ${ury}`,
    '%%EndComments',
    '%%Page: 1 1',
    'gsave',
    ...body,
    'grestore',
    'showpage',
    '%%EOF',
    ''
  ].join('\n')
}
