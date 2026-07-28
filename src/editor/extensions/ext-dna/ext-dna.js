/**
 * @file ext-dna.js
 * Freehand B-DNA double-helix brush — LabCanvas DNA brush port.
 * Draw a path; helix is sampled along it (cartoon / molecular).
 * @license MIT
 */

import {
  DEFAULTS,
  SPINE_MAX_POINTS,
  SPINE_MIN_DIST,
  computeDnaGeometry,
  parsePoints,
  pathDToPolyline,
  pointsToPathD,
  pointsToSmoothPathD,
  serializePoints,
  simplifyPoints
} from './dna-math.js'

const name = 'dna'
const MODE = 'dna'
/** Min px between samples while freehand drawing (reduces raw point count). */
const DRAW_SAMPLE_MIN = 10

const ATTR_KEYS = [
  'data-points',
  'data-spine-d',
  'data-thickness',
  'data-style-mode',
  'data-strand-color',
  'data-rung-color',
  'data-base-pair-mode',
  'data-base-pair-color-at',
  'data-base-pair-color-gc',
  'data-single-strand',
  'data-show-base-pairs',
  'data-show-directionality',
  'data-show-histones',
  'data-histone-every',
  'data-annotation-every',
  'data-annotation-start'
]

const boolAttr = (v) => v === true || v === 'true' || v === '1'

/**
 * @param {Element} group
 */
const readDnaAttrs = (group) => ({
  points: parsePoints(group.getAttribute('data-points') || '[]'),
  spineD: group.getAttribute('data-spine-d') || '',
  thickness: Number(group.getAttribute('data-thickness') || DEFAULTS.thickness),
  styleMode: group.getAttribute('data-style-mode') || DEFAULTS.styleMode,
  strandColor: group.getAttribute('data-strand-color') || DEFAULTS.strandColor,
  rungColor: group.getAttribute('data-rung-color') || DEFAULTS.rungColor,
  basePairMode: group.getAttribute('data-base-pair-mode') || DEFAULTS.basePairMode,
  basePairColorAT: group.getAttribute('data-base-pair-color-at') || DEFAULTS.basePairColorAT,
  basePairColorGC: group.getAttribute('data-base-pair-color-gc') || DEFAULTS.basePairColorGC,
  singleStrandOnly: boolAttr(group.getAttribute('data-single-strand') || DEFAULTS.singleStrandOnly),
  showBasePairs: group.getAttribute('data-show-base-pairs') == null
    ? DEFAULTS.showBasePairs
    : boolAttr(group.getAttribute('data-show-base-pairs')),
  showDirectionality: boolAttr(group.getAttribute('data-show-directionality') || false),
  showHistones: boolAttr(group.getAttribute('data-show-histones') || false),
  histoneEveryBp: Number(group.getAttribute('data-histone-every') || DEFAULTS.histoneEveryBp),
  annotationEveryBp: Number(group.getAttribute('data-annotation-every') || DEFAULTS.annotationEveryBp),
  annotationStartBp: Number(group.getAttribute('data-annotation-start') || DEFAULTS.annotationStartBp)
})

/**
 * Resolve centerline path d (source of truth for helix sampling).
 * @param {object} attrs
 * @param {{smooth?: boolean}} [opts]
 */
const resolveSpineD = (attrs, opts = {}) => {
  if (attrs.spineD && String(attrs.spineD).trim()) return String(attrs.spineD)
  const pts = attrs.points || []
  if (pts.length < 2) return ''
  return opts.smooth === false ? pointsToPathD(pts) : pointsToSmoothPathD(pts)
}

/**
 * Write attrs onto group (no geometry).
 * @param {SVGElement} group
 * @param {object} attrs
 */
const writeDnaAttrs = (group, attrs) => {
  group.setAttribute('data-points', serializePoints(attrs.points || []))
  if (attrs.spineD) group.setAttribute('data-spine-d', attrs.spineD)
  else group.removeAttribute('data-spine-d')
  group.setAttribute('data-thickness', String(attrs.thickness))
  group.setAttribute('data-style-mode', attrs.styleMode)
  group.setAttribute('data-strand-color', attrs.strandColor)
  group.setAttribute('data-rung-color', attrs.rungColor)
  group.setAttribute('data-base-pair-mode', attrs.basePairMode)
  group.setAttribute('data-base-pair-color-at', attrs.basePairColorAT)
  group.setAttribute('data-base-pair-color-gc', attrs.basePairColorGC)
  group.setAttribute('data-single-strand', String(!!attrs.singleStrandOnly))
  group.setAttribute('data-show-base-pairs', String(!!attrs.showBasePairs))
  group.setAttribute('data-show-directionality', String(!!attrs.showDirectionality))
  group.setAttribute('data-show-histones', String(!!attrs.showHistones))
  group.setAttribute('data-histone-every', String(attrs.histoneEveryBp))
  group.setAttribute('data-annotation-every', String(attrs.annotationEveryBp))
  group.setAttribute('data-annotation-start', String(attrs.annotationStartBp))
}

/** @param {SVGElement} spine @param {boolean} editing */
const styleSpinePath = (spine, editing) => {
  if (!spine) return
  spine.setAttribute('fill', 'none')
  spine.setAttribute('stroke-linecap', 'round')
  spine.setAttribute('stroke-linejoin', 'round')
  spine.setAttribute('data-role', 'spine')
  if (editing) {
    spine.setAttribute('stroke', '#0ea5e9')
    spine.setAttribute('stroke-width', '1.75')
    spine.setAttribute('stroke-dasharray', '5 4')
    spine.setAttribute('opacity', '0.95')
    spine.setAttribute('pointer-events', 'stroke')
    spine.style.pointerEvents = 'stroke'
  } else {
    // Keep in DOM for editing, but invisible / non-interactive until dblclick
    spine.setAttribute('stroke', 'transparent')
    spine.setAttribute('stroke-width', '12')
    spine.removeAttribute('stroke-dasharray')
    spine.setAttribute('opacity', '0')
    spine.setAttribute('pointer-events', 'none')
    spine.style.pointerEvents = 'none'
  }
}

/**
 * @param {SVGElement} group
 * @param {object} geom
 */
const emitDnaSvg = (group, geom) => {
  const ns = group.namespaceURI
  const doc = group.ownerDocument
  const { hp, params } = geom

  const el = (tag, attrs) => {
    const node = doc.createElementNS(ns, tag)
    Object.entries(attrs).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') node.setAttribute(k, String(v))
    })
    return node
  }

  // Invisible hit target along drawn path
  if (geom.hitD) {
    group.append(el('path', {
      d: geom.hitD,
      fill: 'none',
      stroke: 'transparent',
      'stroke-width': String(Math.max(18, hp.helixRadius * 2.4)),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'pointer-events': 'stroke',
      'data-role': 'hit'
    }))
  }

  if (params.styleMode === 'molecular') {
    const m = geom.molecular
    if (m.molBondsBack) {
      group.append(el('path', {
        d: m.molBondsBack, fill: 'none', stroke: 'rgba(55,65,81,0.9)',
        'stroke-width': Math.max(1, hp.strandWidth * 0.25),
        'stroke-linecap': 'round', 'pointer-events': 'none', 'data-role': 'mol-bond-back'
      }))
    }
    // rungs for molecular via cartoon rungs thinner
    if (params.showBasePairs && geom.cartoon.rungs.length) {
      let d = ''
      geom.cartoon.rungs.forEach((r) => {
        d += `M${r.x1.toFixed(2)},${r.y1.toFixed(2)}L${r.x2.toFixed(2)},${r.y2.toFixed(2)}`
      })
      group.append(el('path', {
        d, fill: 'none', stroke: params.rungColor,
        'stroke-width': Math.max(1, hp.strandWidth * 0.28),
        'stroke-linecap': 'round', 'pointer-events': 'none', 'data-role': 'rungs'
      }))
    }
    if (m.molBondsFront) {
      group.append(el('path', {
        d: m.molBondsFront, fill: 'none', stroke: 'rgba(55,65,81,0.9)',
        'stroke-width': Math.max(1, hp.strandWidth * 0.25),
        'stroke-linecap': 'round', 'pointer-events': 'none', 'data-role': 'mol-bond-front'
      }))
    }
    if (m.molAtoms) {
      group.append(el('path', {
        d: m.molAtoms, fill: '#374151', stroke: 'none',
        'fill-rule': 'evenodd', 'pointer-events': 'none', 'data-role': 'mol-atoms'
      }))
    }
    if (m.molMids) {
      group.append(el('path', {
        d: m.molMids, fill: '#2563eb', stroke: 'none',
        'fill-rule': 'evenodd', 'pointer-events': 'none', 'data-role': 'mol-mids'
      }))
    }
  } else {
    const c = geom.cartoon
    // back strands
    if (c.backA) {
      group.append(el('path', {
        d: c.backA, fill: 'none', stroke: params.strandColor,
        'stroke-width': Math.max(1, hp.strandWidth),
        'stroke-linecap': 'round', 'pointer-events': 'none', 'data-role': 'strand-back-a'
      }))
    }
    if (c.backB) {
      group.append(el('path', {
        d: c.backB, fill: 'none', stroke: params.strandColor,
        'stroke-width': Math.max(1, hp.strandWidth),
        'stroke-linecap': 'round', 'pointer-events': 'none', 'data-role': 'strand-back-b'
      }))
    }

    // histones (between back and front, like LabCanvas)
    geom.histones.forEach((h, hi) => {
      const g = el('g', { 'data-role': 'histone', 'data-histone': String(hi), 'pointer-events': 'none' })
      h.units.filter((u) => u.depth < 0).forEach((u) => {
        g.append(el('circle', {
          cx: u.x, cy: u.y, r: u.r,
          fill: 'rgba(124,58,237,0.72)', stroke: 'none'
        }))
      })
      g.append(el('circle', {
        cx: h.cx, cy: h.cy, r: h.coreR,
        fill: 'rgba(88,28,135,0.18)', stroke: 'none'
      }))
      h.units.filter((u) => u.depth >= 0).forEach((u) => {
        g.append(el('circle', {
          cx: u.x, cy: u.y, r: u.r,
          fill: 'rgba(124,58,237,0.82)', stroke: 'none'
        }))
      })
      // wrap strands simplified as path through wrapPts
      let wrapD = ''
      h.wrapPts.forEach((q, i) => {
        wrapD += `${i === 0 ? 'M' : 'L'}${q.x.toFixed(2)},${q.y.toFixed(2)}`
      })
      if (wrapD) {
        g.append(el('path', {
          d: wrapD, fill: 'none', stroke: params.strandColor,
          'stroke-width': Math.max(1, hp.strandWidth * 0.78),
          'stroke-linecap': 'round', opacity: '0.9'
        }))
      }
      g.append(el('path', {
        d: `M${h.linker.x1},${h.linker.y1}L${h.linker.x2},${h.linker.y2}M${h.linker.x3},${h.linker.y3}L${h.linker.x4},${h.linker.y4}`,
        fill: 'none', stroke: params.strandColor,
        'stroke-width': Math.max(1, hp.strandWidth * 0.7),
        'stroke-linecap': 'round'
      }))
      group.append(g)
    })

    // base-pair rungs (batch by color)
    if (c.rungs.length) {
      const byColor = new Map()
      c.rungs.forEach((r) => {
        if (!byColor.has(r.color)) byColor.set(r.color, '')
        byColor.set(r.color, byColor.get(r.color) +
          `M${r.x1.toFixed(2)},${r.y1.toFixed(2)}L${r.x2.toFixed(2)},${r.y2.toFixed(2)}`)
      })
      byColor.forEach((d, color) => {
        group.append(el('path', {
          d, fill: 'none', stroke: color,
          'stroke-width': Math.max(1, hp.strandWidth * 0.58),
          'stroke-linecap': 'round', 'pointer-events': 'none', 'data-role': 'rungs'
        }))
      })
    }

    // front strands
    if (c.frontA) {
      group.append(el('path', {
        d: c.frontA, fill: 'none', stroke: params.strandColor,
        'stroke-width': Math.max(1, hp.strandWidth),
        'stroke-linecap': 'round', 'pointer-events': 'none', 'data-role': 'strand-front-a'
      }))
    }
    if (c.frontB) {
      group.append(el('path', {
        d: c.frontB, fill: 'none', stroke: params.strandColor,
        'stroke-width': Math.max(1, hp.strandWidth),
        'stroke-linecap': 'round', 'pointer-events': 'none', 'data-role': 'strand-front-b'
      }))
    }
  }

}

/** Coalesce live spine regen to animation frames (no extra ms throttle). */
const LIVE_SPINE_REGEN_MS = 0

/**
 * Update existing helix path `d` attrs in place — avoids DOM teardown during drag.
 * @param {SVGElement} visuals
 * @param {object} geom
 * @param {{ strokeScale?: number }} [opts]
 * @returns {boolean}
 */
const patchDnaVisualsInPlace = (visuals, geom, opts = {}) => {
  if (!visuals || !geom || geom.empty) return false
  const strokeScale = Number(opts.strokeScale) > 0 ? Number(opts.strokeScale) : 1
  const setD = (role, d) => {
    if (!d) return true
    const node = visuals.querySelector(`[data-role="${role}"]`)
    if (!node) return false
    node.setAttribute('d', d)
    return true
  }
  const setStroke = (role, width) => {
    const node = visuals.querySelector(`[data-role="${role}"]`)
    if (!node || !Number.isFinite(width)) return
    node.setAttribute('stroke-width', String(Math.max(0.5, width / strokeScale)))
  }
  if (geom.params?.styleMode === 'molecular') {
    const m = geom.molecular
    if (!setD('mol-bond-back', m.molBondsBack)) return false
    if (!setD('mol-bond-front', m.molBondsFront)) return false
    if (!setD('mol-atoms', m.molAtoms)) return false
    if (!setD('mol-mids', m.molMids)) return false
    if (geom.hp) {
      const sw = Math.max(1, geom.hp.strandWidth)
      setStroke('mol-bond-back', sw * 0.25)
      setStroke('mol-bond-front', sw * 0.25)
      setStroke('rungs', sw * 0.28)
      setStroke('hit', Math.max(18, geom.hp.helixRadius * 2.4))
    }
  }
  const c = geom.cartoon
  if (!setD('strand-back-a', c.backA)) return false
  if (!setD('strand-back-b', c.backB)) return false
  if (!setD('strand-front-a', c.frontA)) return false
  if (!setD('strand-front-b', c.frontB)) return false
  if (geom.hp) {
    const sw = Math.max(1, geom.hp.strandWidth)
    setStroke('strand-back-a', sw)
    setStroke('strand-back-b', sw)
    setStroke('strand-front-a', sw)
    setStroke('strand-front-b', sw)
    setStroke('rungs', Math.max(1, sw * 0.58))
    setStroke('hit', Math.max(18, geom.hp.helixRadius * 2.4))
  }
  const rungNode = visuals.querySelector('[data-role="rungs"]')
  if (rungNode && c.rungs?.length) {
    let d = ''
    c.rungs.forEach((r) => {
      d += `M${r.x1.toFixed(2)},${r.y1.toFixed(2)}L${r.x2.toFixed(2)},${r.y2.toFixed(2)}`
    })
    rungNode.setAttribute('d', d)
  }
  const hit = visuals.querySelector('[data-role="hit"]')
  if (hit && geom.hitD) hit.setAttribute('d', geom.hitD)
  return true
}

/**
 * Apply an SVGMatrix to a path `d` (via polyline sampling — good enough for live preview).
 * @param {string} d
 * @param {SVGMatrix} m
 * @param {number} [steps]
 */
const transformPathD = (d, m, steps = 6) => {
  if (!d || !m) return d || ''
  const pts = pathDToPolyline(d, steps)
  if (pts.length < 2) return ''
  return pointsToPathD(pts.map((p) => ({
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f
  })))
}

/**
 * Map helix geometry into the DNA group's local space (inverse of live transform).
 * Matches LabCanvas: path scales, helix thickness stays constant on screen.
 * @param {object} geom
 * @param {SVGMatrix} inv
 */
const mapGeomByMatrix = (geom, inv) => {
  if (!geom || geom.empty || !inv) return geom
  const mapD = (d) => transformPathD(d, inv, 5)
  const c = geom.cartoon || {}
  return {
    ...geom,
    hitD: mapD(geom.hitD),
    cartoon: {
      backA: mapD(c.backA),
      frontA: mapD(c.frontA),
      backB: mapD(c.backB),
      frontB: mapD(c.frontB),
      rungs: (c.rungs || []).map((r) => ({
        ...r,
        x1: inv.a * r.x1 + inv.c * r.y1 + inv.e,
        y1: inv.b * r.x1 + inv.d * r.y1 + inv.f,
        x2: inv.a * r.x2 + inv.c * r.y2 + inv.e,
        y2: inv.b * r.x2 + inv.d * r.y2 + inv.f
      }))
    },
    molecular: {
      molBondsBack: mapD(geom.molecular?.molBondsBack),
      molBondsFront: mapD(geom.molecular?.molBondsFront),
      molAtoms: mapD(geom.molecular?.molAtoms),
      molMids: mapD(geom.molecular?.molMids)
    },
    histones: [],
    polarity: [],
    annotations: []
  }
}

/**
 * Combined local transform matrix without consolidating (safe during SVG-edit drag).
 * @param {SVGElement} el
 * @returns {SVGMatrix|null}
 */
const getLocalTransformMatrix = (el) => {
  const svg = el?.ownerSVGElement
  const list = el?.transform?.baseVal
  if (!svg || !list?.numberOfItems) return null
  let m = svg.createSVGMatrix()
  for (let i = 0; i < list.numberOfItems; i++) {
    m = m.multiply(list.getItem(i).matrix)
  }
  return m
}

/**
 * Build / replace only the helix visuals group. Never touches the spine path
 * (so pathedit grips keep working while we live-update the DNA).
 *
 * @param {SVGElement} group
 * @param {object} attrs
 * @param {string} spineD
 * @param {{ editingSpine?: boolean, livePreview?: boolean, strokeScale?: number, mappedGeom?: object }} [opts]
 * @returns {boolean} true if geometry was emitted
 */
const rebuildDnaVisuals = (group, attrs, spineD, opts = {}) => {
  const ns = group.namespaceURI
  const doc = group.ownerDocument
  const el = (tag, a) => {
    const node = doc.createElementNS(ns, tag)
    Object.entries(a).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') node.setAttribute(k, String(v))
    })
    return node
  }

  const spine = group.querySelector(':scope > path[data-role="spine"]') ||
    group.querySelector('path[data-role="spine"]')

  const geom = opts.mappedGeom || computeDnaGeometry(
    spineD ? { spineD, points: attrs.points } : attrs.points,
    { ...attrs, livePreview: !!opts.livePreview }
  )
  const strokeScale = Number(opts.strokeScale) > 0 ? Number(opts.strokeScale) : 1
  const emitGeom = (strokeScale !== 1 && geom?.hp)
    ? {
      ...geom,
      hp: {
        ...geom.hp,
        strandWidth: Math.max(0.5, geom.hp.strandWidth / strokeScale),
        helixRadius: Math.max(1, geom.hp.helixRadius / strokeScale)
      }
    }
    : geom

  if (opts.livePreview) {
    const visuals = group.querySelector('[data-role="dna-visuals"]')
    if (visuals && patchDnaVisualsInPlace(visuals, geom, { strokeScale })) {
      return true
    }
  }

  // Drop previous visuals / preview, keep spine
  Array.from(group.childNodes).forEach((ch) => {
    if (ch !== spine) ch.remove()
  })

  if (geom.empty) {
    if (attrs.points?.length >= 1) {
      group.insertBefore(el('path', {
        d: pointsToPathD(attrs.points),
        fill: 'none',
        stroke: attrs.strandColor,
        'stroke-width': String(Math.max(2, attrs.thickness * 3)),
        'stroke-linecap': 'round',
        opacity: '0.45',
        'pointer-events': 'none',
        'data-role': 'preview'
      }), spine || null)
    }
    return false
  }

  const visuals = el('g', {
    'data-role': 'dna-visuals',
    'pointer-events': 'none'
  })
  if (opts.editingSpine) visuals.setAttribute('opacity', '0.7')
  emitDnaSvg(visuals, emitGeom)
  if (opts.editingSpine) {
    visuals.querySelectorAll('[data-role="hit"]').forEach((h) => {
      h.setAttribute('pointer-events', 'none')
    })
  }

  geom.polarity.forEach((lab) => {
    const t = el('text', {
      x: lab.x, y: lab.y,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': 'Arial, Helvetica, sans-serif',
      'font-size': lab.fontSize, 'font-weight': '700',
      fill: 'rgba(17,24,39,0.96)',
      stroke: '#ffffff',
      'stroke-width': Math.max(2.5, lab.fontSize * 0.22),
      'paint-order': 'stroke fill',
      'pointer-events': 'none', 'data-role': 'polarity'
    })
    t.textContent = lab.text
    visuals.append(t)
  })
  geom.annotations.forEach((lab) => {
    const t = el('text', {
      x: lab.x, y: lab.y,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'font-family': 'Arial, Helvetica, sans-serif',
      'font-size': lab.fontSize, 'font-weight': '600',
      fill: attrs.rungColor, 'pointer-events': 'none', 'data-role': 'annotation'
    })
    t.textContent = lab.text
    visuals.append(t)
  })

  // Visuals under spine so the cyan centerline + grips stay on top
  group.insertBefore(visuals, spine || null)
  return true
}

/**
 * Regenerate DNA visuals from attributes / spine path.
 * Keeps the editable spine `<path data-role="spine">` identity when possible
 * so SVGEdit pathedit grips stay attached during live reshape.
 *
 * @param {SVGElement} group
 * @param {object} [overrides]
 * @param {{
 *   preserveSpine?: boolean,
 *   editingSpine?: boolean,
 *   smoothSpine?: boolean,
 *   nextId?: () => string,
 *   touchSpineD?: boolean
 * }} [opts]
 */
export const regenerateDna = (group, overrides = {}, opts = {}) => {
  const attrs = { ...readDnaAttrs(group), ...overrides }
  const smooth = opts.smoothSpine !== false
  attrs.spineD = resolveSpineD(attrs, { smooth: attrs.spineD ? false : smooth })
  writeDnaAttrs(group, attrs)

  const ns = group.namespaceURI
  const doc = group.ownerDocument
  let spine = group.querySelector(':scope > path[data-role="spine"]') ||
    group.querySelector('path[data-role="spine"]')

  rebuildDnaVisuals(group, attrs, attrs.spineD, { editingSpine: !!opts.editingSpine })

  // Re-query — rebuild removes non-spine children but keeps spine
  spine = group.querySelector(':scope > path[data-role="spine"]') ||
    group.querySelector('path[data-role="spine"]')

  const spineD = attrs.spineD
  if (!spine && spineD) {
    spine = doc.createElementNS(ns, 'path')
    if (opts.nextId) spine.setAttribute('id', opts.nextId())
    else spine.setAttribute('id', `dna_spine_${Date.now().toString(36)}`)
    group.append(spine)
  }
  if (spine && spineD) {
    // During live pathedit, never rewrite `d` — pathSegList owns it
    if (opts.touchSpineD !== false) {
      spine.setAttribute('d', spineD)
    }
    styleSpinePath(spine, !!opts.editingSpine)
    group.append(spine)
  }
}

const findDnaGroup = (el) => {
  let cur = el
  while (cur && cur !== cur.ownerSVGElement) {
    if (cur.getAttribute?.('shape') === 'dna') return cur
    cur = cur.parentNode
  }
  return null
}

const snapshotDna = (elem) => {
  const attrs = {}
  ATTR_KEYS.forEach((k) => { attrs[k] = elem.getAttribute(k) })
  return { attrs }
}

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

const readPanelNum = ($id, id, fallback) => {
  const n = Number($id(id)?.value)
  return Number.isFinite(n) ? n : fallback
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
    let drawPoints = []
    let selectingDna = false
    let drawRaf = 0
    let bakingTransform = false
    let regeneratingVisuals = false
    let editingSpineGroup = null
    let spineEditRaf = 0
    let spineEditTrailing = 0
    let spineEditLastAt = 0
    let spineEditLock = false
    let lastLiveSpineD = ''
    let spineEditQueued = false
    let transformRegenRaf = 0
    let transformRegenQueued = false
    let lastTransformKey = ''

    const nextId = () => svgCanvas.getNextId()

    const getSpine = (group) =>
      group?.querySelector?.(':scope > path[data-role="spine"]') ||
      group?.querySelector?.('path[data-role="spine"]')

    /**
     * SVGEdit pathedit grips use path-local coords and ignore parent <g> transform.
     * Bake any group transform into spine `d` + helix geometry so nodes sit on the stroke.
     * LabCanvas: path geometry scales; brush thickness stays constant.
     * @returns {boolean} true if a transform was baked
     */
    const bakeDnaGroupTransform = (group) => {
      if (!group || bakingTransform || regeneratingVisuals) return false
      const tr = group.getAttribute('transform')
      if (!tr || !/\S/.test(tr)) return false

      let ctm = null
      try {
        const list = group.transform?.baseVal
        if (list?.numberOfItems) ctm = list.consolidate()?.matrix || null
      } catch (_) { /* keep null */ }
      if (!ctm) return false

      const spine = getSpine(group)
      const attrs = readDnaAttrs(group)
      let spineD = spine?.getAttribute('d') || attrs.spineD || resolveSpineD(attrs)
      if (!spineD) return false

      bakingTransform = true
      regeneratingVisuals = true
      lastTransformKey = ''
      try {
        if (spine) {
          spine.setAttribute('d', spineD)
          spine.setAttribute('transform', tr)
          group.removeAttribute('transform')
          try {
            svgCanvas.pathActions.resetOrientation(spine)
            spineD = spine.getAttribute('d') || spineD
          } catch (_) {
            const pts = pathDToPolyline(spineD, 12).map((p) => ({
              x: ctm.a * p.x + ctm.c * p.y + ctm.e,
              y: ctm.b * p.x + ctm.d * p.y + ctm.f
            }))
            spineD = pointsToSmoothPathD(pts, {
              minDist: SPINE_MIN_DIST,
              maxPts: SPINE_MAX_POINTS
            })
            group.removeAttribute('transform')
            spine.removeAttribute('transform')
          }
        } else {
          group.removeAttribute('transform')
        }

        const pts = attrs.points || []
        const mappedPts = pts.length
          ? pts.map((p) => ({
            x: ctm.a * p.x + ctm.c * p.y + ctm.e,
            y: ctm.b * p.x + ctm.d * p.y + ctm.f
          }))
          : pathDToPolyline(spineD, 12)

        // Keep thickness unchanged (LabCanvas scaleShape only moves vertices).
        regenerateDna(group, {
          spineD,
          points: mappedPts.length ? mappedPts : attrs.points,
          thickness: attrs.thickness
        }, { nextId })
        group.setAttribute('data-spine-d', spineD)
        svgCanvas.selectorManager.requestSelector(group)?.resize?.()
        return true
      } finally {
        bakingTransform = false
        regeneratingVisuals = false
      }
    }

    /**
     * Live helix reshape while the DNA <g> is moved / resized (LabCanvas-style).
     * Group keeps its SVG transform during drag; helix is recomputed in world space
     * with constant thickness, then mapped back with inverse CTM + stroke compensation.
     */
    const liveRegenFromGroupTransform = (group, { finalQuality = false } = {}) => {
      if (!group || editingSpineGroup || bakingTransform || regeneratingVisuals) return

      const runRebuild = () => {
        transformRegenRaf = 0
        transformRegenQueued = false
        if (editingSpineGroup || bakingTransform || regeneratingVisuals) return
        const tr = group.getAttribute('transform')
        if (!tr || !/\S/.test(tr)) return

        const m = getLocalTransformMatrix(group)
        if (!m) return
        // Rigid move/rotate already looks correct under SVG transform — only
        // rescale/shear needs LabCanvas-style helix reshape (constant thickness).
        const sx = Math.hypot(m.a, m.b)
        const sy = Math.hypot(m.c, m.d)
        if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return

        const key = `${tr}|${finalQuality ? 1 : 0}`
        if (!finalQuality && key === lastTransformKey) return
        lastTransformKey = key

        let inv
        try {
          inv = m.inverse()
        } catch (_) {
          return
        }

        const spine = getSpine(group)
        const attrs = readDnaAttrs(group)
        const localD = spine?.getAttribute('d') || attrs.spineD || resolveSpineD(attrs)
        if (!localD) return

        const sampleSteps = finalQuality ? 10 : 5
        const worldD = transformPathD(localD, m, sampleSteps)
        if (!worldD) return

        const worldGeom = computeDnaGeometry(
          { spineD: worldD, points: attrs.points },
          { ...attrs, livePreview: !finalQuality }
        )
        if (worldGeom.empty) return

        const strokeScale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1
        const mapped = mapGeomByMatrix(worldGeom, inv)
        try {
          rebuildDnaVisuals(group, attrs, localD, {
            livePreview: !finalQuality,
            mappedGeom: mapped,
            strokeScale
          })
        } catch (_) { /* keep transform drag smooth */ }
      }

      const schedule = () => {
        if (transformRegenRaf) {
          transformRegenQueued = true
          return
        }
        transformRegenRaf = requestAnimationFrame(() => {
          runRebuild()
          if (transformRegenQueued) schedule()
        })
      }

      if (finalQuality) {
        if (transformRegenRaf) {
          cancelAnimationFrame(transformRegenRaf)
          transformRegenRaf = 0
        }
        transformRegenQueued = false
        runRebuild()
        return
      }

      schedule()
    }

    const ensureSpine = (group, { editing = false } = {}) => {
      if (!group) return null
      let spine = getSpine(group)
      const attrs = readDnaAttrs(group)
      const spineD = resolveSpineD(attrs)
      if (!spineD && !spine?.getAttribute?.('d')) return null
      if (!spine) {
        regenerateDna(group, { spineD }, { nextId, editingSpine: editing })
        spine = getSpine(group)
      } else if (editing) {
        // Pathedit owns `d` — never rewrite from stored attrs on enter (avoids node jump).
        const liveD = spine.getAttribute('d') || spineD
        if (liveD) group.setAttribute('data-spine-d', liveD)
        styleSpinePath(spine, true)
      } else {
        spine.setAttribute('d', spineD)
        styleSpinePath(spine, editing)
      }
      return spine
    }

    /**
     * Live-update helix from current spine `d` while dragging Bézier grips.
     * Throttled + low-detail preview during drag; full quality on mouse-up.
     */
    const liveRegenFromSpine = (group, spine, { finalQuality = false } = {}) => {
      if (!group || !spine) return

      const runRebuild = () => {
        spineEditRaf = 0
        spineEditQueued = false
        const dNow = spine.getAttribute('d') || ''
        if (!dNow || (!finalQuality && dNow === lastLiveSpineD)) return
        lastLiveSpineD = dNow
        spineEditLastAt = performance.now()
        try {
          const attrs = readDnaAttrs(group)
          attrs.spineD = dNow
          group.setAttribute('data-spine-d', dNow)
          rebuildDnaVisuals(group, attrs, dNow, {
            editingSpine: true,
            livePreview: !finalQuality
          })
        } catch (_) { /* keep spine editable */ }
      }

      const schedule = () => {
        if (spineEditRaf) {
          spineEditQueued = true
          return
        }
        spineEditRaf = requestAnimationFrame(() => {
          runRebuild()
          if (spineEditQueued) schedule()
        })
      }

      if (finalQuality) {
        if (spineEditTrailing) {
          clearTimeout(spineEditTrailing)
          spineEditTrailing = 0
        }
        if (spineEditRaf) {
          cancelAnimationFrame(spineEditRaf)
          spineEditRaf = 0
        }
        spineEditQueued = false
        runRebuild()
        return
      }

      if (LIVE_SPINE_REGEN_MS > 0) {
        const now = performance.now()
        if (now - spineEditLastAt >= LIVE_SPINE_REGEN_MS) {
          if (spineEditTrailing) {
            clearTimeout(spineEditTrailing)
            spineEditTrailing = 0
          }
          schedule()
          return
        }
        if (spineEditTrailing) clearTimeout(spineEditTrailing)
        spineEditTrailing = window.setTimeout(() => {
          spineEditTrailing = 0
          schedule()
        }, LIVE_SPINE_REGEN_MS)
        return
      }

      schedule()
    }

    const unwatchSpine = () => {
      if (spineEditTrailing) {
        clearTimeout(spineEditTrailing)
        spineEditTrailing = 0
      }
      if (spineEditRaf) {
        cancelAnimationFrame(spineEditRaf)
        spineEditRaf = 0
      }
      lastLiveSpineD = ''
    }

    const cancelTransformRegen = () => {
      if (transformRegenRaf) {
        cancelAnimationFrame(transformRegenRaf)
        transformRegenRaf = 0
      }
      transformRegenQueued = false
      lastTransformKey = ''
    }

    /** Snapshot spine `d` when entering pathedit (regen driven by mouseMove + elementChanged). */
    const watchSpine = (group, spine) => {
      unwatchSpine()
      if (!group || !spine) return
      lastLiveSpineD = spine.getAttribute('d') || ''
    }

    const beginSpineEdit = (group) => {
      // Pathedit node grips ignore parent <g transform> — bake first.
      bakeDnaGroupTransform(group)
      const spine = ensureSpine(group, { editing: true })
      if (!spine) return false
      spineEditLock = true
      editingSpineGroup = group
      try {
        const vis = group.querySelector('[data-role="dna-visuals"]')
        if (vis) {
          vis.setAttribute('opacity', '0.7')
          vis.querySelectorAll('[data-role="hit"]').forEach((h) => {
            h.setAttribute('pointer-events', 'none')
          })
        }
        styleSpinePath(spine, true)
        svgCanvas.clearSelection()
        svgCanvas.pathActions.toEditMode(spine)
        watchSpine(group, spine)
      } finally {
        spineEditLock = false
      }
      return true
    }

    const endSpineEdit = (group) => {
      const g = group || editingSpineGroup
      unwatchSpine()
      editingSpineGroup = null
      if (!g) return
      const spine = getSpine(g)
      if (spine) {
        const d = spine.getAttribute('d') || ''
        if (d) g.setAttribute('data-spine-d', d)
        styleSpinePath(spine, false)
      }
      const vis = g.querySelector('[data-role="dna-visuals"]')
      if (vis) vis.removeAttribute('opacity')
      regeneratingVisuals = true
      try {
        regenerateDna(g, {}, { preserveSpine: true, nextId, editingSpine: false })
      } finally {
        regeneratingVisuals = false
      }
    }

    class DnaChangeCommand extends Command {
      constructor (elem, oldSnapshot, newSnapshot) {
        super()
        this.elem = elem
        this.oldSnapshot = oldSnapshot
        this.newSnapshot = newSnapshot
        this.text = 'Change DNA Helix'
      }

      restore (snap) {
        Object.entries(snap.attrs).forEach(([key, value]) => {
          if (value === null || value === undefined) this.elem.removeAttribute(key)
          else this.elem.setAttribute(key, value)
        })
        regenerateDna(this.elem, {}, { nextId: () => svgCanvas.getNextId() })
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
      const panel = $id('dna_panel')
      if (!panel) return
      if (on) panel.style.removeProperty('display')
      else panel.style.display = 'none'
    }

    const openDnaPanel = () => {
      showPanel(true)
      svgEditor.rightPanel?.switchTab('properties')
    }

    const syncPanelFromElem = (elem) => {
      if (!elem) return
      const a = readDnaAttrs(elem)
      const set = (id, val) => { const el = $id(id); if (el) el.value = val }
      const setChecked = (id, on) => {
        const el = $id(id)
        if (el) {
          if ('checked' in el) el.checked = on
          else el.setAttribute('value', on ? '1' : '0')
        }
      }
      set('dnaThickness', a.thickness)
      set('dnaStyleMode', a.styleMode)
      set('dnaStrandColor', a.strandColor)
      set('dnaRungColor', a.rungColor)
      set('dnaBasePairMode', a.basePairMode)
      set('dnaColorAT', a.basePairColorAT)
      set('dnaColorGC', a.basePairColorGC)
      set('dnaHistoneEvery', a.histoneEveryBp)
      set('dnaAnnotationEvery', a.annotationEveryBp)
      setChecked('dnaSingleStrand', a.singleStrandOnly)
      setChecked('dnaShowBasePairs', a.showBasePairs)
      setChecked('dnaShowPolarity', a.showDirectionality)
      setChecked('dnaShowHistones', a.showHistones)
    }

    const readPanelParams = () => {
      const checked = (id, fallback) => {
        const el = $id(id)
        if (!el) return fallback
        if ('checked' in el) return !!el.checked
        return el.value === '1' || el.value === 'true'
      }
      return {
        thickness: readPanelNum($id, 'dnaThickness', DEFAULTS.thickness),
        styleMode: $id('dnaStyleMode')?.value || DEFAULTS.styleMode,
        strandColor: $id('dnaStrandColor')?.value || DEFAULTS.strandColor,
        rungColor: $id('dnaRungColor')?.value || DEFAULTS.rungColor,
        basePairMode: $id('dnaBasePairMode')?.value || DEFAULTS.basePairMode,
        basePairColorAT: $id('dnaColorAT')?.value || DEFAULTS.basePairColorAT,
        basePairColorGC: $id('dnaColorGC')?.value || DEFAULTS.basePairColorGC,
        singleStrandOnly: checked('dnaSingleStrand', false),
        showBasePairs: checked('dnaShowBasePairs', true),
        showDirectionality: checked('dnaShowPolarity', false),
        showHistones: checked('dnaShowHistones', false),
        histoneEveryBp: readPanelNum($id, 'dnaHistoneEvery', DEFAULTS.histoneEveryBp),
        annotationEveryBp: readPanelNum($id, 'dnaAnnotationEvery', 0)
      }
    }

    const applyFromPanel = ({ history = true, undoSnap = null } = {}) => {
      let i = selElems?.length || 0
      while (i--) {
        const elem = findDnaGroup(selElems[i])
        if (!elem) continue
        const oldSnapshot = undoSnap || snapshotDna(elem)
        regenerateDna(elem, readPanelParams(), { nextId })
        if (history) {
          addToHistory(new DnaChangeCommand(elem, oldSnapshot, snapshotDna(elem)))
        }
        svgCanvas.call('changed', [elem])
      }
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const title = `${name}:buttons.0.title`
        svgCanvas.insertChildAtIndex($id('tools_left'), `
          <se-button id="tool_dna" title="${title}" src="dna.svg"></se-button>
        `, 13)

        $click($id('tool_dna'), () => {
          if (this.leftPanel.updateLeftPanel('tool_dna')) {
            svgCanvas.setMode(MODE)
            openDnaPanel()
          }
        })

        const labels = {
          panelTitle: 'DNA brush',
          style: 'Style',
          thickness: 'Thickness',
          strand: 'Strand color',
          rung: 'Base-pair color',
          mode: 'Base-pair mode',
          showBp: 'Show base pairs',
          single: 'Single strand',
          polarity: "5′ / 3′ polarity",
          histones: 'Show histones',
          histoneEvery: 'Histone spacing',
          annotations: 'Sequence labels'
        }
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="dna_panel" class="dna_panel extension_panel right_panel_section" style="display:none">
            <div class="extension_panel_heading">${labels.panelTitle}</div>
            <label class="dna_field"><span>${labels.style}</span>
              <select id="dnaStyleMode">
                <option value="cartoon">Cartoon</option>
                <option value="molecular">Molecular</option>
              </select>
            </label>
            <se-range-input id="dnaThickness" label="${labels.thickness}" min="0.5" max="2.4" step="0.1" value="${DEFAULTS.thickness}" title="Helix thickness (scales radius &amp; spacing)" decimals="1"></se-range-input>
            <label class="dna_field"><span>${labels.strand}</span>
              <input id="dnaStrandColor" type="color" value="#2563eb"/>
            </label>
            <label class="dna_field"><span>${labels.rung}</span>
              <input id="dnaRungColor" type="color" value="#f59e0b"/>
            </label>
            <label class="dna_field"><span>${labels.mode}</span>
              <select id="dnaBasePairMode">
                <option value="mono">Mono</option>
                <option value="at-gc">A-T / G-C</option>
              </select>
            </label>
            <label class="dna_field"><span>A-T color</span>
              <input id="dnaColorAT" type="color" value="#3b82f6"/>
            </label>
            <label class="dna_field"><span>G-C color</span>
              <input id="dnaColorGC" type="color" value="#ef4444"/>
            </label>
            <label class="dna_check"><input type="checkbox" id="dnaShowBasePairs" checked/> ${labels.showBp}</label>
            <label class="dna_check"><input type="checkbox" id="dnaSingleStrand"/> ${labels.single}</label>
            <label class="dna_check"><input type="checkbox" id="dnaShowPolarity"/> ${labels.polarity}</label>
            <label class="dna_check"><input type="checkbox" id="dnaShowHistones"/> ${labels.histones}</label>
            <label class="dna_field"><span>${labels.histoneEvery}</span>
              <select id="dnaHistoneEvery">
                <option value="30">30 bp</option>
                <option value="60" selected>60 bp</option>
                <option value="90">90 bp</option>
              </select>
            </label>
            <label class="dna_field"><span>${labels.annotations}</span>
              <select id="dnaAnnotationEvery">
                <option value="0" selected>Off</option>
                <option value="10">Every 10 bp</option>
                <option value="20">Every 20 bp</option>
                <option value="50">Every 50 bp</option>
              </select>
            </label>
            <p class="dna_hint">Double-click the helix to edit the centerline (Bézier nodes).</p>
            <style>
              #dna_panel .dna_field { display:flex; justify-content:space-between; align-items:center; gap:8px; margin:6px 0; font-size:12px; color:var(--text-color,#e2e8f0); }
              #dna_panel .dna_field select, #dna_panel .dna_field input[type=color] { max-width:120px; }
              #dna_panel .dna_check { display:flex; align-items:center; gap:8px; margin:6px 0; font-size:12px; color:var(--text-color,#e2e8f0); }
              #dna_panel .dna_hint { margin:10px 0 4px; font-size:11px; line-height:1.35; color:var(--text-color,#94a3b8); opacity:0.9; }
            </style>
          </div>
        `
        $id('right_properties_extensions').appendChild(panelTemplate.content.cloneNode(true))
        showPanel(false)

        // Double-click DNA → normal SVGEdit path/Bézier edit on the centerline
        const canvasRoot = $id('svgcanvas') || document.getElementById('svgcanvas')
        canvasRoot?.addEventListener('dblclick', (evt) => {
          if (svgCanvas.getMode() === MODE) return
          const dna = findDnaGroup(evt.target)
          if (!dna) return
          // Ignore dblclick on path grips / selector chrome
          if (evt.target?.closest?.('#selectorParentGroup')) return
          evt.stopImmediatePropagation()
          evt.stopPropagation()
          evt.preventDefault()
          beginSpineEdit(dna)
          syncPanelFromElem(dna)
          openDnaPanel()
        }, true)

        let dragSnap = null
        const bindChange = (id) => {
          const el = $id(id)
          if (!el) return
          el.addEventListener('mousedown', () => {
            const elem = findDnaGroup(selElems?.[0])
            if (elem) dragSnap = snapshotDna(elem)
          })
          el.addEventListener('input', () => applyFromPanel({ history: false }))
          el.addEventListener('change', () => {
            applyFromPanel({ history: true, undoSnap: dragSnap })
            dragSnap = null
          })
        }
        ;[
          'dnaThickness', 'dnaStyleMode', 'dnaStrandColor', 'dnaRungColor',
          'dnaBasePairMode', 'dnaColorAT', 'dnaColorGC',
          'dnaShowBasePairs', 'dnaSingleStrand', 'dnaShowPolarity',
          'dnaShowHistones', 'dnaHistoneEvery', 'dnaAnnotationEvery'
        ].forEach(bindChange)
      },

      mouseDown (opts) {
        if (svgCanvas.getMode() !== MODE) return undefined
        const zoom = svgCanvas.getZoom() || 1
        const x = opts.start_x
        const y = opts.start_y
        const params = readPanelParams()
        started = true
        drawPoints = [{ x, y }]
        newFO = svgCanvas.addSVGElementsFromJson({
          element: 'g',
          attr: {
            id: svgCanvas.getNextId(),
            shape: 'dna',
            style: 'pointer-events:visiblePainted',
            'data-points': serializePoints(drawPoints),
            'data-thickness': params.thickness,
            'data-style-mode': params.styleMode,
            'data-strand-color': params.strandColor,
            'data-rung-color': params.rungColor,
            'data-base-pair-mode': params.basePairMode,
            'data-base-pair-color-at': params.basePairColorAT,
            'data-base-pair-color-gc': params.basePairColorGC,
            'data-single-strand': String(!!params.singleStrandOnly),
            'data-show-base-pairs': String(!!params.showBasePairs),
            'data-show-directionality': String(!!params.showDirectionality),
            'data-show-histones': String(!!params.showHistones),
            'data-histone-every': String(params.histoneEveryBp),
            'data-annotation-every': String(params.annotationEveryBp),
            'data-annotation-start': '1'
          }
        })
        regenerateDna(newFO, {}, { nextId, smoothSpine: false })
        // silence unused zoom lint in some envs
        void zoom
        return { started: true }
      },

      mouseMove (opts) {
        // Realtime helix while editing spine nodes / Bézier handles
        if (svgCanvas.getCurrentMode() === 'pathedit') {
          const pathObj = svgCanvas.getPathObj?.()
          const pathElem = pathObj?.elem
          if (pathElem?.getAttribute?.('data-role') === 'spine') {
            const group = findDnaGroup(pathElem) || editingSpineGroup
            if (group) {
              if (!editingSpineGroup) editingSpineGroup = group
              liveRegenFromSpine(group, pathElem)
            }
            return undefined
          }
        }

        if (!started || svgCanvas.getMode() !== MODE || !newFO) return undefined
        const zoom = svgCanvas.getZoom() || 1
        const x = opts.mouse_x / zoom
        const y = opts.mouse_y / zoom
        const last = drawPoints[drawPoints.length - 1]
        if (!last || Math.hypot(x - last.x, y - last.y) < DRAW_SAMPLE_MIN) {
          return { started: true }
        }
        drawPoints.push({ x, y })
        // Throttle live preview — full regen on mouseUp
        if (!drawRaf) {
          drawRaf = requestAnimationFrame(() => {
            drawRaf = 0
            if (newFO && drawPoints.length) {
              regenerateDna(newFO, {
                points: drawPoints,
                spineD: pointsToPathD(drawPoints),
                ...readPanelParams()
              }, { nextId, smoothSpine: false })
            }
          })
        }
        return { started: true }
      },

      mouseUp (opts) {
        if (svgCanvas.getMode() !== MODE || !newFO) return undefined
        const zoom = svgCanvas.getZoom() || 1
        if (opts?.mouse_x != null) {
          const x = opts.mouse_x / zoom
          const y = opts.mouse_y / zoom
          const last = drawPoints[drawPoints.length - 1]
          if (!last || Math.hypot(x - last.x, y - last.y) >= 2) {
            drawPoints.push({ x, y })
          }
        }
        // Need a usable stroke length (LabCanvas freehand)
        let len = 0
        for (let i = 1; i < drawPoints.length; i++) {
          len += Math.hypot(drawPoints[i].x - drawPoints[i - 1].x, drawPoints[i].y - drawPoints[i - 1].y)
        }
        const keep = len > 24 && drawPoints.length >= 2
        if (keep) {
          const simplified = simplifyPoints(drawPoints, SPINE_MIN_DIST)
          const spineD = pointsToSmoothPathD(simplified, {
            minDist: SPINE_MIN_DIST,
            maxPts: SPINE_MAX_POINTS
          })
          regenerateDna(newFO, {
            points: simplified,
            spineD,
            ...readPanelParams()
          }, { nextId, smoothSpine: false })
        }
        const element = newFO
        started = false
        newFO = null
        drawPoints = []
        return { keep, element }
      },

      selectedChanged (opts) {
        if (selectingDna || spineEditLock) return
        selElems = opts.elems
        const el0 = selElems?.[0]

        // Leaving spine Bézier edit → sync + reselect DNA group
        if (editingSpineGroup) {
          const inPathEdit = svgCanvas.getCurrentMode() === 'pathedit'
          const stillOnSpine = el0?.getAttribute?.('data-role') === 'spine' &&
            findDnaGroup(el0) === editingSpineGroup
          if (inPathEdit && (stillOnSpine || !el0)) {
            syncPanelFromElem(editingSpineGroup)
            openDnaPanel()
            return
          }
          if (!inPathEdit) {
            const g = editingSpineGroup
            endSpineEdit(g)
            selectingDna = true
            svgCanvas.selectOnly([g], true)
            selectingDna = false
            selElems = [g]
            syncPanelFromElem(g)
            openDnaPanel()
            return
          }
        }

        if (!selElems?.length) {
          showPanel(false)
          return
        }
        const dna = findDnaGroup(el0)
        if (dna && opts.selectedElement && !opts.multiselected) {
          if (el0 !== dna && el0?.getAttribute?.('data-role') !== 'spine') {
            selectingDna = true
            svgCanvas.selectOnly([dna], true)
            selectingDna = false
            selElems = [dna]
          }
          syncPanelFromElem(dna)
          openDnaPanel()
        } else if (svgCanvas.getMode() !== MODE) {
          showPanel(false)
        }
      },

      /**
       * Live reshape helix while DNA group is moved / resized (LabCanvas-style).
       */
      elementTransition (opts) {
        if (bakingTransform || regeneratingVisuals || editingSpineGroup) return
        const elems = opts.elems || []
        for (let i = 0; i < elems.length; i++) {
          const el = elems[i]
          if (!el) continue
          const group = findDnaGroup(el)
          if (group && group === el) {
            liveRegenFromGroupTransform(group)
          }
        }
      },

      /**
       * Spine path edits: live-regenerate helix.
       * Group move/resize: bake transform into spine `d` (and points).
       */
      elementChanged (opts) {
        if (bakingTransform || regeneratingVisuals) return
        const el = opts.elems?.[0]
        if (!el) return

        // Spine commit (mouse-up after node drag) — final sync
        if (el.getAttribute?.('data-role') === 'spine') {
          const group = findDnaGroup(el)
          if (group) {
            liveRegenFromSpine(group, el, { finalQuality: true })
            const d = el.getAttribute('d') || ''
            if (d) group.setAttribute('data-spine-d', d)
          }
          return
        }

        const group = findDnaGroup(el)
        if (!group || editingSpineGroup) return
        cancelTransformRegen()
        if (bakeDnaGroupTransform(group)) {
          syncPanelFromElem(group)
        }
      }
    }
  }
}
