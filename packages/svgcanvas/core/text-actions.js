/**
 * @module text-actions Tools for Text edit functions
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.js'
import { transformPoint, matrixMultiply, getTransformList, transformListToTransform } from './math.js'
import {
  assignAttributes,
  getElement,
  getBBox as utilsGetBBox
} from './utilities.js'
import { getTextElementContent } from './text-content.js'
import { supportsGoodTextCharPos } from '../common/browser.js'

let svgCanvas = null

/**
 * @function module:text-actions.init
 * @param {module:text-actions.svgCanvas} textActionsContext
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
}

/**
 * Group: Text edit functions
 * Functions relating to editing text elements.
 * @class TextActions
 * @memberof module:svgcanvas.SvgCanvas#
 */
class TextActions {
  #curtext = null
  #textinput = null
  #cursor = null
  #selblock = null
  #blinker = null
  #chardata = []
  #textbb = null // , transbb;
  #matrix = null
  #lastX = null
  #lastY = null
  #allowDbl = false
  #savedSel = { start: 0, end: 0 }

  /**
   * Get the accumulated transformation matrix from the element up to the SVG content element.
   * This includes transforms from all parent groups, fixing the issue where text cursor
   * appears in the wrong position when editing text inside a transformed group.
   * @param {Element} elem - The element to get the accumulated matrix for
   * @returns {SVGMatrix|null} The accumulated transformation matrix, or null if none
   * @private
   */
  #getAccumulatedMatrix = (elem) => {
    const svgContent = svgCanvas.getSvgContent()
    const matrices = []

    let current = elem
    while (current && current !== svgContent && current.nodeType === 1) {
      const tlist = getTransformList(current)
      if (tlist && tlist.numberOfItems > 0) {
        const matrix = transformListToTransform(tlist).matrix
        matrices.unshift(matrix) // Add to beginning to maintain correct order
      }
      current = current.parentNode
    }

    if (matrices.length === 0) {
      return null
    }

    if (matrices.length === 1) {
      return matrices[0]
    }

    // Multiply all matrices together
    return matrixMultiply(...matrices)
  }

  /**
   * Remember textarea selection (survives toolbar button focus steal).
   * @returns {void}
   * @private
   */
  #rememberSelection = () => {
    if (!this.#textinput) return
    this.#savedSel = {
      start: this.#textinput.selectionStart,
      end: this.#textinput.selectionEnd
    }
  }

  /**
   *
   * @param {Integer} index
   * @returns {void}
   * @private
   */
  #setCursor = (index = undefined) => {
    const empty = this.#textinput.value === ''
    this.#textinput.focus()

    if (index === undefined) {
      if (empty) {
        index = 0
      } else {
        if (this.#textinput.selectionEnd !== this.#textinput.selectionStart) {
          return
        }
        index = this.#textinput.selectionEnd
      }
    }

    const charbb = this.#chardata[index]
    if (!empty) {
      this.#textinput.setSelectionRange(index, index)
      this.#savedSel = { start: index, end: index }
    }
    this.#cursor = getElement('text_cursor')
    if (!this.#cursor) {
      this.#cursor = document.createElementNS(NS.SVG, 'line')
      assignAttributes(this.#cursor, {
        id: 'text_cursor',
        stroke: '#333',
        'stroke-width': 1
      })
      getElement('selectorParentGroup').append(this.#cursor)
    }

    if (!this.#blinker) {
      this.#blinker = setInterval(() => {
        const show = this.#cursor.getAttribute('display') === 'none'
        this.#cursor.setAttribute('display', show ? 'inline' : 'none')
      }, 600)
    }

    const startPt = this.#ptToScreen(charbb.x, charbb.y ?? this.#textbb.y)
    const endPt = this.#ptToScreen(
      charbb.x,
      (charbb.y ?? this.#textbb.y) + (charbb.height ?? this.#textbb.height)
    )

    assignAttributes(this.#cursor, {
      x1: startPt.x,
      y1: startPt.y,
      x2: endPt.x,
      y2: endPt.y,
      visibility: 'visible',
      display: 'inline'
    })

    if (this.#selblock) {
      this.#selblock.setAttribute('d', '')
    }
  }

  /**
   *
   * @param {Integer} start
   * @param {Integer} end
   * @param {boolean} skipInput
   * @returns {void}
   * @private
   */
  #setSelection = (start, end, skipInput) => {
    if (start === end) {
      this.#setCursor(end)
      return
    }

    if (!skipInput) {
      this.#textinput.setSelectionRange(start, end)
    }
    this.#savedSel = { start, end }

    this.#selblock = getElement('text_selectblock')
    if (!this.#selblock) {
      this.#selblock = document.createElementNS(NS.SVG, 'path')
      assignAttributes(this.#selblock, {
        id: 'text_selectblock',
        fill: 'green',
        opacity: 0.5,
        style: 'pointer-events:none'
      })
      getElement('selectorParentGroup').append(this.#selblock)
    }

    this.#cursor.setAttribute('visibility', 'hidden')

    // Cover selected glyphs (works across multiple lines).
    const parts = []
    for (let i = start; i < end; i++) {
      const bb = this.#chardata[i]
      if (!bb) continue
      const y = bb.y ?? this.#textbb.y
      const h = bb.height ?? this.#textbb.height
      const tl = this.#ptToScreen(bb.x, y)
      const tr = this.#ptToScreen(bb.x + bb.width, y)
      const br = this.#ptToScreen(bb.x + bb.width, y + h)
      const bl = this.#ptToScreen(bb.x, y + h)
      parts.push(`M${tl.x},${tl.y} L${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}z`)
    }
    const dstr = parts.join(' ')

    assignAttributes(this.#selblock, {
      d: dstr,
      display: 'inline'
    })
  }

  /**
   *
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {Integer}
   * @private
   */
  #getIndexFromPoint = (mouseX, mouseY) => {
    // No content, so return 0
    if (this.#chardata.length <= 1) {
      return 0
    }

    // Nearest glyph in logical coordinates (includes virtual newline slots).
    let best = 0
    let bestDist = Infinity
    const last = this.#chardata.length - 1
    for (let i = 0; i < last; i++) {
      const bb = this.#chardata[i]
      if (!bb) continue
      const cx = bb.x + (bb.width || 0) / 2
      const cy = (bb.y ?? this.#textbb.y) + (bb.height ?? this.#textbb.height) / 2
      const dist = (mouseX - cx) ** 2 + (mouseY - cy) ** 2
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }

    const charbb = this.#chardata[best]
    const mid = charbb.x + (charbb.width || 0) / 2
    if (mouseX > mid) {
      best = Math.min(best + 1, last)
    }
    return best
  }

  /**
   *
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   * @private
   */
  #setCursorFromPoint = (mouseX, mouseY) => {
    this.#setCursor(this.#getIndexFromPoint(mouseX, mouseY))
  }

  /**
   *
   * @param {Float} x
   * @param {Float} y
   * @param {boolean} apply
   * @returns {void}
   * @private
   */
  #setEndSelectionFromPoint = (x, y, apply) => {
    const i1 = this.#textinput.selectionStart
    const i2 = this.#getIndexFromPoint(x, y)

    const start = Math.min(i1, i2)
    const end = Math.max(i1, i2)
    this.#setSelection(start, end, !apply)
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   * @private
   */
  #screenToPt = (xIn, yIn) => {
    const out = {
      x: xIn,
      y: yIn
    }
    const zoom = svgCanvas.getZoom()
    out.x /= zoom
    out.y /= zoom

    if (this.#matrix) {
      const pt = transformPoint(out.x, out.y, this.#matrix.inverse())
      out.x = pt.x
      out.y = pt.y
    }

    return out
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   * @private
   */
  #ptToScreen = (xIn, yIn) => {
    const out = {
      x: xIn,
      y: yIn
    }

    if (this.#matrix) {
      const pt = transformPoint(out.x, out.y, this.#matrix)
      out.x = pt.x
      out.y = pt.y
    }
    const zoom = svgCanvas.getZoom()
    out.x *= zoom
    out.y *= zoom

    return out
  }

  /**
   *
   * @param {Event} evt
   * @returns {void}
   * @private
   */
  #selectAll = (evt) => {
    this.#setSelection(0, getTextElementContent(this.#curtext).length)
    evt.target.removeEventListener('click', this.#selectAll)
  }

  /**
   *
   * @param {Event} evt
   * @returns {void}
   * @private
   */
  #selectWord = (evt) => {
    if (!this.#allowDbl || !this.#curtext) {
      return
    }
    const zoom = svgCanvas.getZoom()
    const ept = transformPoint(evt.pageX, evt.pageY, svgCanvas.getrootSctm())
    const mouseX = ept.x * zoom
    const mouseY = ept.y * zoom
    const pt = this.#screenToPt(mouseX, mouseY)

    const index = this.#getIndexFromPoint(pt.x, pt.y)
    const str = getTextElementContent(this.#curtext)
    const first = str.slice(0, index).replace(/[a-z\d]+$/i, '').length
    const m = str.slice(index).match(/^[a-z\d]+/i)
    const last = (m ? m[0].length : 0) + index
    this.#setSelection(first, last)

    // Set tripleclick
    svgCanvas.$click(evt.target, this.#selectAll)

    setTimeout(() => {
      evt.target.removeEventListener('click', this.#selectAll)
    }, 300)
  }

  /**
   * @param {Element} target
   * @param {Float} x
   * @param {Float} y
   * @returns {void}
   */
  select (target, x, y) {
    this.#curtext = target
    svgCanvas.textActions.toEditMode(x, y)
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  start (elem) {
    this.#curtext = elem
    svgCanvas.textActions.toEditMode()
  }

  /**
   * @param {external:MouseEvent} evt
   * @param {Element} mouseTarget
   * @param {Float} startX
   * @param {Float} startY
   * @returns {void}
   */
  mouseDown (evt, mouseTarget, startX, startY) {
    const pt = this.#screenToPt(startX, startY)

    this.#textinput.focus()
    this.#setCursorFromPoint(pt.x, pt.y)
    this.#lastX = startX
    this.#lastY = startY

    // TODO: Find way to block native selection
  }

  /**
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   */
  mouseMove (mouseX, mouseY) {
    const pt = this.#screenToPt(mouseX, mouseY)
    this.#setEndSelectionFromPoint(pt.x, pt.y)
  }

  /**
   * @param {external:MouseEvent} evt
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   */
  mouseUp (evt, mouseX, mouseY) {
    const pt = this.#screenToPt(mouseX, mouseY)

    this.#setEndSelectionFromPoint(pt.x, pt.y, true)

    // TODO: Find a way to make this work: Use transformed BBox instead of evt.target
    // if (lastX === mouseX && lastY === mouseY
    //   && !rectsIntersect(transbb, {x: pt.x, y: pt.y, width: 0, height: 0})) {
    //   svgCanvas.textActions.toSelectMode(true);
    // }

    if (
      evt.target !== this.#curtext &&
      mouseX < this.#lastX + 2 &&
      mouseX > this.#lastX - 2 &&
      mouseY < this.#lastY + 2 &&
      mouseY > this.#lastY - 2
    ) {
      svgCanvas.textActions.toSelectMode(true)
    }
  }

  /**
   * @param {Integer} index
   * @returns {void}
   */
  setCursor (index) {
    this.#setCursor(index)
  }

  /**
   * @param {Float} x
   * @param {Float} y
   * @returns {void}
   */
  toEditMode (x, y) {
    this.#allowDbl = false
    svgCanvas.setCurrentMode('textedit')
    svgCanvas.selectorManager.requestSelector(this.#curtext).showGrips(false)
    // Make selector group accept clicks
    /* const selector = */ svgCanvas.selectorManager.requestSelector(this.#curtext) // Do we need this? Has side effect of setting lock, so keeping for now, but next line wasn't being used
    // const sel = selector.selectorRect;

    svgCanvas.textActions.init()

    this.#curtext.style.cursor = 'text'

    // if (supportsEditableText()) {
    //   curtext.setAttribute('editable', 'simple');
    //   return;
    // }

    if (arguments.length === 0) {
      this.#setCursor()
    } else {
      const pt = this.#screenToPt(x, y)
      this.#setCursorFromPoint(pt.x, pt.y)
    }

    setTimeout(() => {
      this.#allowDbl = true
    }, 300)
  }

  /**
   * @param {boolean|Element} selectElem
   * @fires module:svgcanvas.SvgCanvas#event:selected
   * @returns {void}
   */
  toSelectMode (selectElem) {
    svgCanvas.setCurrentMode('select')
    clearInterval(this.#blinker)
    this.#blinker = null
    if (this.#selblock) {
      this.#selblock.setAttribute('display', 'none')
    }
    if (this.#cursor) {
      this.#cursor.setAttribute('visibility', 'hidden')
    }
    this.#curtext.style.cursor = 'move'

    if (selectElem) {
      svgCanvas.clearSelection()
      this.#curtext.style.cursor = 'move'

      svgCanvas.call('selected', [this.#curtext])
      svgCanvas.addToSelection([this.#curtext], true)
    }
    if (!getTextElementContent(this.#curtext)?.length) {
      // No content, so delete
      svgCanvas.deleteSelectedElements()
    }

    this.#textinput.blur()

    this.#curtext = false

    // if (supportsEditableText()) {
    //   curtext.removeAttribute('editable');
    // }
  }

  /**
   * @returns {{ start: number, end: number }|null}
   */
  getInputSelection () {
    if (this.#textinput && document.activeElement === this.#textinput) {
      this.#rememberSelection()
    }
    if (!this.#savedSel) return null
    return { start: this.#savedSel.start, end: this.#savedSel.end }
  }

  /**
   * @param {number} start
   * @param {number} end
   * @returns {void}
   */
  setInputSelection (start, end) {
    if (!this.#textinput) return
    this.#savedSel = { start, end }
    this.#textinput.focus()
    this.#textinput.setSelectionRange(start, end)
    this.#setSelection(start, end, true)
  }

  /**
   * Call from input/select/keyup on the proxy textarea.
   * @returns {void}
   */
  rememberInputSelection () {
    this.#rememberSelection()
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  setInputElem (elem) {
    this.#textinput = elem
  }

  /**
   * @returns {void}
   */
  clear () {
    if (svgCanvas.getCurrentMode() === 'textedit') {
      svgCanvas.textActions.toSelectMode()
    }
  }

  /**
   * @param {Element} _inputElem Not in use
   * @returns {void}
   */
  init (_inputElem) {
    if (!this.#curtext) {
      return
    }
    let end
    // if (supportsEditableText()) {
    //   curtext.select();
    //   return;
    // }

    if (!this.#curtext.parentNode) {
      // Result of the ffClone, need to get correct element
      const selectedElements = svgCanvas.getSelectedElements()
      this.#curtext = selectedElements[0]
      svgCanvas.selectorManager.requestSelector(this.#curtext).showGrips(false)
    }

    const str = getTextElementContent(this.#curtext)
    const len = str.length

    this.#textbb = utilsGetBBox(this.#curtext)

    // Calculate accumulated transform matrix including all parent groups
    // This fixes the issue where text cursor appears in wrong position
    // when editing text inside a group with transforms
    this.#matrix = this.#getAccumulatedMatrix(this.#curtext)

    this.#chardata = []
    this.#chardata.length = len
    if (this.#textinput && this.#textinput.value !== str) {
      this.#textinput.value = str
    }
    this.#textinput.focus()

    this.#curtext.removeEventListener('dblclick', this.#selectWord)
    this.#curtext.addEventListener('dblclick', this.#selectWord)

    const zoomFix = (bb) => {
      if (!supportsGoodTextCharPos()) {
        const zoom = svgCanvas.getZoom()
        const offset = svgCanvas.contentW * zoom
        return {
          x: (bb.x - offset) / zoom,
          y: bb.y / zoom,
          width: bb.width / zoom,
          height: bb.height / zoom
        }
      }
      return bb
    }

    const extentAt = (svgIndex) => {
      try {
        const extent = this.#curtext.getExtentOfChar(svgIndex)
        return zoomFix({
          x: extent.x,
          y: extent.y,
          width: extent.width,
          height: extent.height
        })
      } catch (e) {
        return zoomFix({
          x: this.#textbb.x + this.#textbb.width / 2,
          y: this.#textbb.y,
          width: 0,
          height: this.#textbb.height
        })
      }
    }

    if (!len) {
      end = {
        x: this.#textbb.x + this.#textbb.width / 2,
        y: this.#textbb.y,
        width: 0,
        height: this.#textbb.height
      }
    } else {
      // Map logical string (with \n) to SVG glyph indices (tspans; empty lines use nbsp).
      const lines = str.split('\n')
      let logicalIdx = 0
      let svgIdx = 0
      lines.forEach((line, lineIndex) => {
        let lineExt = null
        if (line.length === 0) {
          lineExt = extentAt(svgIdx++)
        } else {
          for (let c = 0; c < line.length; c++) {
            const bb = extentAt(svgIdx++)
            this.#chardata[logicalIdx++] = bb
            end = bb
            if (c === 0) lineExt = bb
          }
        }
        if (lineIndex < lines.length - 1) {
          // Virtual newline glyph for textarea `\n` index alignment
          if (line.length === 0 && lineExt) {
            this.#chardata[logicalIdx++] = {
              x: lineExt.x,
              y: lineExt.y,
              width: 0,
              height: lineExt.height
            }
            end = this.#chardata[logicalIdx - 1]
          } else {
            const prev = this.#chardata[logicalIdx - 1] || lineExt
            this.#chardata[logicalIdx++] = {
              x: (prev?.x ?? this.#textbb.x) + (prev?.width ?? 0),
              y: prev?.y ?? this.#textbb.y,
              width: 0,
              height: prev?.height ?? this.#textbb.height
            }
            end = this.#chardata[logicalIdx - 1]
          }
        } else if (line.length === 0 && lineExt) {
          // Trailing empty line: end cursor sits on that line
          end = {
            x: lineExt.x,
            y: lineExt.y,
            width: 0,
            height: lineExt.height
          }
        }
      })
    }

    // Add a last bbox for cursor at end of text
    this.#chardata.push({
      x: end.x + (end.width || 0),
      y: end.y ?? this.#textbb.y,
      width: 0,
      height: end.height ?? this.#textbb.height
    })
    this.#setSelection(this.#textinput.selectionStart, this.#textinput.selectionEnd, true)
  }
}

// Export singleton instance for backward compatibility
export const textActionsMethod = new TextActions()
