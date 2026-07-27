/**
 * @file ext-hydrogel.js
 * Drag to draw a LabCanvas-style hydrogel polymer network.
 * Geometry ported from labcanvas/2d-editor/generators/hydrogel.
 * @license MIT
 */

import { DEFAULTS, batchHydrogelGeometry, generateHydrogelGeometry } from './hydrogel-math.js'

const name = 'hydrogel'
const MODE = 'hydrogel'

const ATTR_KEYS = [
  'data-x', 'data-y', 'data-w', 'data-h', 'data-seed',
  'data-shape', 'data-density', 'data-chain-length',
  'data-polymer-color', 'data-polymer-thickness',
  'data-show-particles', 'data-particle-count', 'data-particle-radius', 'data-particle-color',
  'data-pore-size', 'data-network-type',
  'data-crosslink-density', 'data-crosslinker-radius', 'data-crosslinker-color',
  'data-swelling', 'data-payload-release'
]

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

/**
 * @param {string} hex
 * @param {number} [alpha=1]
 * @returns {string}
 */
const hexToRgba = (hex, alpha = 1) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return hex || 'rgba(0,0,0,1)'
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`
}

/**
 * @param {string} color
 * @returns {string}
 */
const colorToHex = (color) => {
  if (!color) return '#000000'
  if (color.startsWith('#')) return color.slice(0, 7)
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color)
  if (!m) return '#000000'
  return '#' + [m[1], m[2], m[3]]
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')
}

/**
 * @param {Element|null} el
 * @returns {Element|null}
 */
const findHydrogelGroup = (el) => {
  let cur = el
  while (cur && cur !== cur.ownerSVGElement) {
    if (cur.getAttribute?.('shape') === 'hydrogel') return cur
    cur = cur.parentNode
  }
  return null
}

/**
 * @param {Element} group
 * @returns {object}
 */
const readHydrogelAttrs = (group) => ({
  x: Number(group.getAttribute('data-x') || 0),
  y: Number(group.getAttribute('data-y') || 0),
  w: Number(group.getAttribute('data-w') || 0),
  h: Number(group.getAttribute('data-h') || 0),
  seed: Number(group.getAttribute('data-seed') || 1),
  hydrogelShape: group.getAttribute('data-shape') || DEFAULTS.hydrogelShape,
  density: Number(group.getAttribute('data-density') || DEFAULTS.density),
  chainLength: Number(group.getAttribute('data-chain-length') || DEFAULTS.chainLength),
  polymerColor: group.getAttribute('data-polymer-color') || DEFAULTS.polymerColor,
  polymerThickness: Number(group.getAttribute('data-polymer-thickness') || DEFAULTS.polymerThickness),
  showParticles: group.getAttribute('data-show-particles') === 'true',
  particleCount: Number(group.getAttribute('data-particle-count') || DEFAULTS.particleCount),
  particleRadius: Number(group.getAttribute('data-particle-radius') || DEFAULTS.particleRadius),
  particleColor: group.getAttribute('data-particle-color') || DEFAULTS.particleColor,
  poreSize: Number(group.getAttribute('data-pore-size') || DEFAULTS.poreSize),
  networkType: group.getAttribute('data-network-type') || DEFAULTS.networkType,
  crosslinkDensity: Number(group.getAttribute('data-crosslink-density') || DEFAULTS.crosslinkDensity),
  crosslinkerRadius: Number(group.getAttribute('data-crosslinker-radius') || DEFAULTS.crosslinkerRadius),
  crosslinkerColor: group.getAttribute('data-crosslinker-color') || DEFAULTS.crosslinkerColor,
  swelling: Number(group.getAttribute('data-swelling') || DEFAULTS.swelling),
  payloadRelease: Number(group.getAttribute('data-payload-release') || DEFAULTS.payloadRelease)
})

/**
 * @param {SVGElement} group
 * @param {object} [overrides]
 * @param {{ previewOnly?: boolean }} [flags]
 * @returns {void}
 */
export const regenerateHydrogel = (group, overrides = {}, flags = {}) => {
  const attrs = { ...readHydrogelAttrs(group), ...overrides }

  Object.entries({
    'data-x': attrs.x,
    'data-y': attrs.y,
    'data-w': attrs.w,
    'data-h': attrs.h,
    'data-seed': attrs.seed,
    'data-shape': attrs.hydrogelShape,
    'data-density': attrs.density,
    'data-chain-length': attrs.chainLength,
    'data-polymer-color': attrs.polymerColor,
    'data-polymer-thickness': attrs.polymerThickness,
    'data-show-particles': attrs.showParticles ? 'true' : 'false',
    'data-particle-count': attrs.particleCount,
    'data-particle-radius': attrs.particleRadius,
    'data-particle-color': attrs.particleColor,
    'data-pore-size': attrs.poreSize,
    'data-network-type': attrs.networkType,
    'data-crosslink-density': attrs.crosslinkDensity,
    'data-crosslinker-radius': attrs.crosslinkerRadius,
    'data-crosslinker-color': attrs.crosslinkerColor,
    'data-swelling': attrs.swelling,
    'data-payload-release': attrs.payloadRelease
  }).forEach(([k, v]) => group.setAttribute(k, v))

  while (group.firstChild) {
    group.firstChild.remove()
  }

  const ns = group.namespaceURI
  const doc = group.ownerDocument

  // Drag preview: outline only (LabCanvas draws rect until mouse up)
  if (flags.previewOnly || attrs.w < 50 || attrs.h < 50) {
    if (attrs.hydrogelShape === 'circle') {
      const r = Math.min(attrs.w, attrs.h) / 2
      const circ = doc.createElementNS(ns, 'ellipse')
      circ.setAttribute('cx', attrs.x + attrs.w / 2)
      circ.setAttribute('cy', attrs.y + attrs.h / 2)
      circ.setAttribute('rx', Math.max(0, r))
      circ.setAttribute('ry', Math.max(0, r))
      circ.setAttribute('fill', 'none')
      circ.setAttribute('stroke', 'rgba(0, 102, 255, 0.5)')
      circ.setAttribute('stroke-width', '1.5')
      circ.setAttribute('data-role', 'preview')
      circ.setAttribute('pointer-events', 'all')
      group.append(circ)
    } else {
      const rect = doc.createElementNS(ns, 'rect')
      rect.setAttribute('x', attrs.x)
      rect.setAttribute('y', attrs.y)
      rect.setAttribute('width', Math.max(0, attrs.w))
      rect.setAttribute('height', Math.max(0, attrs.h))
      rect.setAttribute('fill', 'none')
      rect.setAttribute('stroke', 'rgba(0, 102, 255, 0.5)')
      rect.setAttribute('stroke-width', '1.5')
      rect.setAttribute('data-role', 'preview')
      rect.setAttribute('pointer-events', 'all')
      group.append(rect)
    }
    return
  }

  const geom = generateHydrogelGeometry(
    { x: attrs.x, y: attrs.y, w: attrs.w, h: attrs.h },
    attrs,
    attrs.seed
  )
  const batched = batchHydrogelGeometry(geom)

  // Invisible hit target matching bounds
  if (attrs.hydrogelShape === 'circle') {
    const r = Math.min(batched.bounds.w, batched.bounds.h) / 2
    const hit = doc.createElementNS(ns, 'ellipse')
    hit.setAttribute('cx', batched.bounds.x + batched.bounds.w / 2)
    hit.setAttribute('cy', batched.bounds.y + batched.bounds.h / 2)
    hit.setAttribute('rx', r)
    hit.setAttribute('ry', r)
    hit.setAttribute('fill', 'transparent')
    hit.setAttribute('stroke', 'none')
    hit.setAttribute('data-role', 'hit')
    hit.setAttribute('pointer-events', 'all')
    group.append(hit)
  } else {
    const hit = doc.createElementNS(ns, 'rect')
    hit.setAttribute('x', batched.bounds.x)
    hit.setAttribute('y', batched.bounds.y)
    hit.setAttribute('width', batched.bounds.w)
    hit.setAttribute('height', batched.bounds.h)
    hit.setAttribute('fill', 'transparent')
    hit.setAttribute('stroke', 'none')
    hit.setAttribute('data-role', 'hit')
    hit.setAttribute('pointer-events', 'all')
    group.append(hit)
  }

  // Batched DOM: at most 3 draw paths (+ 1 hit target) regardless of density
  if (batched.chainsD) {
    const chainsPath = doc.createElementNS(ns, 'path')
    chainsPath.setAttribute('d', batched.chainsD)
    chainsPath.setAttribute('fill', 'none')
    chainsPath.setAttribute('stroke', batched.chainsStroke)
    chainsPath.setAttribute('stroke-width', String(batched.chainsStrokeWidth))
    chainsPath.setAttribute('stroke-linecap', 'round')
    chainsPath.setAttribute('stroke-linejoin', 'round')
    chainsPath.setAttribute('data-role', 'chains')
    chainsPath.setAttribute('pointer-events', 'none')
    group.append(chainsPath)
  }

  if (batched.crosslinksD) {
    const xlPath = doc.createElementNS(ns, 'path')
    xlPath.setAttribute('d', batched.crosslinksD)
    xlPath.setAttribute('fill', batched.crosslinksFill)
    xlPath.setAttribute('stroke', 'none')
    xlPath.setAttribute('fill-rule', 'evenodd')
    xlPath.setAttribute('data-role', 'crosslinks')
    xlPath.setAttribute('pointer-events', 'none')
    group.append(xlPath)
  }

  if (batched.particlesD) {
    const ptPath = doc.createElementNS(ns, 'path')
    ptPath.setAttribute('d', batched.particlesD)
    ptPath.setAttribute('fill', batched.particlesFill)
    ptPath.setAttribute('stroke', 'none')
    ptPath.setAttribute('fill-rule', 'evenodd')
    ptPath.setAttribute('data-role', 'particles')
    ptPath.setAttribute('pointer-events', 'none')
    group.append(ptPath)
  }
}

/**
 * @param {SVGElement} elem
 * @returns {{ attrs: Record<string, string|null> }}
 */
const snapshotHydrogel = (elem) => {
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
    let selectingHydrogel = false
    let startPt = null

    class HydrogelChangeCommand extends Command {
      constructor (elem, oldSnapshot, newSnapshot) {
        super()
        this.elem = elem
        this.oldSnapshot = oldSnapshot
        this.newSnapshot = newSnapshot
        this.text = 'Change Hydrogel'
      }

      restore (snap) {
        Object.entries(snap.attrs).forEach(([key, value]) => {
          if (value === null || value === undefined) {
            this.elem.removeAttribute(key)
          } else {
            this.elem.setAttribute(key, value)
          }
        })
        regenerateHydrogel(this.elem)
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
      const panel = $id('hydrogel_panel')
      if (!panel) return
      if (on) panel.style.removeProperty('display')
      else panel.style.display = 'none'
    }

    const readPanelParams = () => ({
      hydrogelShape: $id('hydrogelShape')?.value || DEFAULTS.hydrogelShape,
      density: readPanelNum($id, 'hydrogelDensity', DEFAULTS.density),
      chainLength: readPanelNum($id, 'hydrogelChainLength', DEFAULTS.chainLength),
      // LabCanvas polymer uses sky-400 @ 0.8 alpha
      polymerColor: hexToRgba($id('hydrogelPolymerColor')?.value || '#38bdf8', 0.8),
      polymerThickness: readPanelNum($id, 'hydrogelPolymerThickness', DEFAULTS.polymerThickness),
      showParticles: Boolean($id('hydrogelShowParticles')?.checked),
      particleCount: readPanelNum($id, 'hydrogelParticleCount', DEFAULTS.particleCount),
      particleRadius: readPanelNum($id, 'hydrogelParticleRadius', DEFAULTS.particleRadius),
      particleColor: hexToRgba($id('hydrogelParticleColor')?.value || '#f59e0b', 1),
      poreSize: readPanelNum($id, 'hydrogelPoreSize', DEFAULTS.poreSize),
      networkType: $id('hydrogelNetworkType')?.value || DEFAULTS.networkType,
      crosslinkDensity: readPanelNum($id, 'hydrogelCrosslinkDensity', DEFAULTS.crosslinkDensity),
      crosslinkerRadius: readPanelNum($id, 'hydrogelCrosslinkerRadius', DEFAULTS.crosslinkerRadius),
      crosslinkerColor: hexToRgba($id('hydrogelCrosslinkerColor')?.value || '#ec4899', 1),
      swelling: readPanelNum($id, 'hydrogelSwelling', DEFAULTS.swelling),
      payloadRelease: readPanelNum($id, 'hydrogelPayloadRelease', DEFAULTS.payloadRelease)
    })

    const syncPanelFromElem = (elem) => {
      if (!elem) return
      const a = readHydrogelAttrs(elem)
      const setVal = (id, v) => { if ($id(id)) $id(id).value = v }
      setVal('hydrogelShape', a.hydrogelShape)
      setVal('hydrogelDensity', a.density)
      setVal('hydrogelChainLength', a.chainLength)
      setVal('hydrogelPolymerColor', colorToHex(a.polymerColor))
      setVal('hydrogelPolymerThickness', a.polymerThickness)
      if ($id('hydrogelShowParticles')) $id('hydrogelShowParticles').checked = a.showParticles
      setVal('hydrogelParticleCount', a.particleCount)
      setVal('hydrogelParticleRadius', a.particleRadius)
      setVal('hydrogelParticleColor', colorToHex(a.particleColor))
      setVal('hydrogelPoreSize', a.poreSize)
      setVal('hydrogelNetworkType', a.networkType)
      setVal('hydrogelCrosslinkDensity', a.crosslinkDensity)
      setVal('hydrogelCrosslinkerRadius', a.crosslinkerRadius)
      setVal('hydrogelCrosslinkerColor', colorToHex(a.crosslinkerColor))
      setVal('hydrogelSwelling', a.swelling)
      setVal('hydrogelPayloadRelease', a.payloadRelease)
      updatePanelVisibility()
    }

    const updatePanelVisibility = () => {
      const net = $id('hydrogelNetworkType')?.value
      const showP = $id('hydrogelShowParticles')?.checked
      const xl = $id('hydrogel_crosslink_fields')
      const enc = $id('hydrogel_particle_fields')
      const release = $id('hydrogel_release_field')
      if (xl) xl.style.display = net === 'cross-linked' ? '' : 'none'
      if (enc) enc.style.display = showP ? '' : 'none'
      if (release) release.style.display = showP ? '' : 'none'
    }

    const applyFromPanel = ({ history = true, undoSnap = null } = {}) => {
      let i = selElems?.length || 0
      while (i--) {
        const elem = findHydrogelGroup(selElems[i])
        if (!elem) continue
        const oldSnapshot = undoSnap || snapshotHydrogel(elem)
        regenerateHydrogel(elem, readPanelParams())
        if (history) {
          addToHistory(new HydrogelChangeCommand(elem, oldSnapshot, snapshotHydrogel(elem)))
        }
        svgCanvas.call('changed', [elem])
      }
    }

    const openHydrogelPanel = () => {
      showPanel(true)
      svgEditor.rightPanel?.switchTab('properties')
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex($id('tools_left'), `
          <se-button id="tool_hydrogel" title="${title}" src="hydrogel.svg"></se-button>
        `, 14)

        $click($id('tool_hydrogel'), () => {
          if (this.leftPanel.updateLeftPanel('tool_hydrogel')) {
            svgCanvas.setMode(MODE)
            openHydrogelPanel()
          }
        })

        const t = (key) => svgEditor.i18next.t(`${name}:${key}`)
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="hydrogel_panel" class="hydrogel_panel extension_panel right_panel_section" style="display:none">
            <div class="extension_panel_heading">${name}:panelTitle</div>

            <label class="hydrogel_field_label">${t('contextTools.0.label')}</label>
            <select id="hydrogelShape" class="hydrogel_select" title="${t('contextTools.0.title')}">
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
            </select>

            <label class="hydrogel_field_label">${t('contextTools.1.label')}</label>
            <select id="hydrogelNetworkType" class="hydrogel_select" title="${t('contextTools.1.title')}">
              <option value="entangled">Entangled</option>
              <option value="cross-linked">Cross-linked</option>
            </select>

            <se-range-input id="hydrogelDensity" label="${t('contextTools.2.label')}" min="5" max="200" step="5" value="${DEFAULTS.density}" title="${t('contextTools.2.title')}" decimals="0"></se-range-input>
            <se-range-input id="hydrogelChainLength" label="${t('contextTools.3.label')}" min="5" max="50" step="1" value="${DEFAULTS.chainLength}" title="${t('contextTools.3.title')}" decimals="0"></se-range-input>
            <se-range-input id="hydrogelPoreSize" label="${t('contextTools.4.label')}" min="5" max="50" step="1" value="${DEFAULTS.poreSize}" title="${t('contextTools.4.title')}" decimals="0"></se-range-input>

            <div id="hydrogel_crosslink_fields" style="display:none">
              <se-range-input id="hydrogelCrosslinkDensity" label="${t('contextTools.5.label')}" min="0" max="100" step="5" value="${DEFAULTS.crosslinkDensity}" title="${t('contextTools.5.title')}" decimals="0"></se-range-input>
              <se-range-input id="hydrogelCrosslinkerRadius" label="${t('contextTools.6.label')}" min="1" max="5" step="0.5" value="${DEFAULTS.crosslinkerRadius}" title="${t('contextTools.6.title')}" decimals="1"></se-range-input>
              <label class="hydrogel_field_label">${t('contextTools.7.label')}</label>
              <input id="hydrogelCrosslinkerColor" type="color" value="#ec4899" title="${t('contextTools.7.title')}" />
            </div>

            <se-range-input id="hydrogelPolymerThickness" label="${t('contextTools.8.label')}" min="0.5" max="5" step="0.25" value="${DEFAULTS.polymerThickness}" title="${t('contextTools.8.title')}" decimals="2"></se-range-input>
            <label class="hydrogel_field_label">${t('contextTools.9.label')}</label>
            <input id="hydrogelPolymerColor" type="color" value="#38bdf8" title="${t('contextTools.9.title')}" />

            <label class="hydrogel_check_label">
              <input id="hydrogelShowParticles" type="checkbox" />
              ${t('contextTools.10.label')}
            </label>

            <div id="hydrogel_particle_fields" style="display:none">
              <se-range-input id="hydrogelParticleCount" label="${t('contextTools.11.label')}" min="10" max="200" step="5" value="${DEFAULTS.particleCount}" title="${t('contextTools.11.title')}" decimals="0"></se-range-input>
              <se-range-input id="hydrogelParticleRadius" label="${t('contextTools.12.label')}" min="1" max="10" step="0.5" value="${DEFAULTS.particleRadius}" title="${t('contextTools.12.title')}" decimals="1"></se-range-input>
              <label class="hydrogel_field_label">${t('contextTools.13.label')}</label>
              <input id="hydrogelParticleColor" type="color" value="#f59e0b" title="${t('contextTools.13.title')}" />
            </div>

            <se-range-input id="hydrogelSwelling" label="${t('contextTools.14.label')}" min="0" max="100" step="1" value="${DEFAULTS.swelling}" title="${t('contextTools.14.title')}" decimals="0"></se-range-input>
            <div id="hydrogel_release_field" style="display:none">
              <se-range-input id="hydrogelPayloadRelease" label="${t('contextTools.15.label')}" min="0" max="100" step="1" value="${DEFAULTS.payloadRelease}" title="${t('contextTools.15.title')}" decimals="0"></se-range-input>
            </div>
          </div>
        `
        $id('right_properties_extensions').appendChild(panelTemplate.content.cloneNode(true))
        const heading = $id('hydrogel_panel')?.querySelector('.extension_panel_heading')
        if (heading) heading.textContent = svgEditor.i18next.t(`${name}:panelTitle`)

        // Minimal panel styles
        if (!$id('hydrogel_panel_style')) {
          const style = document.createElement('style')
          style.id = 'hydrogel_panel_style'
          style.textContent = `
            #hydrogel_panel .hydrogel_field_label,
            #hydrogel_panel .hydrogel_check_label {
              display: block; font-size: 12px; margin: 8px 0 4px; opacity: 0.85;
            }
            #hydrogel_panel .hydrogel_select,
            #hydrogel_panel input[type="color"] {
              width: 100%; box-sizing: border-box; margin-bottom: 4px;
            }
            #hydrogel_panel .hydrogel_check_label {
              display: flex; align-items: center; gap: 8px;
            }
          `
          document.head.append(style)
        }

        showPanel(false)
        updatePanelVisibility()

        const dragSnaps = new Map()
        const bindRange = (id) => {
          const el = $id(id)
          if (!el) return
          el.addEventListener('mousedown', () => {
            const elem = findHydrogelGroup(selElems?.[0])
            if (elem) dragSnaps.set(id, snapshotHydrogel(elem))
          })
          el.addEventListener('input', () => applyFromPanel({ history: false }))
          el.addEventListener('change', () => {
            applyFromPanel({ history: true, undoSnap: dragSnaps.get(id) })
            dragSnaps.delete(id)
          })
        }
        ;[
          'hydrogelDensity', 'hydrogelChainLength', 'hydrogelPoreSize',
          'hydrogelCrosslinkDensity', 'hydrogelCrosslinkerRadius',
          'hydrogelPolymerThickness', 'hydrogelParticleCount',
          'hydrogelParticleRadius', 'hydrogelSwelling', 'hydrogelPayloadRelease'
        ].forEach(bindRange)

        ;['hydrogelShape', 'hydrogelNetworkType', 'hydrogelPolymerColor',
          'hydrogelCrosslinkerColor', 'hydrogelParticleColor'].forEach((id) => {
          const el = $id(id)
          if (!el) return
          el.addEventListener('change', () => {
            updatePanelVisibility()
            applyFromPanel({ history: true })
          })
        })

        $id('hydrogelShowParticles')?.addEventListener('change', () => {
          updatePanelVisibility()
          applyFromPanel({ history: true })
        })
      },
      mouseDown (opts) {
        if (svgCanvas.getMode() !== MODE) return undefined
        const params = readPanelParams()
        started = true
        startPt = { x: opts.start_x, y: opts.start_y }
        const seed = Date.now()
        newFO = svgCanvas.addSVGElementsFromJson({
          element: 'g',
          attr: {
            id: svgCanvas.getNextId(),
            shape: 'hydrogel',
            'data-x': startPt.x,
            'data-y': startPt.y,
            'data-w': 0,
            'data-h': 0,
            'data-seed': seed,
            'data-shape': params.hydrogelShape,
            'data-density': params.density,
            'data-chain-length': params.chainLength,
            'data-polymer-color': params.polymerColor,
            'data-polymer-thickness': params.polymerThickness,
            'data-show-particles': params.showParticles ? 'true' : 'false',
            'data-particle-count': params.particleCount,
            'data-particle-radius': params.particleRadius,
            'data-particle-color': params.particleColor,
            'data-pore-size': params.poreSize,
            'data-network-type': params.networkType,
            'data-crosslink-density': params.crosslinkDensity,
            'data-crosslinker-radius': params.crosslinkerRadius,
            'data-crosslinker-color': params.crosslinkerColor,
            'data-swelling': params.swelling,
            'data-payload-release': params.payloadRelease,
            style: 'pointer-events:visiblePainted'
          }
        })
        regenerateHydrogel(newFO, {}, { previewOnly: true })
        return { started: true }
      },
      mouseMove (opts) {
        if (!started || svgCanvas.getMode() !== MODE || !newFO || !startPt) {
          return undefined
        }
        const zoom = svgCanvas.getZoom() || 1
        const mx = opts.mouse_x / zoom
        const my = opts.mouse_y / zoom
        const x = Math.min(startPt.x, mx)
        const y = Math.min(startPt.y, my)
        const w = Math.abs(mx - startPt.x)
        const h = Math.abs(my - startPt.y)
        regenerateHydrogel(newFO, { x, y, w, h, ...readPanelParams() }, { previewOnly: true })
        return { started: true }
      },
      mouseUp (opts) {
        if (svgCanvas.getMode() !== MODE || !newFO || !startPt) {
          return undefined
        }
        const zoom = svgCanvas.getZoom() || 1
        const mx = opts?.mouse_x != null ? opts.mouse_x / zoom : Number(newFO.getAttribute('data-x')) + Number(newFO.getAttribute('data-w'))
        const my = opts?.mouse_y != null ? opts.mouse_y / zoom : Number(newFO.getAttribute('data-y')) + Number(newFO.getAttribute('data-h'))
        const x = Math.min(startPt.x, mx)
        const y = Math.min(startPt.y, my)
        const w = Math.abs(mx - startPt.x)
        const h = Math.abs(my - startPt.y)
        // LabCanvas: require at least 50×50
        const keep = w >= 50 && h >= 50
        if (keep) {
          regenerateHydrogel(newFO, { x, y, w, h, ...readPanelParams() })
        }
        const element = newFO
        started = false
        newFO = null
        startPt = null
        return { keep, element }
      },
      selectedChanged (opts) {
        if (selectingHydrogel) return
        selElems = opts.elems
        if (!selElems?.length) {
          showPanel(false)
          return
        }
        const gel = findHydrogelGroup(selElems[0])
        if (gel && opts.selectedElement && !opts.multiselected) {
          if (selElems[0] !== gel) {
            selectingHydrogel = true
            svgCanvas.selectOnly([gel], true)
            selectingHydrogel = false
            selElems = [gel]
          }
          syncPanelFromElem(gel)
          openHydrogelPanel()
        } else if (svgCanvas.getMode() !== MODE) {
          showPanel(false)
        }
      }
    }
  }
}
