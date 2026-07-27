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
 */
export function buildEditorToolsPromptSection () {
  const lines = [
    '# SVGEdit tools (REAL — use these instead of faking with raw SVG when possible)',
    'The host app can place live brush objects (editable in Properties). You know every left-toolbar tool:',
    ''
  ]
  EDITOR_TOOLS.forEach((t) => {
    lines.push(`- ${t.label} (\`${t.id}\`, mode: ${t.mode || 'n/a'}): ${t.hint}`)
  })
  lines.push(
    '',
    '## When user asks for DNA / plasmid / membrane / hydrogel / nanoparticle',
    '- DNA helix / plasmid ring / "with DNA brush": host places **real DNA brush** (\`shape="dna"\`). Do NOT redraw helix as plain SVG paths.',
    '- Plasmid vector map: host places circular DNA ring first; you add ONLY labels, leader lines, and colored arc annotations outside the ring.',
    '- Lipid bilayer / membrane: host can place \`shape="lipidbilayer"\` — do not fake with circles only.',
    '- Hydrogel mesh: host places \`shape="hydrogel"\`.',
    '- Nanoparticle cluster: host places \`shape="nanoparticle"\`.',
    '- Optional: emit a ```tools JSON block (before or after SVG) for extra placements:',
    '```tools',
    '[{"tool":"dna","points":[{"x":100,"y":200},{"x":300,"y":180}],"strandColor":"#2563eb"}]',
    '```',
    '- To hand off to user: say "Click **DNA helix** in the left toolbar (`tool_dna`) and drag a path."',
    '- For interactive custom paths, activating the tool is better than fake SVG.'
  )
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
 * @param {string} prompt
 * @param {{w:number,h:number}} canvasSize
 */
export function resolveToolPlan (prompt, canvasSize = { w: 640, h: 480 }) {
  const text = String(prompt || '')
  const p = text.toLowerCase()
  const cx = canvasSize.w / 2
  const cy = canvasSize.h / 2
  /** @type {object[]} */
  const placements = []
  let svgHint = ''
  let activate = null
  let note = ''

  if (/\b(just|only)\s+(open|activate|use|switch)\b.*\b(dna|helix)\b.*\b(tool|brush)\b/i.test(text) ||
      /\bswitch to (the )?dna\b/i.test(text)) {
    activate = { toolId: 'tool_dna', mode: 'dna' }
    note = 'DNA helix tool activated — drag on the canvas to draw.'
    return { placements, svgHint, activate, note }
  }

  const wantsDnaBrush = /\b(dna|double helix|helix)\b.*\b(brush|tool)\b|\b(brush|tool)\b.*\b(dna|helix)\b|\bwith dna brush\b/i.test(p)
  const wantsPlasmid = /\bplasmid\b|\bvector map\b|\brecombinant\b.*\bvector\b/i.test(p)

  if (wantsPlasmid || (wantsDnaBrush && /\bplasmid\b|\bvector\b|\bcircular\b|\bring\b/i.test(p))) {
    const r = Math.min(canvasSize.w, canvasSize.h) * 0.22
    placements.push({
      tool: 'dna',
      points: circularPoints(cx, cy, r),
      thickness: 1.1,
      strandColor: '#2563eb',
      rungColor: '#f59e0b',
      showBasePairs: true
    })
    svgHint = `A real circular DNA helix (DNA brush object) is already on the canvas centered at (${Math.round(cx)},${Math.round(cy)}) with radius ~${Math.round(r)}. Do NOT redraw the helix with plain SVG paths or ladders. Return ONLY plasmid map annotations: title, gene/feature labels, leader lines, and colored arrow segments along the OUTSIDE of the ring. Keep SVG compact (≤45 elements). Put \`\`\`svg fence FIRST.`
    note = 'Placed circular DNA with DNA helix brush.'
    return { placements, svgHint, activate, note, usedDnaBrush: true }
  }

  if (wantsDnaBrush || (/\bdna\b|\bhelix\b/i.test(p) && /\bdraw\b|\bmake\b|\bcreate\b/i.test(p))) {
    placements.push({
      tool: 'dna',
      points: sinusoidPoints(canvasSize.w, canvasSize.h),
      thickness: 1,
      strandColor: '#2563eb',
      rungColor: '#f59e0b'
    })
    svgHint = 'Real DNA helix placed with the DNA brush. Do not redraw helix strands as SVG paths; add only optional labels if needed.'
    note = 'Placed DNA helix with DNA brush.'
    return { placements, svgHint, activate, note, usedDnaBrush: true }
  }

  if (/\bhydrogel\b|\bpolymer network\b|\bmesh\b.*\bgel\b/i.test(p)) {
    const pad = 40
    placements.push({
      tool: 'hydrogel',
      x: pad,
      y: pad + 40,
      w: canvasSize.w - pad * 2,
      h: canvasSize.h - pad * 2 - 40
    })
    svgHint = 'Hydrogel brush region placed. Add only captions or arrows; do not redraw the mesh as SVG.'
    note = 'Placed hydrogel brush.'
    return { placements, svgHint, activate, note }
  }

  if (/\blipid\b|\bbilayer\b|\bmembrane cross/i.test(p)) {
    placements.push({
      tool: 'lipidbilayer',
      x1: 80,
      y1: cy,
      x2: canvasSize.w - 80,
      y2: cy
    })
    svgHint = 'Lipid bilayer brush placed. Add only labels; do not fake membrane heads as random circles.'
    note = 'Placed lipid bilayer brush.'
    return { placements, svgHint, activate, note }
  }

  if (/\bnanoparticle\b|\bnano\s*particle\b/i.test(p)) {
    placements.push({
      tool: 'nanoparticle',
      cx,
      cy,
      radius: Math.min(canvasSize.w, canvasSize.h) * 0.18
    })
    svgHint = 'Nanoparticle brush placed. Add captions only if needed.'
    note = 'Placed nanoparticle brush.'
    return { placements, svgHint, activate, note }
  }

  return { placements, svgHint, activate, note }
}

/**
 * @param {string} text
 * @returns {object[]}
 */
export function parseToolsBlockFromReply (text) {
  if (!text) return []
  const m = text.match(/```tools?\s*([\s\S]*?)```/i)
  if (!m?.[1]) return []
  try {
    const parsed = JSON.parse(m[1].trim())
    return Array.isArray(parsed) ? parsed : (parsed?.tools || [])
  } catch {
    return []
  }
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
    const g = svgCanvas.addSVGElementsFromJson({
      element: 'g',
      attr: {
        id: svgCanvas.getNextId(),
        shape: 'nanoparticle',
        'data-cx': spec.cx ?? 320,
        'data-cy': spec.cy ?? 240,
        'data-radius': spec.radius ?? 90,
        fill: '#f9bc01',
        stroke: '#333333',
        'stroke-width': 0.8,
        style: 'pointer-events:visiblePainted'
      }
    })
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
