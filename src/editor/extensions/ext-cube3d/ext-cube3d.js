/**
 * @file ext-cube3d.js
 * Draw and edit a projected 3D cube with rotate/scale on X, Y, Z.
 * @license MIT
 */

import { computeCubeFaces, computeCubeWireframe, DEFAULT_PERSPECTIVE } from './cube-math.js'

const name = 'cube3d'

const DEFAULT_RX = 35
const DEFAULT_RY = -45
const DEFAULT_RZ = 0

/**
 * @param {Function} $id
 * @param {string} id
 * @param {number} fallback
 * @returns {number}
 */
const readPanelNum = ($id, id, fallback) => {
  const raw = $id(id)?.value
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

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
 * @param {Element} group
 * @returns {object}
 */
const readCubeAttrs = (group) => ({
  cx: Number(group.getAttribute('data-cx') || 0),
  cy: Number(group.getAttribute('data-cy') || 0),
  size: Number(group.getAttribute('data-size') || 0),
  rx: Number(group.getAttribute('data-rx') || DEFAULT_RX),
  ry: Number(group.getAttribute('data-ry') || DEFAULT_RY),
  rz: Number(group.getAttribute('data-rz') || DEFAULT_RZ),
  sx: Number(group.getAttribute('data-sx') || 1),
  sy: Number(group.getAttribute('data-sy') || 1),
  sz: Number(group.getAttribute('data-sz') || 1),
  perspective: Number(group.getAttribute('data-perspective') ?? DEFAULT_PERSPECTIVE),
  fill: group.getAttribute('fill') || '#cccccc',
  stroke: group.getAttribute('stroke') || '#000000',
  strokeWidth: Number(group.getAttribute('stroke-width') || 1)
})

/**
 * Rebuild face polygons inside the cube group.
 * @param {SVGElement} group
 * @param {object} [overrides]
 * @returns {void}
 */
export const regenerateCube = (group, overrides = {}) => {
  const attrs = { ...readCubeAttrs(group), ...overrides }
  Object.entries({
    'data-cx': attrs.cx,
    'data-cy': attrs.cy,
    'data-size': attrs.size,
    'data-rx': attrs.rx,
    'data-ry': attrs.ry,
    'data-rz': attrs.rz,
    'data-sx': attrs.sx,
    'data-sy': attrs.sy,
    'data-sz': attrs.sz,
    'data-perspective': attrs.perspective,
    fill: attrs.fill,
    stroke: attrs.stroke,
    'stroke-width': attrs.strokeWidth
  }).forEach(([k, v]) => group.setAttribute(k, v))

  while (group.firstChild) {
    group.firstChild.remove()
  }

  if (attrs.size <= 0) return

  const faces = computeCubeFaces(attrs)
  const edges = computeCubeWireframe(attrs)
  const ns = group.namespaceURI
  // Painter order: far faces first, near faces last (each face is one polygon).
  faces.forEach((face) => {
    const poly = group.ownerDocument.createElementNS(ns, 'polygon')
    poly.setAttribute('points', face.points)
    poly.setAttribute('fill', face.fill)
    poly.setAttribute('stroke', 'none')
    poly.setAttribute('data-face', String(face.faceIndex))
    poly.setAttribute('pointer-events', 'all')
    poly.setAttribute('shape-rendering', 'geometricPrecision')
    group.append(poly)
  })

  if (edges.length) {
    const d = edges.map((e) => `M${e.x1},${e.y1}L${e.x2},${e.y2}`).join(' ')
    const wire = group.ownerDocument.createElementNS(ns, 'path')
    wire.setAttribute('d', d)
    wire.setAttribute('fill', 'none')
    wire.setAttribute('stroke', attrs.stroke)
    wire.setAttribute('stroke-width', String(attrs.strokeWidth))
    wire.setAttribute('stroke-linejoin', 'round')
    wire.setAttribute('stroke-linecap', 'round')
    wire.setAttribute('data-role', 'wireframe')
    wire.setAttribute('pointer-events', 'none')
    group.append(wire)
  }
}

/**
 * @param {Element|null} el
 * @returns {Element|null}
 */
const findCubeGroup = (el) => {
  let cur = el
  while (cur && cur !== cur.ownerSVGElement) {
    if (cur.getAttribute?.('shape') === 'cube3d') return cur
    cur = cur.parentNode
  }
  return null
}

/**
 * @param {SVGElement} elem
 * @returns {{attrs: Record<string, string|null>}}
 */
const snapshotCube = (elem) => {
  const keys = [
    'data-cx', 'data-cy', 'data-size',
    'data-rx', 'data-ry', 'data-rz',
    'data-sx', 'data-sy', 'data-sz',
    'data-perspective',
    'fill', 'stroke', 'stroke-width'
  ]
  const attrs = {}
  keys.forEach((k) => { attrs[k] = elem.getAttribute(k) })
  return { attrs }
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { Command } = svgCanvas.history
    const addToHistory = (cmd) => { svgCanvas.undoMgr.addCommandToHistory(cmd) }
    const { $id, $click } = svgCanvas
    let selElems
    let started
    let newFO
    let selectingCube = false

    /**
     * History command that restores cube attributes and regenerates faces.
     */
    class CubeChangeCommand extends Command {
      /**
       * @param {SVGElement} elem
       * @param {object} oldSnapshot
       * @param {object} newSnapshot
       */
      constructor (elem, oldSnapshot, newSnapshot) {
        super()
        this.elem = elem
        this.oldSnapshot = oldSnapshot
        this.newSnapshot = newSnapshot
        this.text = 'Change 3D Cube'
      }

      /**
       * @param {object} snap
       * @returns {void}
       */
      restore (snap) {
        Object.entries(snap.attrs).forEach(([key, value]) => {
          if (value === null || value === undefined) {
            this.elem.removeAttribute(key)
          } else {
            this.elem.setAttribute(key, value)
          }
        })
        regenerateCube(this.elem)
      }

      /**
       * @param {module:history.HistoryEventHandler} handler
       * @returns {void}
       */
      apply (handler) {
        super.apply(handler, () => this.restore(this.newSnapshot))
      }

      /**
       * @param {module:history.HistoryEventHandler} handler
       * @returns {void}
       */
      unapply (handler) {
        super.unapply(handler, () => this.restore(this.oldSnapshot))
      }

      /**
       * @returns {Element[]}
       */
      elements () {
        return [this.elem]
      }
    }

    await loadExtensionTranslation(svgEditor)

    const showPanel = (on) => {
      const panel = $id('cube3d_panel')
      if (!panel) return
      if (on) {
        panel.style.removeProperty('display')
      } else {
        panel.style.display = 'none'
      }
    }

    const syncPanelFromElem = (elem) => {
      if (!elem) return
      const a = readCubeAttrs(elem)
      $id('cubeRotX').value = a.rx
      $id('cubeRotY').value = a.ry
      $id('cubeRotZ').value = a.rz
      $id('cubeScaleX').value = a.sx
      $id('cubeScaleY').value = a.sy
      $id('cubeScaleZ').value = a.sz
      $id('cubeSize').value = a.size
      $id('cubePerspective').value = a.perspective
    }

    const ATTR_MAP = {
      'data-rx': 'rx',
      'data-ry': 'ry',
      'data-rz': 'rz',
      'data-sx': 'sx',
      'data-sy': 'sy',
      'data-sz': 'sz',
      'data-size': 'size',
      'data-perspective': 'perspective'
    }

    const applyCubeAttr = (attr, val, { history = true, undoSnap = null } = {}) => {
      let i = selElems?.length || 0
      while (i--) {
        const elem = findCubeGroup(selElems[i])
        if (!elem) continue
        const oldSnapshot = undoSnap || snapshotCube(elem)
        const key = ATTR_MAP[attr]
        if (!key) continue
        regenerateCube(elem, { [key]: Number(val) })
        if (history) {
          const newSnapshot = snapshotCube(elem)
          addToHistory(new CubeChangeCommand(elem, oldSnapshot, newSnapshot))
          // Full panel refresh only when the drag ends — live `changed` makes X/Y
          // jump because the projected bbox drifts while perspective changes.
          svgCanvas.call('changed', [elem])
        } else {
          svgCanvas.selectorManager.requestSelector(elem)?.resize()
        }
      }
    }

    const openCubePanel = () => {
      showPanel(true)
      svgEditor.rightPanel?.switchTab('properties')
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = `${name}:buttons.0.title`
        const buttonTemplate = `
          <se-button id="tool_cube3d" title="${title}" src="cube3d.svg"></se-button>
        `
        svgCanvas.insertChildAtIndex($id('tools_left'), buttonTemplate, 11)

        $click($id('tool_cube3d'), () => {
          if (this.leftPanel.updateLeftPanel('tool_cube3d')) {
            svgCanvas.setMode('cube3d')
            openCubePanel()
          }
        })

        const labels = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
          label: `${name}:contextTools.${i}.label`,
          title: `${name}:contextTools.${i}.title`
        }))

        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="cube3d_panel" class="cube3d_panel right_panel_section" style="display:none">
            <div class="cube3d_panel_heading">${name}:panelTitle</div>
            <se-range-input id="cubeRotX" label="${labels[0].label}" min="-180" max="180" step="1" value="${DEFAULT_RX}" title="${labels[0].title}" decimals="0"></se-range-input>
            <se-range-input id="cubeRotY" label="${labels[1].label}" min="-180" max="180" step="1" value="${DEFAULT_RY}" title="${labels[1].title}" decimals="0"></se-range-input>
            <se-range-input id="cubeRotZ" label="${labels[2].label}" min="-180" max="180" step="1" value="${DEFAULT_RZ}" title="${labels[2].title}" decimals="0"></se-range-input>
            <se-range-input id="cubeScaleX" label="${labels[3].label}" min="0.1" max="10" step="0.1" value="1" title="${labels[3].title}" decimals="1"></se-range-input>
            <se-range-input id="cubeScaleY" label="${labels[4].label}" min="0.1" max="10" step="0.1" value="1" title="${labels[4].title}" decimals="1"></se-range-input>
            <se-range-input id="cubeScaleZ" label="${labels[5].label}" min="0.1" max="10" step="0.1" value="1" title="${labels[5].title}" decimals="1"></se-range-input>
            <se-range-input id="cubeSize" label="${labels[6].label}" min="1" max="800" step="1" value="50" title="${labels[6].title}" decimals="0"></se-range-input>
            <se-range-input id="cubePerspective" label="${labels[7].label}" min="0" max="100" step="1" value="${DEFAULT_PERSPECTIVE}" title="${labels[7].title}" decimals="0"></se-range-input>
          </div>
        `
        $id('right_properties_extensions').appendChild(panelTemplate.content.cloneNode(true))
        const heading = $id('cube3d_panel')?.querySelector('.cube3d_panel_heading')
        if (heading) {
          heading.textContent = svgEditor.i18next.t(`${name}:panelTitle`)
        }
        showPanel(false)

        const dragSnaps = new Map()
        const bindRange = (id, attr) => {
          const el = $id(id)
          if (!el) return
          el.addEventListener('mousedown', () => {
            const elem = findCubeGroup(selElems?.[0])
            if (elem) dragSnaps.set(id, snapshotCube(elem))
          })
          el.addEventListener('input', (event) => {
            applyCubeAttr(attr, event.target.value, { history: false })
          })
          el.addEventListener('change', (event) => {
            applyCubeAttr(attr, event.target.value, {
              history: true,
              undoSnap: dragSnaps.get(id)
            })
            dragSnaps.delete(id)
          })
        }
        bindRange('cubeRotX', 'data-rx')
        bindRange('cubeRotY', 'data-ry')
        bindRange('cubeRotZ', 'data-rz')
        bindRange('cubeScaleX', 'data-sx')
        bindRange('cubeScaleY', 'data-sy')
        bindRange('cubeScaleZ', 'data-sz')
        bindRange('cubeSize', 'data-size')
        bindRange('cubePerspective', 'data-perspective')
      },
      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'cube3d') {
          return undefined
        }
        const fill = svgCanvas.getColor('fill')
        const stroke = svgCanvas.getColor('stroke')
        const strokeWidth = svgCanvas.getStrokeWidth()
        started = true
        newFO = svgCanvas.addSVGElementsFromJson({
          element: 'g',
          attr: {
            id: svgCanvas.getNextId(),
            shape: 'cube3d',
            fill: fill === 'none' ? '#9ca3af' : fill,
            stroke,
            'stroke-width': strokeWidth,
            'data-cx': opts.start_x,
            'data-cy': opts.start_y,
            'data-size': 0,
            'data-rx': readPanelNum($id, 'cubeRotX', DEFAULT_RX),
            'data-ry': readPanelNum($id, 'cubeRotY', DEFAULT_RY),
            'data-rz': readPanelNum($id, 'cubeRotZ', DEFAULT_RZ),
            'data-sx': readPanelNum($id, 'cubeScaleX', 1),
            'data-sy': readPanelNum($id, 'cubeScaleY', 1),
            'data-sz': readPanelNum($id, 'cubeScaleZ', 1),
            'data-perspective': readPanelNum($id, 'cubePerspective', DEFAULT_PERSPECTIVE),
            style: 'pointer-events:visiblePainted'
          }
        })
        return { started: true }
      },
      mouseMove (opts) {
        if (!started || svgCanvas.getMode() !== 'cube3d' || !newFO) {
          return undefined
        }
        const cx = Number(newFO.getAttribute('data-cx'))
        const cy = Number(newFO.getAttribute('data-cy'))
        const dx = opts.mouse_x - cx
        const dy = opts.mouse_y - cy
        // size is the projected half-extent scale in SVG units
        const size = Math.max(Math.sqrt(dx * dx + dy * dy) / 1.15, 0)
        regenerateCube(newFO, {
          size,
          rx: readPanelNum($id, 'cubeRotX', DEFAULT_RX),
          ry: readPanelNum($id, 'cubeRotY', DEFAULT_RY),
          rz: readPanelNum($id, 'cubeRotZ', DEFAULT_RZ),
          sx: readPanelNum($id, 'cubeScaleX', 1),
          sy: readPanelNum($id, 'cubeScaleY', 1),
          sz: readPanelNum($id, 'cubeScaleZ', 1),
          perspective: readPanelNum($id, 'cubePerspective', DEFAULT_PERSPECTIVE)
        })
        return { started: true }
      },
      mouseUp () {
        if (svgCanvas.getMode() !== 'cube3d' || !newFO) {
          return undefined
        }
        const size = Number(newFO.getAttribute('data-size') || 0)
        const keep = size > 2
        started = false
        return {
          keep,
          element: newFO
        }
      },
      selectedChanged (opts) {
        if (selectingCube) return
        selElems = opts.elems
        const i = selElems?.length || 0
        if (!i) {
          showPanel(false)
          return
        }
        const cube = findCubeGroup(selElems[0])
        if (cube && opts.selectedElement && !opts.multiselected) {
          // Prefer selecting the group itself when a face was clicked
          if (selElems[0] !== cube) {
            selectingCube = true
            svgCanvas.selectOnly([cube], true)
            selectingCube = false
            selElems = [cube]
          }
          syncPanelFromElem(cube)
          openCubePanel()
        } else if (svgCanvas.getMode() !== 'cube3d') {
          showPanel(false)
        }
      }
    }
  }
}
