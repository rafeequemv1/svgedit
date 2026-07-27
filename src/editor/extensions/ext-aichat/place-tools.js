/**
 * Programmatic placement of SVGEdit specialty brushes for AI chat.
 * Uses real extension regen functions (editable via Properties panels).
 */

import { regenerateDna } from '../ext-dna/ext-dna.js'
import { regenerateBilayer } from '../ext-lipidbilayer/ext-lipidbilayer.js'
import { regenerateHydrogel } from '../ext-hydrogel/ext-hydrogel.js'
import { regenerateNanoparticle } from '../ext-nanoparticle/ext-nanoparticle.js'
import { regenerateCube } from '../ext-cube3d/ext-cube3d.js'
import { getCurvedArrowGeometry, getMidPointFromBend, defaultBend } from '../ext-curvedarrow/arc-math.js'

/** @type {Array<{id:string, mode:string, label:string, hint:string}>} */
export const EDITOR_TOOLS = [
  { id: 'tool_select', mode: 'select', label: 'Select', hint: 'Move / resize / rotate selection' },
  { id: 'tool_fhpath', mode: 'fhpath', label: 'Pencil', hint: 'Freehand strokes' },
  { id: 'tool_line', mode: 'line', label: 'Line', hint: 'Straight segments' },
  { id: 'tool_path', mode: 'path', label: 'Path', hint: 'Bézier paths' },
  { id: 'tool_rect', mode: 'rect', label: 'Rectangle', hint: 'Rects and squares' },
  { id: 'tool_ellipse', mode: 'ellipse', label: 'Ellipse', hint: 'Ellipses and circles' },
  { id: 'tool_text', mode: 'text', label: 'Text', hint: 'Labels and captions' },
  { id: 'tool_image', mode: 'image', label: 'Image', hint: 'Place raster images' },
  { id: 'tool_dna', mode: 'dna', label: 'DNA helix brush', hint: 'Real B-DNA double helix along a path — prefer over hand-drawn SVG DNA' },
  { id: 'tool_hydrogel', mode: 'hydrogel', label: 'Hydrogel brush', hint: 'Polymer mesh / hydrogel network in a region' },
  { id: 'tool_lipidbilayer', mode: 'lipidbilayer', label: 'Lipid bilayer', hint: 'Membrane cross-section along a line' },
  { id: 'tool_nanoparticle', mode: 'nanoparticle', label: 'Nanoparticle', hint: 'Hex-packed particle disk' },
  { id: 'tool_cube3d', mode: 'cube3d', label: '3D cube', hint: 'Perspective cube' },
  { id: 'tool_curvedarrow', mode: 'curvedarrow', label: 'Curved arrow', hint: 'Pathway / mechanism arrows' },
  { id: 'tool_star', mode: 'star', label: 'Star', hint: 'Star polygon' },
  { id: 'tool_polygon', mode: 'polygon', label: 'Polygon', hint: 'Regular polygon' },
  { id: 'tool_shapelib', mode: 'shapelib', label: 'Shapes library', hint: 'Preset icon packs (flowchart, math, etc.)' },
  { id: 'tool_connect', mode: 'connector', label: 'Connector', hint: 'Smart connectors between shapes' },
  { id: 'tool_eyedropper', mode: 'eyedropper', label: 'Eyedropper', hint: 'Sample colors' },
  { id: 'tool_pathfinder_union', mode: null, label: 'Pathfinder unite', hint: 'Boolean on 2+ selected shapes' },
  { id: 'tool_aichat', mode: null, label: 'AI Chat', hint: 'This panel' }
]

/**
 * Prompt section listing real editor tools for the model.
 * @param {{ useBrushes?: boolean }} [opts]
 */
export function buildEditorToolsPromptSection (opts = {}) {
  const useBrushes = opts.useBrushes === true
  const w = opts.w ?? 640
  const h = opts.h ?? 480
  const lines = [
    '# SVGEdit tools',
    useBrushes
      ? '**Generative brushes ON** — you orchestrate real toolbar brushes via a ```tools JSON block; the host places them, then applies your SVG. Combine brushes + SVG for hybrid figures (e.g. nanoparticle brush + SVG ligands).'
      : '**Generative brushes OFF** — draw everything yourself in SVG. Do not emit ```tools``` blocks or rely on host brush placement.',
    'You know every left-toolbar tool:',
    ''
  ]
  EDITOR_TOOLS.forEach((t) => {
    lines.push(`- ${t.label} (\`${t.id}\`, mode: ${t.mode || 'n/a'}): ${t.hint}`)
  })
  if (useBrushes) {
    lines.push(
      '',
      '## Generative brushes workflow (brushes ON)',
      '1. Decide which motifs need a **real brush** (DNA helix, nanoparticle cluster, hydrogel mesh, lipid bilayer, curved arrow, 3D cube).',
      '2. Emit a ```tools fence with a JSON array FIRST (before ```svg). The host places these on canvas.',
      '3. Emit ```svg with ONLY what brushes cannot do: ligands, labels, arrows, boxes, small molecules, captions, extra decoration.',
      '4. Do NOT redraw brush motifs as plain SVG when you listed them in ```tools.',
      '',
      '### ```tools JSON schema (canvas ' + w + '×' + h + ')',
      '```tools',
      '[',
      '  {"tool":"nanoparticle","cx":' + Math.round(w / 2) + ',"cy":' + Math.round(h * 0.55) + ',"radius":110,"particleRadius":5,"spacing":12},',
      '  {"tool":"dna","points":[{"x":80,"y":' + Math.round(h / 2) + '},{"x":' + (w - 80) + ',"y":' + Math.round(h / 2 - 40) + '}],"thickness":1.1,"strandColor":"#2563eb"},',
      '  {"tool":"lipidbilayer","x1":60,"y1":' + Math.round(h / 2) + ',"x2":' + (w - 60) + ',"y2":' + Math.round(h / 2) + '},',
      '  {"tool":"hydrogel","x":40,"y":60,"w":' + (w - 80) + ',"h":' + (h - 100) + ',"density":0.55},',
      '  {"tool":"curvedarrow","ax":100,"ay":200,"cx":400,"cy":180,"stroke":"#333"}',
      ']',
      '```',
      '',
      '### Hybrid example — “big nanoparticle with ligands”',
      '- ```tools`: one `nanoparticle` with larger `radius` (e.g. 100–140) centered where the core should sit.',
      '- ```svg`: draw ligands as short cubic `<path>` arms, linker lines, and functional groups **around** that center — do not draw the particle core as circles.',
      '',
      '### Plasmid / circular DNA',
      '- Use `dna` with `points` forming a circle (many `{x,y}` on a ring, or host accepts circular path via points).',
      '- SVG: gene labels, leader lines, colored arc annotations **outside** the ring only.',
      '',
      '### When NOT to use ```tools',
      '- Simple diagrams with no specialty brushes, pure flowcharts, icons, or when brushes OFF.',
      '- User only wants to **activate** a tool to draw manually → say “Click DNA helix in the toolbar” (no ```tools).'
    )
  } else {
    lines.push(
      '',
      '## Drawing specialty motifs (brushes OFF)',
      '- DNA / helix: two smooth cubic `<path>` strands + short rung segments.',
      '- Nanoparticle: circles or hex grid in SVG.',
      '- Membrane / hydrogel: simplified cartoon SVG.',
      '- Smooth curves: `<path d="M… C…">` cubic Bézier — never `<polyline>`.'
    )
  }
  return lines.join('\n')
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} [segments]
 */
export function circularPoints (cx, cy, radius, segments = 56) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2 - Math.PI / 2
    pts.push({ x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) })
  }
  return pts
}

/**
 * @param {number} w
 * @param {number} h
 * @param {number} [amp]
 */
export function sinusoidPoints (w, h, amp = 50) {
  const pts = []
  const y0 = h / 2
  for (let i = 0; i <= 28; i++) {
    pts.push({ x: 60 + i * ((w - 120) / 28), y: y0 + Math.sin(i * 0.45) * amp })
  }
  return pts
}

/**
 * Only handle explicit “activate/switch to tool” requests — not keyword auto-placement.
 * @param {string} prompt
 */
export function resolveToolActivateRequest (prompt) {
  const text = String(prompt || '')
  if (/\b(just|only)\s+(open|activate|use|switch)\b.*\b(dna|helix|nanoparticle|hydrogel|bilayer|membrane)\b.*\b(tool|brush)\b/i.test(text) ||
      /\bswitch to (the )?(dna|nanoparticle|hydrogel|lipid|bilayer)\b/i.test(text)) {
    let toolId = 'tool_dna'
    let mode = 'dna'
    if (/\bnanoparticle\b/i.test(text)) {
      toolId = 'tool_nanoparticle'
      mode = 'nanoparticle'
    } else if (/\bhydrogel\b/i.test(text)) {
      toolId = 'tool_hydrogel'
      mode = 'hydrogel'
    } else if (/\b(bilayer|membrane|lipid)\b/i.test(text)) {
      toolId = 'tool_lipidbilayer'
      mode = 'lipidbilayer'
    }
    return {
      activate: { toolId, mode },
      note: `${mode} tool activated — drag on the canvas to draw.`
    }
  }
  return { activate: null, note: '' }
}

/**
 * @param {string} prompt
 * @param {{w:number,h:number}} [_canvasSize]
 */
export function resolveToolPlan (prompt, _canvasSize = { w: 640, h: 480 }) {
  const { activate, note } = resolveToolActivateRequest(prompt)
  return { placements: [], svgHint: '', activate, note }
}

/**
 * Fill in canvas defaults for AI ```tools specs.
 * @param {object[]} specs
 * @param {{w:number,h:number}} canvasSize
 */
export function normalizeToolSpecs (specs, canvasSize = { w: 640, h: 480 }) {
  const w = canvasSize.w || 640
  const h = canvasSize.h || 480
  const cx = w / 2
  const cy = h / 2
  return (specs || []).map((spec) => {
    const tool = String(spec.tool || '').toLowerCase()
    const out = { ...spec, tool }
    if (tool === 'nanoparticle') {
      out.cx = Number(spec.cx ?? cx)
      out.cy = Number(spec.cy ?? cy)
      out.radius = Number(spec.radius ?? Math.min(w, h) * 0.18)
      if (spec.particleRadius != null) out.particleRadius = Number(spec.particleRadius)
      if (spec.spacing != null) out.spacing = Number(spec.spacing)
    }
    if (tool === 'dna' && (!spec.points || spec.points.length < 2)) {
      out.points = sinusoidPoints(w, h)
    }
    if (tool === 'hydrogel') {
      const pad = 40
      out.x = Number(spec.x ?? pad)
      out.y = Number(spec.y ?? pad + 40)
      out.w = Number(spec.w ?? w - pad * 2)
      out.h = Number(spec.h ?? h - pad * 2 - 40)
    }
    if (tool === 'lipidbilayer') {
      out.x1 = Number(spec.x1 ?? 80)
      out.y1 = Number(spec.y1 ?? cy)
      out.x2 = Number(spec.x2 ?? w - 80)
      out.y2 = Number(spec.y2 ?? cy)
    }
    return out
  })
}

/**
 * @param {Element[]} placed
 * @param {object[]} specs
 */
export function formatBrushPlacementNote (placed, specs) {
  if (!placed?.length) return ''
  const names = specs.map((s) => String(s.tool || 'brush')).join(', ')
  return `Placed ${placed.length} generative brush object(s): ${names}.`
}

/**
 * @param {string} text
 * @returns {object[]}
 */
export function parseToolsBlockFromReply (text) {
  if (!text) return []
  const specs = []
  const re = /```tools?\s*([\s\S]*?)```/gi
  let m
  while ((m = re.exec(text))) {
    try {
      const parsed = JSON.parse(m[1].trim())
      const arr = Array.isArray(parsed) ? parsed : (parsed?.tools || [])
      if (Array.isArray(arr)) specs.push(...arr)
    } catch { /* skip bad block */ }
  }
  return specs
}

/**
 * @param {object} svgEditor
 * @param {string} toolId
 * @param {string} mode
 */
export function activateEditorTool (svgEditor, toolId, mode) {
  if (!toolId || !mode) return false
  try {
    svgEditor.leftPanel?.updateLeftPanel?.(toolId)
    svgEditor.svgCanvas?.setMode?.(mode)
    return true
  } catch {
    return false
  }
}

function rebuildCurvedArrow (group, a, b, c) {
  const stroke = group.getAttribute('stroke') || '#000000'
  const strokeWidth = Number(group.getAttribute('stroke-width') || 2)
  const geom = getCurvedArrowGeometry(a, b, c, strokeWidth)
  while (group.firstChild) group.firstChild.remove()
  if (geom.length < 0.5) return
  const ns = group.namespaceURI
  const shaft = group.ownerDocument.createElementNS(ns, 'path')
  shaft.setAttribute('d', geom.shaftD)
  shaft.setAttribute('fill', 'none')
  shaft.setAttribute('stroke', stroke)
  shaft.setAttribute('stroke-width', String(strokeWidth))
  shaft.setAttribute('stroke-linecap', 'butt')
  shaft.setAttribute('data-role', 'shaft')
  group.append(shaft)
  if (geom.headPoints) {
    const head = group.ownerDocument.createElementNS(ns, 'polygon')
    head.setAttribute('points', geom.headPoints)
    head.setAttribute('fill', stroke)
    head.setAttribute('data-role', 'head')
    group.append(head)
  }
}

/**
 * @param {object} svgEditor
 * @param {object} spec
 * @returns {Element|null}
 */
function placeOneTool (svgEditor, spec) {
  const { svgCanvas } = svgEditor
  if (!svgCanvas.getCurrentGroup?.() && !svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()) {
    return null
  }

  const tool = String(spec.tool || '').toLowerCase()

  if (tool === 'dna') {
    const points = spec.points || sinusoidPoints(640, 480)
    const g = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: {
        id: svgCanvas.getNextId(),
        shape: 'dna',
        'data-points': JSON.stringify(points),
        'data-thickness': String(spec.thickness ?? 1),
        'data-style-mode': spec.styleMode || 'cartoon',
        'data-strand-color': spec.strandColor || '#2563eb',
        'data-rung-color': spec.rungColor || '#f59e0b',
        'data-base-pair-mode': spec.basePairMode || 'mono',
        'data-show-base-pairs': spec.showBasePairs !== false ? 'true' : 'false',
        'data-show-directionality': spec.showDirectionality ? 'true' : 'false',
        'data-show-histones': 'false',
        style: 'pointer-events:visiblePainted'
      }
    })
    regenerateDna(g)
    return g
  }

  if (tool === 'lipidbilayer') {
    const g = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: {
        id: svgCanvas.getNextId(),
        shape: 'lipidbilayer',
        'data-x1': spec.x1 ?? 80,
        'data-y1': spec.y1 ?? 240,
        'data-x2': spec.x2 ?? 560,
        'data-y2': spec.y2 ?? 240,
        fill: '#e8a838',
        stroke: '#555555',
        'stroke-width': 1.2,
        style: 'pointer-events:visiblePainted'
      }
    })
    regenerateBilayer(g)
    return g
  }

  if (tool === 'hydrogel') {
    const g = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: {
        id: svgCanvas.getNextId(),
        shape: 'hydrogel',
        'data-x': spec.x ?? 40,
        'data-y': spec.y ?? 80,
        'data-w': spec.w ?? 560,
        'data-h': spec.h ?? 360,
        'data-seed': spec.seed ?? Date.now(),
        'data-shape': 'rect',
        'data-density': spec.density ?? 0.55,
        'data-chain-length': spec.chainLength ?? 48,
        style: 'pointer-events:visiblePainted'
      }
    })
    regenerateHydrogel(g)
    return g
  }

  if (tool === 'nanoparticle') {
    const attrs = {
      id: svgCanvas.getNextId(),
      shape: 'nanoparticle',
      'data-cx': spec.cx ?? 320,
      'data-cy': spec.cy ?? 240,
      'data-radius': spec.radius ?? 90,
      fill: spec.fill || '#f9bc01',
      stroke: spec.stroke || '#333333',
      'stroke-width': spec.strokeWidth ?? 0.8,
      style: 'pointer-events:visiblePainted'
    }
    if (spec.spacing != null) attrs['data-spacing'] = String(spec.spacing)
    if (spec.particleRadius != null) attrs['data-particle-radius'] = String(spec.particleRadius)
    const g = svgCanvas.addSVGElementsFromJson({ element: 'g', attr: attrs })
    regenerateNanoparticle(g)
    return g
  }

  if (tool === 'cube3d') {
    const g = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: {
        id: svgCanvas.getNextId(),
        shape: 'cube3d',
        'data-cx': spec.cx ?? 320,
        'data-cy': spec.cy ?? 240,
        'data-size': spec.size ?? 80,
        style: 'pointer-events:visiblePainted'
      }
    })
    regenerateCube(g)
    return g
  }

  if (tool === 'curvedarrow') {
    const a = { x: spec.ax ?? 100, y: spec.ay ?? 200 }
    const c = { x: spec.cx ?? 400, y: spec.cy ?? 200 }
    const bend = spec.bend ?? defaultBend(Math.hypot(c.x - a.x, c.y - a.y))
    const b = getMidPointFromBend(a, c, bend)
    const g = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: {
        id: svgCanvas.getNextId(),
        shape: 'curvedarrow',
        stroke: spec.stroke || '#333',
        'stroke-width': spec.strokeWidth ?? 2,
        style: 'pointer-events:visiblePainted'
      }
    })
    rebuildCurvedArrow(g, a, b, c)
    return g
  }

  if (tool === 'activate' && spec.id) {
    const meta = EDITOR_TOOLS.find((t) => t.id === spec.id)
    if (meta?.mode) activateEditorTool(svgEditor, meta.id, meta.mode)
  }

  return null
}

/**
 * @param {object} svgEditor
 * @param {object[]} specs
 * @returns {Element[]}
 */
export function placeToolsOnCanvas (svgEditor, specs) {
  if (!specs?.length) return []
  const { svgCanvas } = svgEditor
  const placed = []
  for (const spec of specs) {
    const el = placeOneTool(svgEditor, spec)
    if (el) placed.push(el)
  }
  if (placed.length) {
    svgCanvas.selectOnly?.(placed, true)
    svgCanvas.call?.('changed', placed)
    svgEditor.updateCanvas?.(false)
  }
  return placed
}
