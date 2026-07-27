/**
 * Smart alignment guides while dragging elements.
 * @module align-guides
 * @license MIT
 */

import { NS } from './namespaces.js'
import { assignAttributes, getStrokedBBoxDefaultVisible, walkTree } from './utilities.js'

/** @type {import('../svgcanvas.js').default|null} */
let svgCanvas = null

const GUIDE_LAYER_ID = 'alignGuideLayer'

/**
 * @param {import('../svgcanvas.js').default} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
}

/**
 * @returns {Element|null}
 */
const getGuideParent = () => {
  return svgCanvas?.selectorManager?.selectorParentGroup || null
}

/**
 * @returns {{ w: number, h: number }}
 */
const getContentSize = () => ({
  w: svgCanvas?.getContentW?.() || 0,
  h: svgCanvas?.getContentH?.() || 0
})

/**
 * Extend guide segments across the visible content area for clarity.
 * @param {{x1:number,y1:number,x2:number,y2:number}} g
 * @param {number} zoom
 */
const spanGuideAcrossContent = (g, zoom) => {
  const cw = getContentSize().w * zoom
  const ch = getContentSize().h * zoom
  const z = zoom || 1
  const x1 = g.x1 * z
  const y1 = g.y1 * z
  const x2 = g.x2 * z
  const y2 = g.y2 * z
  // Vertical guide
  if (Math.abs(x1 - x2) < 0.01) {
    return { x1, y1: 0, x2, y2: ch }
  }
  // Horizontal guide
  if (Math.abs(y1 - y2) < 0.01) {
    return { x1: 0, y1, x2: cw, y2 }
  }
  return { x1, y1, x2, y2 }
}

/**
 * @returns {void}
 */
export const clearAlignmentGuides = () => {
  const parent = getGuideParent()
  parent?.querySelector(`#${GUIDE_LAYER_ID}`)?.remove()
}

/**
 * @param {{x:number,y:number,width:number,height:number}} box
 * @returns {{left:number,right:number,cx:number,top:number,bottom:number,cy:number}}
 */
const boxLines = (box) => ({
  left: box.x,
  right: box.x + box.width,
  cx: box.x + box.width / 2,
  top: box.y,
  bottom: box.y + box.height,
  cy: box.y + box.height / 2
})

/**
 * @param {number} value
 * @param {number} target
 * @param {number} threshold
 * @returns {number|null}
 */
const snapDelta = (value, target, threshold) => {
  const d = target - value
  return Math.abs(d) <= threshold ? d : null
}

/**
 * @param {Set<Element>} selectedSet
 * @returns {Array<ReturnType<typeof boxLines>>}
 */
const getSnapReferenceLines = (selectedSet) => {
  const refs = []
  const layer = svgCanvas.getCurrentGroup?.() ||
    svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()
  if (!layer) return refs

  walkTree(layer, (el) => {
    if (el.nodeType !== 1 || selectedSet.has(el) || typeof el.getBBox !== 'function') {
      return
    }
    const tag = el.localName?.toLowerCase?.() || el.tagName?.toLowerCase?.()
    if (!tag || tag === 'title' || tag === 'defs') return
    if (tag === 'g') {
      if (el === layer || el.classList?.contains('layer')) return
      if (el.querySelector('g')) return
    }
    try {
      const bb = getStrokedBBoxDefaultVisible([el])
      if (bb && (bb.width > 0 || bb.height > 0)) {
        refs.push(boxLines(bb))
      }
    } catch (_) { /* ignore bad nodes */ }
  })

  const pageW = svgCanvas.getContentW()
  const pageH = svgCanvas.getContentH()
  refs.push(boxLines({ x: 0, y: 0, width: pageW, height: pageH }))
  // Mid-page guides help center elements on posters / slides
  if (pageW > 80) {
    refs.push({
      left: pageW / 2,
      right: pageW / 2,
      cx: pageW / 2,
      top: 0,
      bottom: pageH,
      cy: pageH / 2
    })
  }
  if (pageH > 80) {
    refs.push({
      left: 0,
      right: pageW,
      cx: pageW / 2,
      top: pageH / 2,
      bottom: pageH / 2,
      cy: pageH / 2
    })
  }

  return refs
}

/**
 * @param {Element[]} selectedElements
 * @param {number} dx
 * @param {number} dy
 * @param {number} zoom
 * @returns {{dx:number, dy:number, guides:Array<{x1:number,y1:number,x2:number,y2:number}>}}
 */
export const applyAlignmentSnap = (selectedElements, dx, dy, zoom) => {
  const config = svgCanvas?.getCurConfig?.() || {}
  if (config.alignGuides === false || !selectedElements?.length) {
    return { dx, dy, guides: [] }
  }

  const threshold = (config.alignGuideThreshold ?? 8) / zoom
  const startBox = svgCanvas.dragAlignStartBox ||
    getStrokedBBoxDefaultVisible(selectedElements.filter(Boolean))
  if (!startBox || (startBox.width === 0 && startBox.height === 0)) {
    return { dx, dy, guides: [] }
  }

  const moved = {
    x: startBox.x + dx,
    y: startBox.y + dy,
    width: startBox.width,
    height: startBox.height
  }
  const sel = boxLines(moved)

  /** @type {Array<{axis:'x'|'y', delta:number, span:{x1:number,y1:number,x2:number,y2:number}}>} */
  const candidates = []

  const selectedSet = new Set(selectedElements.filter(Boolean))
  const refs = getSnapReferenceLines(selectedSet)

  const xPairs = [
    ['left', 'left'], ['left', 'right'], ['left', 'cx'],
    ['right', 'left'], ['right', 'right'], ['right', 'cx'],
    ['cx', 'left'], ['cx', 'right'], ['cx', 'cx']
  ]
  const yPairs = [
    ['top', 'top'], ['top', 'bottom'], ['top', 'cy'],
    ['bottom', 'top'], ['bottom', 'bottom'], ['bottom', 'cy'],
    ['cy', 'top'], ['cy', 'bottom'], ['cy', 'cy']
  ]

  refs.forEach((ref) => {
    xPairs.forEach(([sk, rk]) => {
      const delta = snapDelta(sel[sk], ref[rk], threshold)
      if (delta !== null) {
        candidates.push({
          axis: 'x',
          delta,
          span: {
            x1: ref[rk],
            y1: Math.min(sel.top, ref.top),
            x2: ref[rk],
            y2: Math.max(sel.bottom, ref.bottom)
          }
        })
      }
    })
    yPairs.forEach(([sk, rk]) => {
      const delta = snapDelta(sel[sk], ref[rk], threshold)
      if (delta !== null) {
        candidates.push({
          axis: 'y',
          delta,
          span: {
            x1: Math.min(sel.left, ref.left),
            y1: ref[rk],
            x2: Math.max(sel.right, ref.right),
            y2: ref[rk]
          }
        })
      }
    })
  })

  let bestX = null
  let bestY = null
  candidates.forEach((c) => {
    if (c.axis === 'x' && (!bestX || Math.abs(c.delta) < Math.abs(bestX.delta))) bestX = c
    if (c.axis === 'y' && (!bestY || Math.abs(c.delta) < Math.abs(bestY.delta))) bestY = c
  })

  const guides = []
  if (bestX) {
    dx += bestX.delta
    guides.push(bestX.span)
  }
  if (bestY) {
    dy += bestY.delta
    guides.push(bestY.span)
  }

  // Rebuild guide spans from the snapped selection box so lines match the selection chrome
  if (guides.length) {
    const snapped = boxLines({
      x: startBox.x + dx,
      y: startBox.y + dy,
      width: startBox.width,
      height: startBox.height
    })
    const rebuilt = []
    if (bestX) {
      const xLine = bestX.span.x1
      rebuilt.push({
        x1: xLine,
        y1: Math.min(snapped.top, bestX.span.y1),
        x2: xLine,
        y2: Math.max(snapped.bottom, bestX.span.y2)
      })
    }
    if (bestY) {
      const yLine = bestY.span.y1
      rebuilt.push({
        x1: Math.min(snapped.left, bestY.span.x1),
        y1: yLine,
        x2: Math.max(snapped.right, bestY.span.x2),
        y2: yLine
      })
    }
    return { dx, dy, guides: rebuilt }
  }

  return { dx, dy, guides }
}

/**
 * @param {Array<{x1:number,y1:number,x2:number,y2:number}>} guides
 * @param {number} zoom
 * @returns {void}
 */
export const showAlignmentGuides = (guides, zoom) => {
  if (!svgCanvas) return
  clearAlignmentGuides()
  if (!guides?.length) return

  const parent = getGuideParent()
  if (!parent) return

  const z = zoom || svgCanvas.getZoom?.() || 1
  const doc = parent.ownerDocument
  const layer = doc.createElementNS(NS.SVG, 'g')
  assignAttributes(layer, {
    id: GUIDE_LAYER_ID,
    style: 'pointer-events: none'
  })

  const strokeWidth = Math.max(1 / z, 0.5)
  guides.forEach((g) => {
    const span = spanGuideAcrossContent(g, z)
    const line = doc.createElementNS(NS.SVG, 'line')
    assignAttributes(line, {
      x1: span.x1,
      y1: span.y1,
      x2: span.x2,
      y2: span.y2,
      stroke: '#00d4ff',
      'stroke-width': strokeWidth,
      'vector-effect': 'non-scaling-stroke',
      'stroke-dasharray': '4 3',
      opacity: 0.95
    })
    layer.append(line)
  })

  parent.append(layer)
}
