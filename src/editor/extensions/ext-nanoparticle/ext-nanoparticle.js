/**
 * @file ext-nanoparticle.js
 * Drag to draw a circular lattice nanoparticle (yellow circles).
 * @license MIT
 */

import { computeNanoparticleGeometry, DEFAULTS } from './nanoparticle-math.js'

const name = 'nanoparticle'

const YELLOW = '#f9ba00'
const STROKE = '#c49200'

const ATTR_KEYS = [
  'data-cx', 'data-cy', 'data-radius',
  'data-spacing', 'data-particle-radius',
  'fill', 'stroke', 'stroke-width'
]

const ATTR_MAP = {
  'data-spacing': 'spacing',
  'data-particle-radius': 'particleRadius'
}

const PANEL_IDS = [
  ['nanoSpacing', 'data-spacing'],
  ['nanoParticleRadius', 'data-particle-radius']
]

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
const readNanoAttrs = (group) => ({
  cx: Number(group.getAttribute('data-cx') || 0),
  cy: Number(group.getAttribute('data-cy') || 0),
  radius: Number(group.getAttribute('data-radius') || 0),
  spacing: Number(group.getAttribute('data-spacing') || DEFAULTS.spacing),
  particleRadius: Number(group.getAttribute('data-particle-radius') || DEFAULTS.particleRadius),
  fill: group.getAttribute('fill') || YELLOW,
  stroke: group.getAttribute('stroke') || STROKE,
  strokeWidth: Number(group.getAttribute('stroke-width') || 0.8)
})

/**
 * @param {SVGElement} group
 * @param {object} [overrides]
 * @returns {void}
 */
const regenerateNanoparticle = (group, overrides = {}) => {
  const attrs = { ...readNanoAttrs(group), ...overrides }
  Object.entries({
    'data-cx': attrs.cx,
    'data-cy': attrs.cy,
    'data-radius': attrs.radius,
    'data-spacing': attrs.spacing,
    'data-particle-radius': attrs.particleRadius,
    fill: attrs.fill,
    stroke: attrs.stroke,
    'stroke-width': attrs.strokeWidth
  }).forEach(([k, v]) => group.setAttribute(k, v))

  while (group.firstChild) {
    group.firstChild.remove()
  }

  const { sites, outerR } = computeNanoparticleGeometry(attrs)
  if (!sites.length || outerR <= 0) return

  const ns = group.namespaceURI
  const doc = group.ownerDocument

  const shell = doc.createElementNS(ns, 'circle')
  shell.setAttribute('cx', attrs.cx)
  shell.setAttribute('cy', attrs.cy)
  shell.setAttribute('r', outerR)
  shell.setAttribute('fill', attrs.fill)
  shell.setAttribute('fill-opacity', '0.12')
  shell.setAttribute('stroke', attrs.stroke)
  shell.setAttribute('stroke-width', String(Math.max(0.6, attrs.strokeWidth)))
  shell.setAttribute('stroke-dasharray', '3 2')
  shell.setAttribute('data-role', 'shell')
  shell.setAttribute('pointer-events', 'all')
  group.append(shell)

  sites.forEach((site, index) => {
    const circle = doc.createElementNS(ns, 'circle')
    circle.setAttribute('cx', site.x)
    circle.setAttribute('cy', site.y)
    circle.setAttribute('r', site.r)
    circle.setAttribute('fill', attrs.fill)
    circle.setAttribute('stroke', attrs.stroke)
    circle.setAttribute('stroke-width', String(Math.max(0.4, attrs.strokeWidth * 0.75)))
    circle.setAttribute('data-role', 'particle')
    circle.setAttribute('data-index', String(index))
    circle.setAttribute('pointer-events', 'none')
    group.append(circle)
  })
}

/**
 * @param {Element|null} el
 * @returns {Element|null}
 */
const findNanoGroup = (el) => {
  let cur = el
  while (cur && cur !== cur.ownerSVGElement) {
    if (cur.getAttribute?.('shape') === 'nanoparticle') return cur
    cur = cur.parentNode
  }
  return null
}

/**
 * @param {SVGElement} elem
 * @returns {{attrs: Record<string, string|null>}}
 */
const snapshotNano = (elem) => {
  const attrs = {}
  ATTR_KEYS.forEach((k) => { attrs[k] = elem.getAttribute(k) })
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
    let selectingNano = false

    class NanoChangeCommand extends Command {
      constructor (elem, oldSnapshot, newSnapshot) {
        super()
        this.elem = elem
        this.oldSnapshot = oldSnapshot
        this.newSnapshot = newSnapshot
        this.text = 'Change Nanoparticle'
      }

      restore (snap) {
        Object.entries(snap.attrs).forEach(([key, value]) => {
          if (value === null || value === undefined) {
            this.elem.removeAttribute(key)
          } else {
            this.elem.setAttribute(key, value)
          }
        })
        regenerateNanoparticle(this.elem)
      }

      apply (handler) {
        super.apply(handler, () => this.restore(this.newSnapshot))
      }

      unapply (handler) {
        super.unapply(handler, () => this.restore(this.oldSnapshot))
      }

      elements () {
        return [this.elem]
      }
    }

    await loadExtensionTranslation(svgEditor)

    const showPanel = (on) => {
      const panel = $id('nanoparticle_panel')
      if (!panel) return
      if (on) {
        panel.style.removeProperty('display')
      } else {
        panel.style.display = 'none'
      }
    }

    const syncPanelFromElem = (elem) => {
      if (!elem) return
      const a = readNanoAttrs(elem)
      $id('nanoSpacing').value = a.spacing
      $id('nanoParticleRadius').value = a.particleRadius
    }

    const readPanelParams = () => ({
      spacing: readPanelNum($id, 'nanoSpacing', DEFAULTS.spacing),
      particleRadius: readPanelNum($id, 'nanoParticleRadius', DEFAULTS.particleRadius)
    })

    const applyNanoAttr = (attr, val, { history = true, undoSnap = null } = {}) => {
      let i = selElems?.length || 0
      while (i--) {
        const elem = findNanoGroup(selElems[i])
        if (!elem) continue
        const oldSnapshot = undoSnap || snapshotNano(elem)
        const key = ATTR_MAP[attr]
        if (!key) continue
        regenerateNanoparticle(elem, { [key]: Number(val) })
        if (history) {
          addToHistory(new NanoChangeCommand(elem, oldSnapshot, snapshotNano(elem)))
        }
        svgCanvas.call('changed', [elem])
      }
    }

    const openNanoPanel = () => {
      showPanel(true)
      svgEditor.rightPanel?.switchTab('properties')
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex($id('tools_left'), `
          <se-button id="tool_nanoparticle" title="${title}" src="nanoparticle.svg"></se-button>
        `, 13)

        $click($id('tool_nanoparticle'), () => {
          if (this.leftPanel.updateLeftPanel('tool_nanoparticle')) {
            svgCanvas.setMode('nanoparticle')
            openNanoPanel()
          }
        })

        const labels = [0, 1].map((i) => ({
          label: `${name}:contextTools.${i}.label`,
          title: `${name}:contextTools.${i}.title`
        }))

        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="nanoparticle_panel" class="nanoparticle_panel extension_panel right_panel_section" style="display:none">
            <div class="extension_panel_heading">${name}:panelTitle</div>
            <se-range-input id="nanoSpacing" label="${labels[0].label}" min="6" max="40" step="1" value="${DEFAULTS.spacing}" title="${labels[0].title}" decimals="0"></se-range-input>
            <se-range-input id="nanoParticleRadius" label="${labels[1].label}" min="2" max="16" step="0.5" value="${DEFAULTS.particleRadius}" title="${labels[1].title}" decimals="1"></se-range-input>
          </div>
        `
        $id('right_properties_extensions').appendChild(panelTemplate.content.cloneNode(true))
        const heading = $id('nanoparticle_panel')?.querySelector('.extension_panel_heading')
        if (heading) {
          heading.textContent = svgEditor.i18next.t(`${name}:panelTitle`)
        }
        showPanel(false)

        const dragSnaps = new Map()
        PANEL_IDS.forEach(([panelId, attr]) => {
          const el = $id(panelId)
          if (!el) return
          el.addEventListener('mousedown', () => {
            const elem = findNanoGroup(selElems?.[0])
            if (elem) dragSnaps.set(panelId, snapshotNano(elem))
          })
          el.addEventListener('input', (event) => {
            applyNanoAttr(attr, event.target.value, { history: false })
          })
          el.addEventListener('change', (event) => {
            applyNanoAttr(attr, event.target.value, {
              history: true,
              undoSnap: dragSnaps.get(panelId)
            })
            dragSnaps.delete(panelId)
          })
        })
      },
      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'nanoparticle') {
          return undefined
        }
        const params = readPanelParams()
        started = true
        newFO = svgCanvas.addSVGElementsFromJson({
          element: 'g',
          attr: {
            id: svgCanvas.getNextId(),
            shape: 'nanoparticle',
            fill: YELLOW,
            stroke: STROKE,
            'stroke-width': 0.8,
            'data-cx': opts.start_x,
            'data-cy': opts.start_y,
            'data-radius': 0,
            'data-spacing': params.spacing,
            'data-particle-radius': params.particleRadius,
            style: 'pointer-events:visiblePainted'
          }
        })
        regenerateNanoparticle(newFO)
        return { started: true }
      },
      mouseMove (opts) {
        if (!started || svgCanvas.getMode() !== 'nanoparticle' || !newFO) {
          return undefined
        }
        const cx = Number(newFO.getAttribute('data-cx'))
        const cy = Number(newFO.getAttribute('data-cy'))
        const radius = Math.hypot(opts.mouse_x - cx, opts.mouse_y - cy)
        regenerateNanoparticle(newFO, {
          radius,
          ...readPanelParams()
        })
        return { started: true }
      },
      mouseUp () {
        if (svgCanvas.getMode() !== 'nanoparticle' || !newFO) {
          return undefined
        }
        const radius = Number(newFO.getAttribute('data-radius'))
        const keep = radius > 10
        started = false
        return { keep, element: newFO }
      },
      selectedChanged (opts) {
        if (selectingNano) return
        selElems = opts.elems
        if (!selElems?.length) {
          showPanel(false)
          return
        }
        const nano = findNanoGroup(selElems[0])
        if (nano && opts.selectedElement && !opts.multiselected) {
          if (selElems[0] !== nano) {
            selectingNano = true
            svgCanvas.selectOnly([nano], true)
            selectingNano = false
            selElems = [nano]
          }
          syncPanelFromElem(nano)
          openNanoPanel()
        } else if (svgCanvas.getMode() !== 'nanoparticle') {
          showPanel(false)
        }
      }
    }
  }
}
