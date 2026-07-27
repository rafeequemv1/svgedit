/**
 * @file ext-lipidbilayer.js
 * Drag to draw a procedural lipid bilayer cross-section.
 * @license MIT
 */

import { computeBilayerGeometry, DEFAULTS } from './bilayer-math.js'

const name = 'lipidbilayer'

const ATTR_KEYS = [
  'data-x1', 'data-y1', 'data-x2', 'data-y2',
  'data-spacing', 'data-head-radius', 'data-tail-length', 'data-bilayer-gap',
  'data-tail-spread', 'data-waviness', 'data-waviness-freq', 'data-curvature',
  'fill', 'stroke', 'stroke-width', 'data-head-fill', 'data-membrane-fill'
]

const ATTR_MAP = {
  'data-spacing': 'spacing',
  'data-head-radius': 'headRadius',
  'data-tail-length': 'tailLength',
  'data-bilayer-gap': 'bilayerGap',
  'data-tail-spread': 'tailSpread',
  'data-waviness': 'waviness',
  'data-waviness-freq': 'wavinessFreq',
  'data-curvature': 'curvature'
}

const PANEL_IDS = [
  ['bilayerSpacing', 'data-spacing'],
  ['bilayerHeadRadius', 'data-head-radius'],
  ['bilayerTailLength', 'data-tail-length'],
  ['bilayerGap', 'data-bilayer-gap'],
  ['bilayerTailSpread', 'data-tail-spread'],
  ['bilayerWaviness', 'data-waviness'],
  ['bilayerWavinessFreq', 'data-waviness-freq'],
  ['bilayerCurvature', 'data-curvature']
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
const readBilayerAttrs = (group) => ({
  x1: Number(group.getAttribute('data-x1') || 0),
  y1: Number(group.getAttribute('data-y1') || 0),
  x2: Number(group.getAttribute('data-x2') || 0),
  y2: Number(group.getAttribute('data-y2') || 0),
  spacing: Number(group.getAttribute('data-spacing') || DEFAULTS.spacing),
  headRadius: Number(group.getAttribute('data-head-radius') || DEFAULTS.headRadius),
  tailLength: Number(group.getAttribute('data-tail-length') || DEFAULTS.tailLength),
  bilayerGap: Number(group.getAttribute('data-bilayer-gap') || DEFAULTS.bilayerGap),
  tailSpread: Number(group.getAttribute('data-tail-spread') || DEFAULTS.tailSpread),
  waviness: Number(group.getAttribute('data-waviness') || DEFAULTS.waviness),
  wavinessFreq: Number(group.getAttribute('data-waviness-freq') || DEFAULTS.wavinessFreq),
  curvature: Number(group.getAttribute('data-curvature') || DEFAULTS.curvature),
  headFill: group.getAttribute('data-head-fill') || group.getAttribute('fill') || '#e8a838',
  membraneFill: group.getAttribute('data-membrane-fill') || '#b8dce8',
  tailStroke: group.getAttribute('stroke') || '#555555',
  tailStrokeWidth: Number(group.getAttribute('stroke-width') || 1.2)
})

/**
 * @param {SVGElement} group
 * @param {object} [overrides]
 * @returns {void}
 */
export const regenerateBilayer = (group, overrides = {}) => {
  const attrs = { ...readBilayerAttrs(group), ...overrides }
  Object.entries({
    'data-x1': attrs.x1,
    'data-y1': attrs.y1,
    'data-x2': attrs.x2,
    'data-y2': attrs.y2,
    'data-spacing': attrs.spacing,
    'data-head-radius': attrs.headRadius,
    'data-tail-length': attrs.tailLength,
    'data-bilayer-gap': attrs.bilayerGap,
    'data-tail-spread': attrs.tailSpread,
    'data-waviness': attrs.waviness,
    'data-waviness-freq': attrs.wavinessFreq,
    'data-curvature': attrs.curvature,
    'data-head-fill': attrs.headFill,
    'data-membrane-fill': attrs.membraneFill,
    stroke: attrs.tailStroke,
    'stroke-width': attrs.tailStrokeWidth
  }).forEach(([k, v]) => group.setAttribute(k, v))

  while (group.firstChild) {
    group.firstChild.remove()
  }

  const { sites, membranePoints } = computeBilayerGeometry(attrs)
  if (!sites.length) return

  const ns = group.namespaceURI

  if (membranePoints) {
    const membrane = group.ownerDocument.createElementNS(ns, 'polygon')
    membrane.setAttribute('points', membranePoints)
    membrane.setAttribute('fill', attrs.membraneFill)
    membrane.setAttribute('stroke', 'none')
    membrane.setAttribute('data-role', 'membrane')
    // Hit target for select/move (heads/tails are visual-only)
    membrane.setAttribute('pointer-events', 'all')
    membrane.setAttribute('opacity', '0.55')
    group.append(membrane)
  }

  sites.forEach((site, index) => {
    site.upperTails.concat(site.lowerTails).forEach((tail, ti) => {
      const line = group.ownerDocument.createElementNS(ns, 'line')
      line.setAttribute('x1', tail.x1)
      line.setAttribute('y1', tail.y1)
      line.setAttribute('x2', tail.x2)
      line.setAttribute('y2', tail.y2)
      line.setAttribute('stroke', attrs.tailStroke)
      line.setAttribute('stroke-width', String(attrs.tailStrokeWidth))
      line.setAttribute('stroke-linecap', 'round')
      line.setAttribute('data-role', 'tail')
      line.setAttribute('data-lipid', String(index))
      line.setAttribute('data-tail', String(ti))
      line.setAttribute('pointer-events', 'none')
      group.append(line)
    })

    ;[
      { head: site.upperHead, role: 'upper-head' },
      { head: site.lowerHead, role: 'lower-head' }
    ].forEach(({ head, role }) => {
      const circle = group.ownerDocument.createElementNS(ns, 'circle')
      circle.setAttribute('cx', head.x)
      circle.setAttribute('cy', head.y)
      circle.setAttribute('r', head.r)
      circle.setAttribute('fill', attrs.headFill)
      circle.setAttribute('stroke', attrs.tailStroke)
      circle.setAttribute('stroke-width', String(Math.max(0.5, attrs.tailStrokeWidth * 0.6)))
      circle.setAttribute('data-role', role)
      circle.setAttribute('data-lipid', String(index))
      circle.setAttribute('pointer-events', 'none')
      group.append(circle)
    })
  })
}

/**
 * @param {Element|null} el
 * @returns {Element|null}
 */
const findBilayerGroup = (el) => {
  let cur = el
  while (cur && cur !== cur.ownerSVGElement) {
    if (cur.getAttribute?.('shape') === 'lipidbilayer') return cur
    cur = cur.parentNode
  }
  return null
}

/**
 * @param {SVGElement} elem
 * @returns {{attrs: Record<string, string|null>}}
 */
const snapshotBilayer = (elem) => {
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
    let selectingBilayer = false

    class BilayerChangeCommand extends Command {
      constructor (elem, oldSnapshot, newSnapshot) {
        super()
        this.elem = elem
        this.oldSnapshot = oldSnapshot
        this.newSnapshot = newSnapshot
        this.text = 'Change Lipid Bilayer'
      }

      restore (snap) {
        Object.entries(snap.attrs).forEach(([key, value]) => {
          if (value === null || value === undefined) {
            this.elem.removeAttribute(key)
          } else {
            this.elem.setAttribute(key, value)
          }
        })
        regenerateBilayer(this.elem)
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
      const panel = $id('lipidbilayer_panel')
      if (!panel) return
      if (on) {
        panel.style.removeProperty('display')
      } else {
        panel.style.display = 'none'
      }
    }

    const syncPanelFromElem = (elem) => {
      if (!elem) return
      const a = readBilayerAttrs(elem)
      $id('bilayerSpacing').value = a.spacing
      $id('bilayerHeadRadius').value = a.headRadius
      $id('bilayerTailLength').value = a.tailLength
      $id('bilayerGap').value = a.bilayerGap
      $id('bilayerTailSpread').value = a.tailSpread
      $id('bilayerWaviness').value = a.waviness
      $id('bilayerWavinessFreq').value = a.wavinessFreq
      $id('bilayerCurvature').value = a.curvature
    }

    const readPanelParams = () => ({
      spacing: readPanelNum($id, 'bilayerSpacing', DEFAULTS.spacing),
      headRadius: readPanelNum($id, 'bilayerHeadRadius', DEFAULTS.headRadius),
      tailLength: readPanelNum($id, 'bilayerTailLength', DEFAULTS.tailLength),
      bilayerGap: readPanelNum($id, 'bilayerGap', DEFAULTS.bilayerGap),
      tailSpread: readPanelNum($id, 'bilayerTailSpread', DEFAULTS.tailSpread),
      waviness: readPanelNum($id, 'bilayerWaviness', DEFAULTS.waviness),
      wavinessFreq: readPanelNum($id, 'bilayerWavinessFreq', DEFAULTS.wavinessFreq),
      curvature: readPanelNum($id, 'bilayerCurvature', DEFAULTS.curvature)
    })

    const applyBilayerAttr = (attr, val, { history = true, undoSnap = null } = {}) => {
      let i = selElems?.length || 0
      while (i--) {
        const elem = findBilayerGroup(selElems[i])
        if (!elem) continue
        const oldSnapshot = undoSnap || snapshotBilayer(elem)
        const key = ATTR_MAP[attr]
        if (!key) continue
        regenerateBilayer(elem, { [key]: Number(val) })
        if (history) {
          addToHistory(new BilayerChangeCommand(elem, oldSnapshot, snapshotBilayer(elem)))
        }
        svgCanvas.call('changed', [elem])
      }
    }

    const openBilayerPanel = () => {
      showPanel(true)
      svgEditor.rightPanel?.switchTab('properties')
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex($id('tools_left'), `
          <se-button id="tool_lipidbilayer" title="${title}" src="lipidbilayer.svg"></se-button>
        `, 12)

        $click($id('tool_lipidbilayer'), () => {
          if (this.leftPanel.updateLeftPanel('tool_lipidbilayer')) {
            svgCanvas.setMode('lipidbilayer')
            openBilayerPanel()
          }
        })

        const labels = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
          label: `${name}:contextTools.${i}.label`,
          title: `${name}:contextTools.${i}.title`
        }))

        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="lipidbilayer_panel" class="bilayer_panel extension_panel right_panel_section" style="display:none">
            <div class="extension_panel_heading">${name}:panelTitle</div>
            <se-range-input id="bilayerSpacing" label="${labels[0].label}" min="10" max="60" step="1" value="${DEFAULTS.spacing}" title="${labels[0].title}" decimals="0"></se-range-input>
            <se-range-input id="bilayerHeadRadius" label="${labels[1].label}" min="2" max="16" step="0.5" value="${DEFAULTS.headRadius}" title="${labels[1].title}" decimals="1"></se-range-input>
            <se-range-input id="bilayerTailLength" label="${labels[2].label}" min="4" max="40" step="1" value="${DEFAULTS.tailLength}" title="${labels[2].title}" decimals="0"></se-range-input>
            <se-range-input id="bilayerGap" label="${labels[3].label}" min="0" max="20" step="0.5" value="${DEFAULTS.bilayerGap}" title="${labels[3].title}" decimals="1"></se-range-input>
            <se-range-input id="bilayerTailSpread" label="${labels[4].label}" min="5" max="70" step="1" value="${DEFAULTS.tailSpread}" title="${labels[4].title}" decimals="0"></se-range-input>
            <se-range-input id="bilayerWaviness" label="${labels[5].label}" min="0" max="20" step="0.5" value="${DEFAULTS.waviness}" title="${labels[5].title}" decimals="1"></se-range-input>
            <se-range-input id="bilayerWavinessFreq" label="${labels[6].label}" min="1" max="8" step="1" value="${DEFAULTS.wavinessFreq}" title="${labels[6].title}" decimals="0"></se-range-input>
            <se-range-input id="bilayerCurvature" label="${labels[7].label}" min="0" max="100" step="1" value="${DEFAULTS.curvature}" title="${labels[7].title}" decimals="0"></se-range-input>
          </div>
        `
        $id('right_properties_extensions').appendChild(panelTemplate.content.cloneNode(true))
        const heading = $id('lipidbilayer_panel')?.querySelector('.extension_panel_heading')
        if (heading) {
          heading.textContent = svgEditor.i18next.t(`${name}:panelTitle`)
        }
        showPanel(false)

        const dragSnaps = new Map()
        PANEL_IDS.forEach(([panelId, attr]) => {
          const el = $id(panelId)
          if (!el) return
          el.addEventListener('mousedown', () => {
            const elem = findBilayerGroup(selElems?.[0])
            if (elem) dragSnaps.set(panelId, snapshotBilayer(elem))
          })
          el.addEventListener('input', (event) => {
            applyBilayerAttr(attr, event.target.value, { history: false })
          })
          el.addEventListener('change', (event) => {
            applyBilayerAttr(attr, event.target.value, {
              history: true,
              undoSnap: dragSnaps.get(panelId)
            })
            dragSnaps.delete(panelId)
          })
        })
      },
      mouseDown (opts) {
        if (svgCanvas.getMode() !== 'lipidbilayer') {
          return undefined
        }
        const fill = svgCanvas.getColor('fill')
        const stroke = svgCanvas.getColor('stroke')
        const strokeWidth = svgCanvas.getStrokeWidth()
        const params = readPanelParams()
        started = true
        newFO = svgCanvas.addSVGElementsFromJson({
          element: 'g',
          attr: {
            id: svgCanvas.getNextId(),
            shape: 'lipidbilayer',
            fill: fill === 'none' ? '#e8a838' : fill,
            stroke: stroke === 'none' ? '#555555' : stroke,
            'stroke-width': strokeWidth,
            'data-x1': opts.start_x,
            'data-y1': opts.start_y,
            'data-x2': opts.start_x,
            'data-y2': opts.start_y,
            'data-spacing': params.spacing,
            'data-head-radius': params.headRadius,
            'data-tail-length': params.tailLength,
            'data-bilayer-gap': params.bilayerGap,
            'data-tail-spread': params.tailSpread,
            'data-waviness': params.waviness,
            'data-waviness-freq': params.wavinessFreq,
            'data-curvature': params.curvature,
            'data-head-fill': fill === 'none' ? '#e8a838' : fill,
            'data-membrane-fill': '#b8dce8',
            style: 'pointer-events:visiblePainted'
          }
        })
        regenerateBilayer(newFO)
        return { started: true }
      },
      mouseMove (opts) {
        if (!started || svgCanvas.getMode() !== 'lipidbilayer' || !newFO) {
          return undefined
        }
        regenerateBilayer(newFO, {
          x2: opts.mouse_x,
          y2: opts.mouse_y,
          ...readPanelParams()
        })
        return { started: true }
      },
      mouseUp () {
        if (svgCanvas.getMode() !== 'lipidbilayer' || !newFO) {
          return undefined
        }
        const x1 = Number(newFO.getAttribute('data-x1'))
        const y1 = Number(newFO.getAttribute('data-y1'))
        const x2 = Number(newFO.getAttribute('data-x2'))
        const y2 = Number(newFO.getAttribute('data-y2'))
        const keep = Math.hypot(x2 - x1, y2 - y1) > 12
        started = false
        return { keep, element: newFO }
      },
      selectedChanged (opts) {
        if (selectingBilayer) return
        selElems = opts.elems
        if (!selElems?.length) {
          showPanel(false)
          return
        }
        const bilayer = findBilayerGroup(selElems[0])
        if (bilayer && opts.selectedElement && !opts.multiselected) {
          // Upgrade older drawings that only hit-tested head circles
          bilayer.querySelectorAll('[data-role="membrane"]').forEach((el) => {
            el.setAttribute('pointer-events', 'all')
          })
          bilayer.querySelectorAll(
            '[data-role="tail"], [data-role="upper-head"], [data-role="lower-head"]'
          ).forEach((el) => {
            el.setAttribute('pointer-events', 'none')
          })
          if (selElems[0] !== bilayer) {
            selectingBilayer = true
            svgCanvas.selectOnly([bilayer], true)
            selectingBilayer = false
            selElems = [bilayer]
          }
          syncPanelFromElem(bilayer)
          openBilayerPanel()
        } else if (svgCanvas.getMode() !== 'lipidbilayer') {
          showPanel(false)
        }
      }
    }
  }
}
