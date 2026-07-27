/**
 * Apply AI-generated SVG to the editor canvas + system prompt for conversational drawing.
 */

import { pathDToPolyline, pointsToSmoothPathD, SPINE_MAX_POINTS, SPINE_MIN_DIST } from '../ext-dna/dna-math.js'

const LINE_ONLY_PATH = /[Ll]/
const HAS_CURVE_CMD = /[CQcqAa]/

/**
 * Convert AI polylines / line-only paths to smooth cubic Bézier paths for pathedit.
 * Skips procedural brush groups (`shape=…`) and spine/hit paths.
 * @param {object} svgEditor
 * @param {Element} [root]
 */
export function smoothAiImportedGraphics (svgEditor, root) {
  const svgCanvas = svgEditor?.svgCanvas
  if (!svgCanvas || !root) return

  /** @type {Element[]} */
  const targets = []
  const walk = (node) => {
    if (!node || node.nodeType !== 1) return
    if (node.getAttribute?.('shape')) return
    const role = node.getAttribute?.('data-role')
    if (role === 'spine' || role === 'hit') return
    const tag = node.tagName?.toLowerCase()
    if (tag === 'polyline' || tag === 'line') {
      targets.push(node)
      return
    }
    if (tag === 'path') {
      const d = node.getAttribute('d') || ''
      if (d.length > 4 && LINE_ONLY_PATH.test(d) && !HAS_CURVE_CMD.test(d)) {
        targets.push(node)
      }
      return
    }
    for (const ch of node.children) walk(ch)
  }
  walk(root)

  for (const el of targets) {
    try {
      let pathEl = el
      if (el.tagName?.toLowerCase() !== 'path') {
        pathEl = svgCanvas.convertToPath(el)
        if (!pathEl) continue
      }
      const pts = pathDToPolyline(pathEl.getAttribute('d') || '', 8)
      if (pts.length < 3) continue
      const smoothD = pointsToSmoothPathD(pts, {
        minDist: SPINE_MIN_DIST,
        maxPts: SPINE_MAX_POINTS
      })
      if (smoothD) pathEl.setAttribute('d', smoothD)
    } catch (_) { /* keep original geometry */ }
  }
}

/**
 * Pretty-print apply/diagnose details for the "More details" panel.
 * @param {object|null|undefined} details
 * @param {string} [message]
 * @returns {string}
 */
export function formatApplyFailureDetails (details, message) {
  const lines = []
  if (message) lines.push(`Reason: ${message}`)
  if (!details || typeof details !== 'object') {
    return lines.join('\n') || 'No diagnostic details available.'
  }
  const order = [
    'stage', 'mode', 'inputLength', 'outputLength', 'replyLength',
    'hasSvgOpen', 'hasSvgClose', 'hasFenceOpen', 'hasFenceClose',
    'salvagedClose', 'childCount', 'finishReason', 'parserError',
    'previewHead', 'previewTail', 'stack', 'extractNote'
  ]
  const seen = new Set()
  for (const key of order) {
    if (details[key] === undefined || details[key] === null || details[key] === '') continue
    seen.add(key)
    lines.push(`${key}: ${String(details[key])}`)
  }
  for (const [key, val] of Object.entries(details)) {
    if (seen.has(key) || val === undefined || val === null || val === '') continue
    lines.push(`${key}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`)
  }
  return lines.join('\n') || 'No diagnostic details available.'
}

/**
 * User-friendly summary when SVG apply fails.
 * @param {object} [details]
 * @param {string} [message]
 */
export function formatUserFacingSvgError (details, message) {
  const d = details || {}
  const truncated = (
    d.hasFenceOpen && !d.hasFenceClose ||
    d.salvagedClose ||
    d.finishReason === 'MAX_TOKENS' ||
    /truncat|mismatch|line \d+/i.test(String(d.parserError || message || ''))
  )
  if (truncated) {
    return 'The drawing was cut off before the SVG finished (too much detail for one reply). Retrying with a simpler version, or ask for “simple DNA helix, no shadows”.'
  }
  if (d.parserError && /xmlParseEntityRef|entityref|no name/i.test(String(d.parserError))) {
    return 'The SVG had unescaped "&" characters in text (use &amp; in SVG, e.g. "Geim &amp; Novoselov"). Retrying with fixes…'
  }
  if (d.parserError) {
    return 'The SVG in the reply had invalid XML. Try again or ask for a simpler drawing.'
  }
  return message || 'Could not apply SVG from the reply. Try again or rephrase.'
}

/**
 * @param {object} [details]
 */
export function looksLikeTruncatedSvg (details) {
  const d = details || {}
  return !!(
    (d.hasFenceOpen && !d.hasFenceClose) ||
    d.salvagedClose ||
    d.finishReason === 'MAX_TOKENS' ||
    /mismatch|Opening and ending tag|xmlParseEntityRef|entityref/i.test(String(d.parserError || ''))
  )
}

/**
 * Escape bare & in XML/SVG (common model mistake: "Geim & Novoselov").
 * @param {string} xml
 */
export function escapeInvalidXmlEntities (xml) {
  return String(xml || '').replace(
    /&(?!(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);)/g,
    '&amp;'
  )
}

/**
 * Diagnose / sanitize model SVG before import.
 * @param {string} svgXml
 * @returns {{ ok: boolean, xml?: string, message?: string, details?: object }}
 */
export function diagnoseAndSanitizeSvg (svgXml) {
  const details = {
    inputLength: String(svgXml || '').length,
    hasSvgOpen: /<svg\b/i.test(svgXml || ''),
    hasSvgClose: /<\/svg>/i.test(svgXml || '')
  }
  if (!svgXml?.includes('<svg')) {
    return { ok: false, message: 'No <svg> root found in model reply', details }
  }

  let xml = String(svgXml).trim()
  // Strip leftover fences
  xml = xml.replace(/^```(?:svg|xml)?\s*/i, '').replace(/\s*```$/i, '').trim()
  if (!/\sxmlns=/.test(xml)) {
    xml = xml.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  // Drop dangerous / unsupported bits that break import
  xml = xml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')

  xml = escapeInvalidXmlEntities(xml)

  // Salvage truncated markup
  if (!/<\/svg>\s*$/i.test(xml)) {
    xml = xml.replace(/<[^>]*$/m, '')
    xml = closeDanglingTags(xml)
    if (!/<\/svg>/i.test(xml)) xml += '</svg>'
    details.salvagedClose = true
  }

  let doc = new DOMParser().parseFromString(xml, 'image/svg+xml')
  let err = doc.querySelector('parsererror')
  if (err) {
    const salvaged = salvageFromParserError(xml, err.textContent || '')
    if (salvaged && salvaged !== xml) {
      xml = salvaged
      details.salvagedParse = true
      doc = new DOMParser().parseFromString(xml, 'image/svg+xml')
      err = doc.querySelector('parsererror')
    }
    if (err && /entityref|no name/i.test(err.textContent || '')) {
      const escaped = escapeInvalidXmlEntities(xml)
      if (escaped !== xml) {
        xml = escaped
        details.fixedEntities = true
        doc = new DOMParser().parseFromString(xml, 'image/svg+xml')
        err = doc.querySelector('parsererror')
      }
    }
  }
  if (err) {
    details.parserError = (err.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500)
    details.previewHead = xml.slice(0, 240)
    details.previewTail = xml.slice(-240)
    return {
      ok: false,
      message: `SVG XML parse error: ${details.parserError.slice(0, 160)}`,
      details
    }
  }
  const root = doc.documentElement
  if (!root || root.localName?.toLowerCase() !== 'svg') {
    return { ok: false, message: 'Parsed document is not an <svg> element', details }
  }
  if (![...root.children].some((c) => c.nodeType === 1)) {
    details.childCount = 0
    return { ok: false, message: 'SVG root has no drawable children (often truncated)', details }
  }
  details.childCount = root.children.length
  details.outputLength = xml.length
  details.previewHead = xml.slice(0, 180)
  details.previewTail = xml.slice(-120)
  return { ok: true, xml, details }
}

function closeDanglingTags (xml) {
  const voidish = new Set(['path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'stop', 'use', 'image', 'meta', 'feDropShadow', 'feGaussianBlur', 'feOffset', 'feMerge', 'feMergeNode', 'feFlood', 'feComposite', 'feBlend', 'feColorMatrix'])
  const stack = []
  const re = /<\/?([A-Za-z][\w:-]*)\b[^>]*\/?>/g
  let m
  while ((m = re.exec(xml))) {
    const full = m[0]
    const name = m[1].toLowerCase()
    if (full.startsWith('</')) {
      // pop until match
      while (stack.length) {
        const top = stack.pop()
        if (top === name) break
      }
    } else if (!full.endsWith('/>') && !voidish.has(name) && name !== 'svg') {
      stack.push(name)
    }
  }
  let out = xml
  while (stack.length) {
    out += `</${stack.pop()}>`
  }
  return out
}

/**
 * Drop broken tail after parser line error and close remaining tags.
 * @param {string} xml
 * @param {string} parserError
 */
function salvageFromParserError (xml, parserError) {
  const lineMatch = String(parserError || '').match(/line\s+(\d+)/i)
  if (lineMatch) {
    const badLine = parseInt(lineMatch[1], 10)
    if (badLine > 2) {
      let cut = xml.split(/\r?\n/).slice(0, badLine - 1).join('\n')
      cut = cut.replace(/<[^>]*$/m, '')
      cut = closeDanglingTags(cut)
      if (!/<\/svg>/i.test(cut)) cut += '</svg>'
      const doc = new DOMParser().parseFromString(cut, 'image/svg+xml')
      if (!doc.querySelector('parsererror') && doc.documentElement?.localName === 'svg') {
        return cut
      }
    }
  }
  // Last resort: strip filters/defs (often truncated) and close
  let stripped = xml
    .replace(/<filter[\s\S]*?<\/filter>/gi, '')
    .replace(/<filter[\s\S]*$/i, '')
    .replace(/<defs>[\s\S]*?<\/defs>/gi, '')
    .replace(/<defs>[\s\S]*$/i, '')
  stripped = stripped.replace(/<[^>]*$/m, '')
  stripped = closeDanglingTags(stripped)
  if (!/<\/svg>/i.test(stripped)) stripped += '</svg>'
  const doc2 = new DOMParser().parseFromString(stripped, 'image/svg+xml')
  if (!doc2.querySelector('parsererror') && doc2.documentElement?.localName === 'svg') {
    return stripped
  }
  return null
}

/**
 * @param {object} svgEditor
 * @param {string} svgXml
 * @param {'replace'|'append'} mode
 * @returns {{ ok: boolean, message?: string, details?: object }}
 */
export function applySvgToCanvas (svgEditor, svgXml, mode) {
  const { svgCanvas } = svgEditor
  const diagnosed = diagnoseAndSanitizeSvg(svgXml)
  if (!diagnosed.ok) return diagnosed
  const xml = diagnosed.xml
  const details = { ...(diagnosed.details || {}), mode }

  try {
    if (mode === 'replace') {
      const ok = svgCanvas.setSvgString(xml) !== false
      if (!ok) {
        return { ok: false, message: 'svgCanvas.setSvgString rejected the SVG', details }
      }
      const root = svgCanvas.getSvgContent?.()
      if (root) smoothAiImportedGraphics(svgEditor, root)
      svgEditor.updateCanvas?.(true)
      try { svgEditor.zoomChanged?.(window, 'canvas') } catch (_) { /* ignore */ }
      return { ok: true, details }
    }

    const el = svgCanvas.importSvgString(xml, true, true)
    if (!el) {
      return {
        ok: false,
        message: 'svgCanvas.importSvgString returned null (invalid or unsupported SVG)',
        details
      }
    }
    smoothAiImportedGraphics(svgEditor, el)
    svgCanvas.selectOnly?.([el], true)
    svgCanvas.call?.('changed', [el])
    svgEditor.updateCanvas?.(false)
    return { ok: true, details, element: el }
  } catch (err) {
    return {
      ok: false,
      message: `Import threw: ${err?.message || String(err)}`,
      details: { ...details, stack: String(err?.stack || '').slice(0, 800) }
    }
  }
}

/**
 * Remove SVG / fenced SVG from a reply for chat display & history compactness.
 * @param {string} text
 * @param {string|null} svg
 * @returns {string}
 */
export function conversationalTextFromReply (text, svg) {
  let out = String(text || '')
  if (svg) {
    out = out.replace(svg, '')
  }
  out = out
    .replace(/```(?:svg|xml)?\s*[\s\S]*?```/gi, '')
    .replace(/```tools?\s*[\s\S]*?```/gi, '')
    .replace(/<\/?svg\b[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out
}

/**
 * Compact a model turn for multi-turn context (avoid stuffing huge SVG paths).
 * @param {string} reply
 * @param {string|null} svg
 * @param {boolean} applied
 */
export function compactModelHistory (reply, svg, applied) {
  const talk = conversationalTextFromReply(reply, svg)
  if (applied && svg) {
    return `${talk || 'Done.'}\n\n[I drew SVG on the canvas for this request. The graphic is now on the document; remember this turn and build on it. Do not repeat the full SVG unless the user asks to redraw or change it.]`
  }
  return (talk || reply).slice(0, 3500)
}

/**
 * Short multi-turn memory blurb for the system prompt (not a tool call).
 * @param {Array<{role:string,text?:string}>} history
 * @param {{note?:string}|null} lastAction
 */
export function buildContinuityNote (history, lastAction) {
  const turns = Array.isArray(history) ? history.length : 0
  const recent = (history || []).slice(-6).map((m) => {
    const role = m.role === 'user' ? 'User' : 'Assistant'
    const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 160)
    return text ? `${role}: ${text}` : null
  }).filter(Boolean)
  const lines = [
    `# Conversation continuity`,
    `This is an ongoing chat (${turns} turns retained). Prefer referring to earlier turns over starting over.`,
    `Do not use function calling, tool calls, or JSON tool schemas — reply in natural language and/or SVG markup only.`,
    lastAction?.note ? `Last canvas action: ${lastAction.note}` : ''
  ].filter(Boolean)
  if (recent.length) {
    lines.push('Recent gist:')
    recent.forEach((r) => lines.push(`- ${r}`))
  }
  return lines.join('\n')
}

/**
 * Detect edit-style follow-ups so we can keep selection context without forcing tools.
 * @param {string} prompt
 */
export function looksLikeEditIntent (prompt) {
  const p = String(prompt || '').trim().toLowerCase()
  if (!p || p.length > 180) return false
  // New drawing requests should not auto-switch into selection edit
  if (/\b(draw|create|generate|illustrate|compose|design)\b/.test(p) &&
      !/\b(it|this|them|selection|selected)\b/.test(p)) {
    return false
  }
  return (
    /^(make it|change it|update it|edit it|tweak it)\b/.test(p) ||
    /\b(edit|change|modify|update|tweak|adjust|recolor|recolour|resize|rotate)\b/.test(p) ||
    /\b(make|move|color|colour|fill|stroke)\s+(it|this|them|the selection)\b/.test(p) ||
    /\b(thicker|thinner|smaller|bigger|larger|darker|lighter)\b/.test(p) ||
    /\b(it|this|them|selection)\b.{0,40}\b(blue|red|green|yellow|black|white|orange|purple|label)\b/.test(p)
  )
}

/**
 * Brief selection summary (ids/tags) for continuity without full markup.
 * @param {string} selectionSvg
 */
export function summarizeSelectionSvg (selectionSvg) {
  const xml = String(selectionSvg || '')
  if (!xml) return ''
  const tags = [...xml.matchAll(/<([a-zA-Z][\w:-]*)\b[^>]*(?:\bid\s*=\s*["']([^"']+)["'])?/g)]
    .slice(0, 12)
    .map((m) => (m[2] ? `${m[1]}#${m[2]}` : m[1]))
  const uniq = [...new Set(tags)]
  return uniq.length ? uniq.join(', ') : `selection (${xml.length} chars)`
}

import { buildEditorToolsPromptSection } from './place-tools.js'

/**
 * Build system prompt: conversational assistant that knows every tool and draws when asked.
 * @param {{ w: number, h: number, mode: string, includeCanvas: boolean, canvasSvg?: string, hasImages?: boolean, selectionSvg?: string, selectionSummary?: string, continuityNote?: string, useBrushes?: boolean }} ctx
 */
export function buildSystemPrompt (ctx) {
  const {
    w, h, mode, includeCanvas, canvasSvg, hasImages, selectionSvg, selectionSummary, continuityNote,
    useBrushes = false
  } = ctx

  let prompt = `You are the built-in AI assistant for SVGEdit (LabCanvas-style scientific SVG editor).
You are conversational: chat naturally, retain prior turns, ask clarifying questions when needed, and explain editor tools when asked.
IMPORTANT: Never use function calling, tool calls, tool_request JSON, or API tool schemas. The host app is not a tool-calling agent. Draw by emitting SVG markup in your reply; otherwise answer in plain text.
When the user wants something drawn, illustrated, diagrammed, sketched, or added to the canvas — you MUST output valid SVG that the app will place on the canvas automatically.
${hasImages ? 'The user attached image(s). Treat them as visual reference: describe, recreate as clean SVG, vectorize/style-match, or extract diagrams as requested.\n' : ''}
${selectionSvg
    ? `SELECTION EDIT MODE: The user selected element(s) on the canvas. Edit ONLY that selection. Return a complete <svg> whose children REPLACE the selection (same approximate position/size unless asked otherwise). Do not redraw the whole document.\nSELECTED MARKUP:\n${selectionSvg.slice(0, 12000)}\n`
    : (selectionSummary
      ? `The user currently has a canvas selection (${selectionSummary}). If they ask to change “it/this/selection”, edit that selection with SVG; otherwise continue the conversation.\n`
      : '')}
# How drawing works
- Canvas size / preferred viewBox: ${w}×${h}
- Draw mode: "${mode}" → ${mode === 'replace'
    ? 'produce a full self-contained scene that can replace the document.'
    : 'produce a self-contained graphic that will be ADDED onto the existing canvas.'}
- If you draw: put ONE complete <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"> … </svg> in your reply inside a \`\`\`svg fence.
${useBrushes
    ? '- **Generative brushes ON**: when the figure needs DNA/nanoparticle/hydrogel/bilayer brushes, emit a ```tools JSON array FIRST, then ```svg for everything else (ligands, labels, arrows). The host places brushes before SVG.\n'
    : ''}- CRITICAL — output limits: Put fenced blocks FIRST (${useBrushes ? '```tools then ```svg' : '```svg'}) before any caption. Keep SVG compact (≤80 elements). Close every tag; never emit </svg> while a <g> is still open.
- XML rules: In SVG text/attributes escape & as &amp;, < as &lt;. Example: "Geim &amp; Novoselov". Use Unicode subscripts (C₆₀) or &lt;sub&gt; in text only if needed.
- Timelines / infographics: use a horizontal axis + compact cards (year + 1-line label + 0D/1D/2D/3D badge). Prefer ≤12 milestones so the SVG fits; group by dimension in columns if needed.
- For DNA / molecules: use 2 smooth paths + ≤12 rung lines. No feDropShadow, feGaussianBlur, or heavy <filter> blocks (they cause truncation). Suggest the DNA helix brush for interactive paths.
- Short caption AFTER the fence (1–2 sentences). Long intros before SVG often get the drawing cut off.
- Pure Q&A / how-to / brainstorming: reply in text ONLY — do not invent SVG unless they asked to draw.
- Follow-ups like "make it blue", "add a label", "move it left": build on prior turns; redraw or extend with SVG (prefer append/selection-edit semantics unless they say replace everything).
- No scripts, foreignObject, external images/URLs, or HTML. Use path/rect/circle/ellipse/text/g (and nested groups). Prefer \`<path d="M… C…">\` with cubic Bézier for smooth curves — avoid \`<polyline>\` and line-only \`L\` paths so users can double-click to edit nodes. Marker defs for arrowheads are OK. Science-friendly colors (avoid neon purple). font-family="sans-serif" or "serif". Simple ids (ai_1…).
- You can draw ANYTHING expressible as SVG. Never refuse a drawing request as "too complex" — simplify layout intelligently and still produce usable SVG. If unclear, ask one short clarifying question OR pick sensible defaults and say what you assumed.

# What you can draw (anything SVG — non-exhaustive)
- Flowcharts / process maps: boxes, diamonds, rounded steps, arrows, swimlanes, decision branches.
- Mind maps / concept maps: central hub, radiating branches, curved connectors, colored clusters.
- Org charts, timelines, roadmaps, cycle diagrams, Venn regions, network/graph layouts.
- Scientific figures: DNA, membranes, hydrogels, nanoparticles, pathways, apparatus, organelle cartoons, simple plots (axes + polylines).
- Infographics, icons, logos, UI wireframes, schematic maps, floor plans, circuit-like sketches.
- Illustrations: objects, simple characters, scenes, technical callouts, geometric / isometric shapes.
- Typography layouts, posters, badges, patterns, freeform bezier art.
Diagram layout: margins, aligned columns, no overlapping labels, consistent gaps (~16–24px), readable type (≥12px), high-contrast text, clear arrowheads on flows.

# Editor tools you must know (guide users; when drawing, emulate their look)

## Core tools (left toolbar)
- Select: click/drag to select; handles for move/resize/rotate. Double-click paths/shapes to edit nodes.
- Zoom (Z): click or Alt+wheel toward cursor. Pan tool for moving the view.
- Pencil / freehand (Q): draws strokes; right Properties → Pencil → Smoothing (Paper.js simplify). Stroke color/width from bottom palette.
- Line (L): straight segments; drag endpoints after select.
- Path (P): Bézier / node paths; Path panel for nodes, link, delete, add subpath, open/close.
- Rectangle / Square / Freehand rect (R): rects; corner-radius handle & rx in Properties.
- Ellipse / Circle / Freehand ellipse (E).
- Text (T): multiline text (Enter for new lines); Character panel = font, bold/italic, super/subscript on selection; Paragraph = align; Spacing = letter/word.
- Image: place raster; set URL / upload in Properties.

## Science / specialty brushes (extensions)
- DNA helix: draw a freehand spine; generates double helix. Properties: thickness, colors, etc. Double-click spine to edit path nodes; helix regenerates.
- Hydrogel: network/mesh brush with density, chain length, pore size, crosslinks, particles, swelling.
- Lipid bilayer: membrane with head radius, tail length, gap, waviness, curvature.
- Nanoparticle: particle arrays (spacing, radius).
- Cube 3D: perspective cube (rot X/Y/Z, scale, size, perspective).
- Curved arrow: arc arrows for pathways/mechanisms.
- Star / Polygon (polystar): points & radii in their panels.
- Shapes library: preset shape packs.
- Connector: link shapes with connector lines.
- Markers: start/mid/end markers on paths/lines.
- Eyedropper: sample fill/stroke from canvas.
- Grid / snap / align guides: cyan guides snap edges/centers; Align tab for distribute/align.
- Pathfinder (Align tab extensions): Unite / Subtract / Intersect / Exclude on selected shapes.
- EPS: import/export EPS (Ghostscript when available).
- Layers: Layers tab — create, rename, reorder, show/hide, move selection between layers.
- Properties dock (right): Actions (clone/delete/flip/to-path), Transform, Appearance (angle/blur/opacity), Identity. Can be minimized with the dock button.
- AI Chat (this panel): left dock; paste Gemini API key locally; pick model; optional multi-model compare; Append vs Replace; optional “send current SVG as context”.

## Workflow tips to teach users
1. Prefer specialized brushes (DNA, bilayer, hydrogel) for those motifs — tell them which tool + what to drag.
2. For custom diagrams you can draw SVG yourself in-chat.
3. After AI draws: Select to move; double-click paths for nodes; use Pathfinder to boolean; Align tab to tidy.
4. Undo/Redo from top history; Open/Save from menu; Wireframe to see outlines.
5. Stroke/fill live in the bottom color bar — pencil/line need a real stroke (not “none”).

# Personality
Helpful illustration partner for science and general diagrams: concise, clear. After drawing, offer a quick tip (edit nodes, Pathfinder, Align, or a specialized brush). If they ask for flowchart/mindmap/any SVG art — just draw it.
`

  prompt += `\n${buildEditorToolsPromptSection({ useBrushes, w, h })}\n`

  if (continuityNote) {
    prompt += `\n${continuityNote}\n`
  }

  if (includeCanvas && canvasSvg) {
    const clipped = canvasSvg.length > 14000
      ? `${canvasSvg.slice(0, 14000)}\n<!-- truncated -->`
      : canvasSvg
    prompt += `\n# Current canvas SVG (user enabled context — respect and build on it)\n${clipped}\n`
  } else {
    prompt += '\n# Current canvas SVG was not attached; use chat history and any selection context. Ask if you need the full document.\n'
  }

  return prompt
}
