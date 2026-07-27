/**
 * @file ext-curvedarrow.js
 * Curved arrow tool — drag start→end (tldraw / Steve Ruiz feel).
 * Arc through three points; arrowhead drawn as geometry (not SVG markers),
 * so it cannot be stripped by ext-markers.
 * @license MIT
 */

import {
  defaultBend,
  getCurvedArrowGeometry,
  getMidPointFromBend
} from './arc-math.js'

const name = 'curvedarrow'
const MODE = 'curvedarrow'

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    console.warn(`Missing translation (${lang}) for ${name} - using 'en'`)
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

/**
 * @param {Element|null} el
 * @returns {Element|null}
 */
const findArrowGroup = (el) => {
  let cur = el
  while (cur && cur !== cur.ownerSVGElement) {
    if (cur.getAttribute?.('shape') === 'curvedarrow') return cur
    cur = cur.parentNode
  }
  return null
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    let started = false
    /** @type {SVGGElement|null} */
    let newFO = null
    let selectingArrow = false
    /** @type {Element[]|undefined} */
    let selElems

    await loadExtensionTranslation(svgEditor)

    /**
     * Rebuild shaft + head inside the arrow group.
     * @param {SVGGElement} group
     * @param {{x:number,y:number}} a
     * @param {{x:number,y:number}} b
     * @param {{x:number,y:number}} c
     * @returns {{ length: number }}
     */
    const regenerateArrow = (group, a, b, c) => {
      const stroke = group.getAttribute('stroke') || '#000000'
      const strokeWidth = Number(group.getAttribute('stroke-width') || 2)
      const geom = getCurvedArrowGeometry(a, b, c, strokeWidth)

      group.setAttribute('data-ax', String(a.x))
      group.setAttribute('data-ay', String(a.y))
      group.setAttribute('data-bx', String(b.x))
      group.setAttribute('data-by', String(b.y))
      group.setAttribute('data-cx', String(c.x))
      group.setAttribute('data-cy', String(c.y))
      group.setAttribute('data-bend', String(
        // signed distance of B from chord midpoint along normal
        (() => {
          const mx = (a.x + c.x) / 2
          const my = (a.y + c.y) / 2
          const dx = c.x - a.x
          const dy = c.y - a.y
          const len = Math.hypot(dx, dy) || 1
          const nx = -dy / len
          const ny = dx / len
          return (b.x - mx) * nx + (b.y - my) * ny
        })()
      ))

      while (group.firstChild) {
        group.firstChild.remove()
      }

      if (geom.length < 0.5) {
        return { length: 0 }
      }

      const ns = group.namespaceURI
      const shaft = group.ownerDocument.createElementNS(ns, 'path')
      shaft.setAttribute('d', geom.shaftD)
      shaft.setAttribute('fill', 'none')
      shaft.setAttribute('stroke', stroke)
      shaft.setAttribute('stroke-width', String(strokeWidth))
      // butt cap avoids a round nose poking past the head base
      shaft.setAttribute('stroke-linecap', 'butt')
      shaft.setAttribute('stroke-linejoin', 'round')
      shaft.setAttribute('data-role', 'shaft')
      shaft.setAttribute('pointer-events', 'stroke')
      group.append(shaft)

      if (geom.headPoints) {
        const head = group.ownerDocument.createElementNS(ns, 'polygon')
        head.setAttribute('points', geom.headPoints)
        head.setAttribute('fill', stroke)
        head.setAttribute('stroke', 'none')
        head.setAttribute('data-role', 'head')
        head.setAttribute('pointer-events', 'all')
        group.append(head)
      }

      // No marker-* attrs — avoids conflict with ext-markers
      group.removeAttribute('marker-end')
      group.removeAttribute('marker-start')
      group.removeAttribute('marker-mid')

      return { length: geom.length }
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = `${name}:buttons.0.title`
        const buttonTemplate = `
          <se-button id="tool_curvedarrow" title="${title}" src="curvedarrow.svg"></se-button>
        `
        svgCanvas.insertChildAtIndex($id('tools_left'), buttonTemplate, 8)

        $click($id('tool_curvedarrow'), () => {
          if (this.leftPanel.updateLeftPanel('tool_curvedarrow')) {
            svgCanvas.setMode(MODE)
          }
        })
      },
      mouseDown (opts) {
        if (svgCanvas.getMode() !== MODE) {
          return undefined
        }

        const stroke = svgCanvas.getColor('stroke')
        const strokeWidth = svgCanvas.getStrokeWidth() || 2
        const strokeColor = stroke === 'none' ? '#000000' : stroke

        started = true
        const a = { x: opts.start_x, y: opts.start_y }
        newFO = svgCanvas.addSVGElementsFromJson({
          element: 'g',
          attr: {
            id: svgCanvas.getNextId(),
            shape: 'curvedarrow',
            fill: strokeColor,
            stroke: strokeColor,
            'stroke-width': strokeWidth,
            'data-ax': a.x,
            'data-ay': a.y,
            'data-bx': a.x,
            'data-by': a.y,
            'data-cx': a.x,
            'data-cy': a.y,
            style: 'pointer-events:visiblePainted'
          }
        })
        regenerateArrow(newFO, a, a, a)
        return { started: true }
      },
      mouseMove (opts) {
        if (!started || svgCanvas.getMode() !== MODE || !newFO) {
          return undefined
        }

        const zoom = svgCanvas.getZoom() || 1
        const a = {
          x: Number(newFO.getAttribute('data-ax')),
          y: Number(newFO.getAttribute('data-ay'))
        }
        // ext mouse_x/y are zoom-scaled; start_x is in SVG units
        const c = { x: opts.mouse_x / zoom, y: opts.mouse_y / zoom }
        const chord = Math.hypot(c.x - a.x, c.y - a.y)
        // Shift = straight arrow (bend 0), otherwise gentle arc through mid
        const bend = opts.event?.shiftKey ? 0 : defaultBend(chord)
        const b = getMidPointFromBend(a, c, bend)
        regenerateArrow(newFO, a, b, c)
        return undefined
      },
      mouseUp (opts) {
        if (svgCanvas.getMode() !== MODE || !newFO) {
          return undefined
        }

        const zoom = svgCanvas.getZoom() || 1
        const a = {
          x: Number(newFO.getAttribute('data-ax')),
          y: Number(newFO.getAttribute('data-ay'))
        }
        const c = {
          x: opts?.mouse_x != null ? opts.mouse_x / zoom : Number(newFO.getAttribute('data-cx')),
          y: opts?.mouse_y != null ? opts.mouse_y / zoom : Number(newFO.getAttribute('data-cy'))
        }
        const chord = Math.hypot(c.x - a.x, c.y - a.y)
        const bend = opts?.event?.shiftKey ? 0 : defaultBend(chord)
        const b = getMidPointFromBend(a, c, bend)
        const { length } = regenerateArrow(newFO, a, b, c)

        const keep = length > 4
        const element = newFO
        started = false
        newFO = null
        return { keep, element }
      },
      selectedChanged (opts) {
        if (selectingArrow) return
        selElems = opts.elems
        const el = selElems?.[0]
        if (!el) return
        const group = findArrowGroup(el)
        if (group && opts.selectedElement && !opts.multiselected && selElems[0] !== group) {
          selectingArrow = true
          svgCanvas.selectOnly([group], true)
          selectingArrow = false
        }
      },
      elementChanged (opts) {
        // Keep head fill in sync when stroke color changes on the group
        const el = opts.elems?.[0]
        const group = findArrowGroup(el)
        if (!group) return
        const stroke = group.getAttribute('stroke')
        if (!stroke) return
        group.setAttribute('fill', stroke)
        const head = group.querySelector('[data-role="head"]')
        const shaft = group.querySelector('[data-role="shaft"]')
        if (head) head.setAttribute('fill', stroke)
        if (shaft) shaft.setAttribute('stroke', stroke)
      }
    }
  }
}
