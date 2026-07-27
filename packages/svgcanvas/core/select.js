/**
 * DOM element selection box tools.
 * @module select
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { isWebkit } from '../common/browser.js'
import { getRotationAngle, getBBox, getStrokedBBox } from './utilities.js'
import { transformListToTransform, transformBox, transformPoint, matrixMultiply, getTransformList } from './math.js'
import { NS } from './namespaces'
import { warn } from '../common/logger.js'
import {
  cornerWidgetPosition,
  getCornerRadius,
  getShapeCornerPoints,
  isCornerGripEligible,
  polygonSignedArea,
  supportsCornerRadius
} from './corner-radius.js'

let svgCanvas
// Figma-like light selection chrome (constant screen size via vector-effect)
const SELECT_BLUE = '#0D99FF'
const gripSize = window.ontouchstart ? 12 : 8
const gripRadius = gripSize / 2
const gripStroke = {
  fill: '#ffffff',
  stroke: SELECT_BLUE,
  'stroke-width': 1,
  'vector-effect': 'non-scaling-stroke'
}

/**
 * Private singleton manager for selector state
 */
class SelectModule {
  #selectorManager = null

  /**
   * Initialize the select module with canvas
   * @param {Object} canvas - The SVG canvas instance
   * @returns {void}
   */
  init (canvas) {
    svgCanvas = canvas
    this.#selectorManager = new SelectorManager()
  }

  /**
   * Get the singleton SelectorManager instance
   * @returns {SelectorManager} The SelectorManager instance
   */
  getSelectorManager () {
    return this.#selectorManager
  }
}

/**
* Private class for DOM element selection boxes.
*/
export class Selector {
  /**
  * @param {Integer} id - Internally identify the selector
  * @param {Element} elem - DOM element associated with this selector
  * @param {module:utilities.BBoxObject} [bbox] - Optional bbox to use for initialization (prevents duplicate `getBBox` call).
  */
  constructor (id, elem, bbox) {
    // this is the selector's unique number
    this.id = id

    // this holds a reference to the element for which this selector is being used
    this.selectedElement = elem

    // this is a flag used internally to track whether the selector is being used or not
    this.locked = true

    // this holds a reference to the <g> element that holds all visual elements of the selector
    this.selectorGroup = svgCanvas.createSVGElement({
      element: 'g',
      attr: { id: `selectorGroup${this.id}` }
    })

    // this holds a reference to the path rect
    this.selectorRect = svgCanvas.createSVGElement({
      element: 'path',
      attr: {
        id: `selectedBox${this.id}`,
        fill: 'none',
        stroke: SELECT_BLUE,
        'stroke-width': '1',
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
        // need to specify this so that the rect is not selectable
        style: 'pointer-events:none'
      }
    })
    this.selectorGroup.append(this.selectorRect)

    // this holds a reference to the grip coordinates for this selector
    this.gripCoords = {
      nw: null,
      n: null,
      ne: null,
      e: null,
      se: null,
      s: null,
      sw: null,
      w: null
    }

    this.reset(this.selectedElement, bbox)
  }

  /**
  * Used to reset the id and element that the selector is attached to.
  * @param {Element} e - DOM element associated with this selector
  * @param {module:utilities.BBoxObject} bbox - Optional bbox to use for reset (prevents duplicate getBBox call).
  * @returns {void}
  */
  reset (e, bbox) {
    this.locked = true
    this.selectedElement = e
    this.resize(bbox)
    this.selectorGroup.setAttribute('display', 'inline')
  }

  /**
  * Show the resize grips of this selector.
  * @param {boolean} show - Indicates whether grips should be shown or not
  * @returns {void}
  */
  showGrips (show) {
    const bShow = show ? 'inline' : 'none'
    selectModule.getSelectorManager().selectorGripsGroup.setAttribute('display', bShow)
    const elem = this.selectedElement
    this.hasGrips = show
    if (elem && show) {
      this.selectorGroup.append(selectModule.getSelectorManager().selectorGripsGroup)
      Selector.updateGripCursors(getRotationAngle(elem))
      // Reposition corner-radius grips now that hasGrips is true
      this.resize()
    }
  }

  /**
  * Updates the selector to match the element's size.
  * @param {module:utilities.BBoxObject} [bbox] - BBox to use for resize (prevents duplicate getBBox call).
  * @returns {void}
  */
  resize (bbox) {
    const dataStorage = svgCanvas.getDataStorage()
    const selectedBox = this.selectorRect
    const mgr = selectModule.getSelectorManager()
    const selectedGrips = mgr.selectorGrips
    const selected = this.selectedElement
    const zoom = svgCanvas.getZoom()
    let offset = 1 / zoom
    const sw = selected.getAttribute('stroke-width')
    if (selected.getAttribute('stroke') !== 'none' && !isNaN(sw)) {
      offset += (sw / 2)
    }

    const { tagName } = selected
    if (tagName === 'text') {
      offset += 2 / zoom
    }

    // find the transformations applied to the parent of the selected element
    const svg = document.createElementNS(NS.SVG, 'svg')
    let parentTransformationMatrix = svg.createSVGMatrix()
    let currentElt = selected
    while (currentElt.parentNode) {
      if (currentElt.parentNode && currentElt.parentNode.tagName === 'g' && currentElt.parentNode.transform) {
        if (currentElt.parentNode.transform.baseVal.numberOfItems) {
          parentTransformationMatrix = matrixMultiply(transformListToTransform(getTransformList(currentElt.parentNode)).matrix, parentTransformationMatrix)
        }
      }
      currentElt = currentElt.parentNode
    }

    // loop and transform our bounding box until we reach our first rotation
    const tlist = getTransformList(selected)

    // combines the parent transformation with that of the selected element if necessary
    const m = parentTransformationMatrix ? matrixMultiply(parentTransformationMatrix, transformListToTransform(tlist).matrix) : transformListToTransform(tlist).matrix

    // This should probably be handled somewhere else, but for now
    // it keeps the selection box correctly positioned when zoomed
    m.e *= zoom
    m.f *= zoom

    if (!bbox) {
      bbox = getBBox(selected)
    }
    // TODO: getBBox (previous line) already knows to call getStrokedBBox when tagName === 'g'. Remove this?
    // TODO: getBBox doesn't exclude 'gsvg' and calls getStrokedBBox for any 'g'. Should getBBox be updated?
    if (tagName === 'g' && !dataStorage.has(selected, 'gsvg')) {
      // The bbox for a group does not include stroke vals, so we
      // get the bbox based on its children.
      const strokedBbox = getStrokedBBox([selected.childNodes])
      if (strokedBbox) {
        bbox = strokedBbox
      }
    }

    if (bbox) {
      // apply the transforms
      const l = bbox.x; const t = bbox.y; const w = bbox.width; const h = bbox.height
      // bbox = {x: l, y: t, width: w, height: h}; // Not in use

      // we need to handle temporary transforms too
      // if skewed, get its transformed box, then find its axis-aligned bbox

      // *
      offset *= zoom

      const nbox = transformBox(l * zoom, t * zoom, w * zoom, h * zoom, m)
      const { aabox } = nbox
      let nbax = aabox.x - offset
      let nbay = aabox.y - offset
      let nbaw = aabox.width + (offset * 2)
      let nbah = aabox.height + (offset * 2)

      // now if the shape is rotated, un-rotate it
      const cx = nbax + nbaw / 2
      const cy = nbay + nbah / 2

      const angle = getRotationAngle(selected)
      if (angle) {
        const rot = svgCanvas.getSvgRoot().createSVGTransform()
        rot.setRotate(-angle, cx, cy)
        const rotm = rot.matrix
        nbox.tl = transformPoint(nbox.tl.x, nbox.tl.y, rotm)
        nbox.tr = transformPoint(nbox.tr.x, nbox.tr.y, rotm)
        nbox.bl = transformPoint(nbox.bl.x, nbox.bl.y, rotm)
        nbox.br = transformPoint(nbox.br.x, nbox.br.y, rotm)

        // calculate the axis-aligned bbox
        const { tl } = nbox
        let minx = tl.x
        let miny = tl.y
        let maxx = tl.x
        let maxy = tl.y

        const { min, max } = Math

        minx = min(minx, min(nbox.tr.x, min(nbox.bl.x, nbox.br.x))) - offset
        miny = min(miny, min(nbox.tr.y, min(nbox.bl.y, nbox.br.y))) - offset
        maxx = max(maxx, max(nbox.tr.x, max(nbox.bl.x, nbox.br.x))) + offset
        maxy = max(maxy, max(nbox.tr.y, max(nbox.bl.y, nbox.br.y))) + offset

        nbax = minx
        nbay = miny
        nbaw = (maxx - minx)
        nbah = (maxy - miny)
      }

      const dstr = `M${nbax},${nbay} L${nbax + nbaw},${nbay} ${nbax + nbaw},${nbay + nbah} ${nbax},${nbay + nbah}z`

      const xform = angle ? 'rotate(' + [angle, cx, cy].join(',') + ')' : ''

      // TODO(codedread): Is this needed?
      //  if (selected === selectedElements[0]) {
      this.gripCoords = {
        nw: [nbax, nbay],
        ne: [nbax + nbaw, nbay],
        sw: [nbax, nbay + nbah],
        se: [nbax + nbaw, nbay + nbah],
        n: [nbax + (nbaw) / 2, nbay],
        w: [nbax, nbay + (nbah) / 2],
        e: [nbax + nbaw, nbay + (nbah) / 2],
        s: [nbax + (nbaw) / 2, nbay + nbah]
      }
      selectedBox.setAttribute('d', dstr)
      this.selectorGroup.setAttribute('transform', xform)
      Object.entries(this.gripCoords).forEach(([dir, coords]) => {
        const half = gripSize / 2
        selectedGrips[dir].setAttribute('x', coords[0] - half)
        selectedGrips[dir].setAttribute('y', coords[1] - half)
      })

      // Lines use endpoint grips instead of box-resize handles
      if (tagName === 'line') {
        Object.values(selectedGrips).forEach((grip) => {
          grip.setAttribute('display', 'none')
        })
      } else {
        Object.values(selectedGrips).forEach((grip) => {
          grip.setAttribute('display', 'inline')
        })
      }

      // we want to go 20 pixels in the negative transformed y direction, ignoring scale
      mgr.rotateGripConnector.setAttribute('x1', nbax + (nbaw) / 2)
      mgr.rotateGripConnector.setAttribute('y1', nbay)
      mgr.rotateGripConnector.setAttribute('x2', nbax + (nbaw) / 2)
      mgr.rotateGripConnector.setAttribute('y2', nbay - (gripRadius * 5))

      mgr.rotateGrip.setAttribute('cx', nbax + (nbaw) / 2)
      mgr.rotateGrip.setAttribute('cy', nbay - (gripRadius * 5))

      // Illustrator-style grips: sharp interior corners only, inset into the fill.
      // Transform vertices with the same matrix as the selection box so grips
      // track the shape during drag/move (parented to selectorGroup).
      const showCorners = supportsCornerRadius(selected) && this.hasGrips
      const shapePts = showCorners ? getShapeCornerPoints(selected) : []
      if (showCorners && mgr.selectorGripsGroup.parentNode !== this.selectorGroup) {
        this.selectorGroup.append(mgr.selectorGripsGroup)
      }
      let unrotm = null
      if (angle) {
        const rot = svgCanvas.getSvgRoot().createSVGTransform()
        rot.setRotate(-angle, cx, cy)
        unrotm = rot.matrix
      }
      const screenPts = shapePts.map((p) => {
        let pt = transformPoint(p.x * zoom, p.y * zoom, m)
        if (unrotm) {
          pt = transformPoint(pt.x, pt.y, unrotm)
        }
        return pt
      })
      const signedArea = screenPts.length >= 3 ? polygonSignedArea(screenPts) : 0
      const eligible = []
      if (showCorners && screenPts.length >= 3) {
        const n = screenPts.length
        for (let i = 0; i < n; i++) {
          if (isCornerGripEligible(
            screenPts[(i + n - 1) % n],
            screenPts[i],
            screenPts[(i + 1) % n],
            signedArea
          )) {
            eligible.push(i)
          }
        }
      }
      const grips = mgr.ensureCornerRadiusGrips(eligible.length)
      if (eligible.length) {
        const radius = (getCornerRadius(selected) || 0) * zoom
        const minInset = 10
        const n = screenPts.length
        eligible.forEach((vertexIndex, gripIndex) => {
          const widget = cornerWidgetPosition(
            screenPts[(vertexIndex + n - 1) % n],
            screenPts[vertexIndex],
            screenPts[(vertexIndex + 1) % n],
            radius,
            minInset,
            signedArea
          )
          const grip = grips[gripIndex]
          dataStorage.put(grip, 'dir', vertexIndex)
          grip.setAttribute('display', 'inline')
          grip.setAttribute('cx', widget.x)
          grip.setAttribute('cy', widget.y)
        })
      } else {
        grips.forEach((grip) => grip.setAttribute('display', 'none'))
      }

      // Line endpoint grips — both ends editable in select mode
      const lineGrips = mgr.lineEndpointGrips
      if (lineGrips?.start && lineGrips?.end) {
        if (tagName === 'line' && this.hasGrips) {
          if (mgr.selectorGripsGroup.parentNode !== this.selectorGroup) {
            this.selectorGroup.append(mgr.selectorGripsGroup)
          }
          const x1 = Number(selected.getAttribute('x1')) || 0
          const y1 = Number(selected.getAttribute('y1')) || 0
          const x2 = Number(selected.getAttribute('x2')) || 0
          const y2 = Number(selected.getAttribute('y2')) || 0
          let p1 = transformPoint(x1 * zoom, y1 * zoom, m)
          let p2 = transformPoint(x2 * zoom, y2 * zoom, m)
          if (angle) {
            const rot = svgCanvas.getSvgRoot().createSVGTransform()
            rot.setRotate(-angle, cx, cy)
            p1 = transformPoint(p1.x, p1.y, rot.matrix)
            p2 = transformPoint(p2.x, p2.y, rot.matrix)
          }
          lineGrips.start.setAttribute('display', 'inline')
          lineGrips.start.setAttribute('cx', p1.x)
          lineGrips.start.setAttribute('cy', p1.y)
          lineGrips.end.setAttribute('display', 'inline')
          lineGrips.end.setAttribute('cx', p2.x)
          lineGrips.end.setAttribute('cy', p2.y)
        } else {
          lineGrips.start.setAttribute('display', 'none')
          lineGrips.end.setAttribute('display', 'none')
        }
      }
    }
  }

  // STATIC methods
  /**
  * Updates cursors for corner grips on rotation so arrows point the right way.
  * @param {Float} angle - Current rotation angle in degrees
  * @returns {void}
  */
  static updateGripCursors (angle) {
    const dirArr = Object.keys(selectModule.getSelectorManager().selectorGrips)
    let steps = Math.round(angle / 45)
    if (steps < 0) { steps += 8 }
    while (steps > 0) {
      dirArr.push(dirArr.shift())
      steps--
    }
    Object.values(selectModule.getSelectorManager().selectorGrips).forEach((gripElement, i) => {
      gripElement.setAttribute('style', `cursor:${dirArr[i]}-resize`)
    })
  }
}

/**
* Manage all selector objects (selection boxes).
*/
export class SelectorManager {
  /**
   * Sets up properties and calls `initGroup`.
   */
  constructor () {
    // this will hold the <g> element that contains all selector rects/grips
    this.selectorParentGroup = null

    // this is a special rect that is used for multi-select
    this.rubberBandBox = null

    // this will hold objects of type Selector (see above)
    this.selectors = []

    // this holds a map of SVG elements to their Selector object
    this.selectorMap = {}

    // this holds a reference to the grip elements
    this.selectorGrips = {
      nw: null,
      n: null,
      ne: null,
      e: null,
      se: null,
      s: null,
      sw: null,
      w: null
    }

    this.selectorGripsGroup = null
    this.rotateGripConnector = null
    this.rotateGrip = null
    /** @type {SVGCircleElement[]} dynamic per-vertex corner-radius grips */
    this.cornerRadiusGrips = []
    /** @type {{ start: SVGCircleElement|null, end: SVGCircleElement|null }} */
    this.lineEndpointGrips = { start: null, end: null }

    this.initGroup()
  }

  /**
   * Ensure at least `count` corner-radius grips exist (hide extras).
   * @param {number} count
   * @returns {SVGCircleElement[]}
   */
  ensureCornerRadiusGrips (count) {
    const dataStorage = svgCanvas.getDataStorage()
    while (this.cornerRadiusGrips.length < count) {
      const idx = this.cornerRadiusGrips.length
      const grip = svgCanvas.createSVGElement({
        element: 'circle',
        attr: {
          id: `selectorGrip_corner_${idx}`,
          ...gripStroke,
          r: gripRadius - 0.5,
          display: 'none',
          style: 'cursor:pointer',
          'pointer-events': 'all'
        }
      })
      dataStorage.put(grip, 'dir', idx)
      dataStorage.put(grip, 'type', 'cornerradius')
      this.cornerRadiusGrips.push(grip)
      this.selectorGripsGroup.append(grip)
    }
    for (let i = 0; i < this.cornerRadiusGrips.length; i++) {
      const grip = this.cornerRadiusGrips[i]
      // Do not reset `dir` here — resize() assigns the real vertex index.
      // Resetting to grip slot index caused wrong-vertex radius math / drift.
      if (i >= count) {
        grip.setAttribute('display', 'none')
      }
    }
    return this.cornerRadiusGrips
  }

  /**
  * Resets the parent selector group element.
  * @returns {void}
  */
  initGroup () {
    const dataStorage = svgCanvas.getDataStorage()
    // remove old selector parent group if it existed
    if (this.selectorParentGroup?.parentNode) {
      this.selectorParentGroup.remove()
    }

    // create parent selector group and add it to svgroot
    this.selectorParentGroup = svgCanvas.createSVGElement({
      element: 'g',
      attr: { id: 'selectorParentGroup' }
    })
    this.selectorGripsGroup = svgCanvas.createSVGElement({
      element: 'g',
      attr: { display: 'none' }
    })
    this.selectorParentGroup.append(this.selectorGripsGroup)
    svgCanvas.getSvgRoot().append(this.selectorParentGroup)

    this.selectorMap = {}
    this.selectors = []
    this.rubberBandBox = null

    // add the corner grips (Figma-style white squares, blue edge)
    Object.keys(this.selectorGrips).forEach((dir) => {
      const grip = svgCanvas.createSVGElement({
        element: 'rect',
        attr: {
          id: `selectorGrip_resize_${dir}`,
          ...gripStroke,
          width: gripSize,
          height: gripSize,
          rx: 1,
          ry: 1,
          style: `cursor:${dir}-resize`,
          // Expand hit area without thickening the visible stroke
          'pointer-events': 'all'
        }
      })

      dataStorage.put(grip, 'dir', dir)
      dataStorage.put(grip, 'type', 'resize')
      this.selectorGrips[dir] = grip
      this.selectorGripsGroup.append(grip)
    })

    // add rotator elems
    this.rotateGripConnector =
      svgCanvas.createSVGElement({
        element: 'line',
        attr: {
          id: ('selectorGrip_rotateconnector'),
          stroke: SELECT_BLUE,
          'stroke-width': '1',
          'vector-effect': 'non-scaling-stroke'
        }
      })
    this.selectorGripsGroup.append(this.rotateGripConnector)

    this.rotateGrip =
      svgCanvas.createSVGElement({
        element: 'circle',
        attr: {
          id: 'selectorGrip_rotate',
          ...gripStroke,
          r: gripRadius,
          style: `cursor:url(${svgCanvas.curConfig.imgPath}/rotate.svg) 12 12, auto;`
        }
      })
    this.selectorGripsGroup.append(this.rotateGrip)
    dataStorage.put(this.rotateGrip, 'type', 'rotate')

    // Corner-radius grips are created on demand (one per vertex)
    this.cornerRadiusGrips = []

    // Line endpoint grips (both ends editable without converting to path)
    ;['start', 'end'].forEach((end) => {
      const grip = svgCanvas.createSVGElement({
        element: 'circle',
        attr: {
          id: `selectorGrip_line_${end}`,
          ...gripStroke,
          r: gripRadius,
          display: 'none',
          style: 'cursor:move',
          'pointer-events': 'all'
        }
      })
      dataStorage.put(grip, 'type', 'linepoint')
      dataStorage.put(grip, 'dir', end)
      this.lineEndpointGrips[end] = grip
      this.selectorGripsGroup.append(grip)
    })

    if (document.getElementById('canvasBackground')) { return }

    const [width, height] = svgCanvas.curConfig.dimensions
    const canvasbg = svgCanvas.createSVGElement({
      element: 'svg',
      attr: {
        id: 'canvasBackground',
        width,
        height,
        x: 0,
        y: 0,
        overflow: (isWebkit() ? 'none' : 'visible'), // Chrome 7 has a problem with this when zooming out
        style: 'pointer-events:none'
      }
    })

    const rect = svgCanvas.createSVGElement({
      element: 'rect',
      attr: {
        width: '100%',
        height: '100%',
        x: 0,
        y: 0,
        'stroke-width': 1,
        stroke: '#000',
        fill: '#FFF',
        style: 'pointer-events:none'
      }
    })
    canvasbg.append(rect)
    svgCanvas.getSvgRoot().insertBefore(canvasbg, svgCanvas.getSvgContent())
  }

  /**
  *
  * @param {Element} elem - DOM element to get the selector for
  * @param {module:utilities.BBoxObject} [bbox] - Optional bbox to use for reset (prevents duplicate getBBox call).
  * @returns {Selector} The selector based on the given element
  */
  requestSelector (elem, bbox) {
    if (!elem) { return null }

    const N = this.selectors.length
    // If we've already acquired one for this element, return it.
    if (typeof this.selectorMap[elem.id] === 'object') {
      this.selectorMap[elem.id].locked = true
      return this.selectorMap[elem.id]
    }
    for (let i = 0; i < N; ++i) {
      if (!this.selectors[i]?.locked) {
        this.selectors[i].locked = true
        this.selectors[i].reset(elem, bbox)
        this.selectorMap[elem.id] = this.selectors[i]
        return this.selectors[i]
      }
    }
    // if we reached here, no available selectors were found, we create one
    this.selectors[N] = new Selector(N, elem, bbox)
    this.selectorParentGroup.append(this.selectors[N].selectorGroup)
    this.selectorMap[elem.id] = this.selectors[N]
    return this.selectors[N]
  }

  /**
  * Removes the selector of the given element (hides selection box).
  *
  * @param {Element} elem - DOM element to remove the selector for
  * @returns {void}
  */
  releaseSelector (elem) {
    if (!elem) { return }
    const N = this.selectors.length
    const sel = this.selectorMap[elem.id]
    if (!sel?.locked) {
      // TODO(codedread): Ensure this exists in this module.
      warn('WARNING! selector was released but was already unlocked', null, 'select')
    }
    for (let i = 0; i < N; ++i) {
      if (this.selectors[i] && this.selectors[i] === sel) {
        delete this.selectorMap[elem.id]
        sel.locked = false
        sel.selectedElement = null
        sel.showGrips(false)

        // remove from DOM and store reference in JS but only if it exists in the DOM
        try {
          sel.selectorGroup.setAttribute('display', 'none')
        } catch (e) { /* empty fn */ }

        break
      }
    }
  }

  /**
  * @returns {SVGRectElement} The rubberBandBox DOM element. This is the rectangle drawn by
  * the user for selecting/zooming
  */
  getRubberBandBox () {
    if (!this.rubberBandBox) {
      this.rubberBandBox =
        svgCanvas.createSVGElement({
          element: 'rect',
          attr: {
            id: 'selectorRubberBand',
            fill: SELECT_BLUE,
            'fill-opacity': 0.08,
            stroke: SELECT_BLUE,
            'stroke-width': 1,
            'vector-effect': 'non-scaling-stroke',
            display: 'none',
            style: 'pointer-events:none'
          }
        })
      this.selectorParentGroup.append(this.rubberBandBox)
    }
    return this.rubberBandBox
  }
}

/**
 * An object that creates SVG elements for the canvas.
 *
 * @interface module:select.SVGFactory
 */
/**
 * @function module:select.SVGFactory#createSVGElement
 * @param {module:utilities.EditorContext#addSVGElementsFromJson} jsonMap
 * @returns {SVGElement}
 */
/**
 * @function module:select.SVGFactory#svgRoot
 * @returns {SVGSVGElement}
 */
/**
 * @function module:select.SVGFactory#svgContent
 * @returns {SVGSVGElement}
 */
/**
 * @function module:select.SVGFactory#getZoom
 * @returns {Float} The current zoom level
 */

/**
 * @typedef {GenericArray} module:select.Dimensions
 * @property {Integer} length 2
 * @property {Float} 0 Width
 * @property {Float} 1 Height
 */
/**
 * @typedef {PlainObject} module:select.Config
 * @property {string} imgPath
 * @property {module:select.Dimensions} dimensions
 */

// Export singleton instance for backward compatibility
const selectModule = new SelectModule()

/**
 * Initializes this module.
 * @function module:select.init
 * @param {module:select.Config} config - An object containing configurable parameters (imgPath)
 * @param {module:select.SVGFactory} svgFactory - An object implementing the SVGFactory interface.
 * @returns {void}
 */
export const init = (canvas) => {
  selectModule.init(canvas)
}

/**
 * @function module:select.getSelectorManager
 * @returns {module:select.SelectorManager} The SelectorManager instance.
 */
export const getSelectorManager = () => selectModule.getSelectorManager()
