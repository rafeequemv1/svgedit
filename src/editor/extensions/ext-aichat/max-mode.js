/**
 * Max mode — two-step graphical abstract / poster / slide builder.
 * Step 1: text model plans layout (JSON).
 * Step 2: generate BioRender icons + SVG pieces and place them with live canvas progress.
 */

import { generateGeminiText, generateGeminiImage, extractSvgFromText } from './gemini.js'
import { placeImageOnCanvas, buildRasterPrompt } from './place-image.js'

const NS_SVG = 'http://www.w3.org/2000/svg'
const MAX_ITEMS = 14
const MAX_ICONS = 8

const delay = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'))
    return
  }
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => {
    clearTimeout(t)
    reject(new DOMException('Aborted', 'AbortError'))
  }, { once: true })
})

const paint = (svgEditor) => {
  try {
    const { svgCanvas } = svgEditor
    svgCanvas.call?.('changed', [svgCanvas.getSvgContent?.()].filter(Boolean))
    svgEditor.updateCanvas?.(false)
  } catch (_) { /* ignore */ }
}

/**
 * @param {{w:number,h:number}} canvas
 * @param {string} userRequest
 * @param {string} [canvasSvg]
 */
export function buildMaxPlanSystemPrompt ({ w, h, userRequest, canvasSvg }) {
  return `You are a scientific figure art director for SVGEdit.
The user wants a FULL composed graphic (graphical abstract, poster, slide, multi-panel figure, etc.).

Your job for STEP 1 is ONLY to plan — do NOT output SVG or images yet.

Return ONE JSON object (no markdown fences if possible; if you must fence, use \`\`\`json) with this exact shape:
{
  "title": "short title",
  "format": "graphical_abstract" | "poster" | "slide" | "figure" | "infographic" | "other",
  "canvas": { "width": number, "height": number },
  "summary": "2-4 sentences describing layout and story for the user",
  "items": [
    {
      "id": "unique_id",
      "kind": "svg" | "icon" | "image",
      "role": "background|title|subtitle|panel|icon|arrow|caption|label|decoration",
      "x": number, "y": number, "w": number, "h": number,
      "prompt": "exact generation brief for this piece"
    }
  ]
}

Planning rules:
- Preferred canvas size around ${w}×${h} unless the format needs landscape poster/slide (e.g. 1920×1080 slide, 1200×800 abstract).
- Use kind="svg" for layout chrome and simple diagrams: background, header/title text, panel frames, arrows, captions/labels. Keep SVG briefs SIMPLE.
- Use kind="icon" for BioRender-style photographic scientific objects (will be generated AFTER all SVG is placed).
- Use kind="image" only for large scene art (last).
- Prefer: 1 background, 1 title, 3 panel frames, labels, then 4–6 icons. Do not put complex chemistry into SVG pieces.
- Build order the app uses: SVG layout → SVG diagrams → icons → images.
- Max ${MAX_ITEMS} items total, max ${MAX_ICONS} icon/image items (cost control). Prefer fewer strong pieces.
- Coordinates are absolute on the canvas; items must not wildly overlap unless intentional layering.
- Order items back-to-front (background first).
- Each prompt must be self-contained and specific.
- User request: ${userRequest.slice(0, 4000)}
${canvasSvg ? `\nExisting canvas SVG context (optional reference, truncated):\n${canvasSvg.slice(0, 6000)}` : ''}
`
}

/**
 * @param {string} text
 * @returns {object|null}
 */
export function extractMaxPlan (text) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] || text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const plan = JSON.parse(raw.slice(start, end + 1))
    return normalizePlan(plan)
  } catch {
    return null
  }
}

function normalizePlan (plan) {
  if (!plan || typeof plan !== 'object') return null
  const canvas = plan.canvas || {}
  const width = Math.min(4000, Math.max(400, Math.round(Number(canvas.width) || 1200)))
  const height = Math.min(4000, Math.max(300, Math.round(Number(canvas.height) || 800)))
  let items = Array.isArray(plan.items) ? plan.items : []
  items = items
    .map((it, i) => {
      const kind = String(it.kind || 'svg').toLowerCase()
      const safeKind = kind === 'icon' || kind === 'image' ? kind : 'svg'
      return {
        id: String(it.id || `item_${i + 1}`),
        kind: safeKind,
        role: String(it.role || 'panel'),
        x: Math.round(Number(it.x) || 0),
        y: Math.round(Number(it.y) || 0),
        w: Math.max(24, Math.round(Number(it.w) || 120)),
        h: Math.max(24, Math.round(Number(it.h) || 80)),
        prompt: String(it.prompt || it.label || '').trim(),
        displayTitle: String(it.displayTitle || '').trim()
      }
    })
    .filter((it) => it.prompt)

  let raster = 0
  items = items.filter((it) => {
    if (it.kind === 'svg') return true
    raster++
    return raster <= MAX_ICONS
  }).slice(0, MAX_ITEMS)

  return composeWorkflowLayout({
    title: String(plan.title || 'Composition'),
    format: String(plan.format || 'figure'),
    canvas: { width, height },
    summary: String(plan.summary || ''),
    items
  })
}

/**
 * Force a clean multi-step graphical abstract / poster grid.
 * Fixes AI plans that dump overlapping frames, truncated labels, and bad coordinates.
 */
export function composeWorkflowLayout (plan) {
  const icons = plan.items.filter((it) => it.kind === 'icon' || it.kind === 'image')
  if (icons.length < 2) return plan

  const n = Math.min(5, icons.length)
  const picked = icons.slice(0, n)
  const W = plan.canvas.width
  const H = plan.canvas.height
  const title = (plan.title || 'Graphical abstract').trim()
  const margin = Math.round(W * 0.03)
  const headerH = Math.min(100, Math.max(72, Math.round(H * 0.14)))
  const gap = Math.max(16, Math.round(W * 0.018))
  const contentTop = headerH + 20
  const contentBottom = 22
  const contentH = H - contentTop - contentBottom
  const colW = Math.floor((W - margin * 2 - gap * (n - 1)) / n)
  const iconSize = Math.min(colW - 36, Math.round(contentH * 0.46), 260)

  /** @type {typeof plan.items} */
  const items = []

  items.push({
    id: 'layout_bg',
    kind: 'svg',
    role: 'background',
    x: 0,
    y: 0,
    w: W,
    h: H,
    prompt: title,
    displayTitle: title
  })

  for (let i = 0; i < n; i++) {
    const x = margin + i * (colW + gap)
    const stepTitle = shortStepLabel(picked[i].prompt, i)
    items.push({
      id: `panel_${i + 1}`,
      kind: 'svg',
      role: 'panel',
      x,
      y: contentTop,
      w: colW,
      h: contentH,
      prompt: stepTitle,
      displayTitle: `Step ${i + 1}. ${stepTitle}`
    })
  }

  for (let i = 0; i < n; i++) {
    const x = margin + i * (colW + gap)
    const ix = x + Math.round((colW - iconSize) / 2)
    const iy = contentTop + 52
    items.push({
      id: picked[i].id || `icon_${i + 1}`,
      kind: picked[i].kind === 'image' ? 'image' : 'icon',
      role: 'icon',
      x: ix,
      y: iy,
      w: iconSize,
      h: iconSize,
      prompt: picked[i].prompt
    })
  }

  for (let i = 0; i < n - 1; i++) {
    const x = margin + i * (colW + gap) + colW - Math.round(gap * 0.15)
    const ay = contentTop + 52 + Math.round(iconSize / 2) - 14
    items.push({
      id: `arrow_${i + 1}`,
      kind: 'svg',
      role: 'arrow',
      x,
      y: ay,
      w: gap + Math.round(gap * 0.3),
      h: 28,
      prompt: 'flow',
      displayTitle: ''
    })
  }

  for (let i = 0; i < n; i++) {
    const x = margin + i * (colW + gap)
    const stepTitle = shortStepLabel(picked[i].prompt, i)
    const detail = shortStepDetail(picked[i].prompt)
    const cy = contentTop + 52 + iconSize + 18
    items.push({
      id: `caption_${i + 1}`,
      kind: 'svg',
      role: 'caption',
      x: x + 14,
      y: cy,
      w: colW - 28,
      h: Math.max(60, contentTop + contentH - cy - 12),
      prompt: `${stepTitle}. ${detail}`,
      displayTitle: stepTitle,
      lines: [stepTitle, detail].filter(Boolean)
    })
  }

  return {
    ...plan,
    title,
    items,
    summary: plan.summary || `${n}-step composed layout for “${title}”.`,
    _composed: true
  }
}

function shortStepLabel (prompt, index) {
  const p = String(prompt || '')
  const named = p.match(/(?:of|showing|icon of|depicting)\s+([^:.,\n]{4,48})/i)
  if (named?.[1]) return cleanLabel(named[1])
  const before = p.split(/[:.—–-]/)[0]
  if (before && before.length > 3 && before.length < 42) return cleanLabel(before)
  return `Step ${index + 1}`
}

function shortStepDetail (prompt) {
  const p = String(prompt || '').replace(/\s+/g, ' ').trim()
  const chem = p.match(/\b([A-Z][a-z]?(?:\d+)?(?:[A-Z][a-z]?(?:\d+)?)*(?:\s*\+\s*[A-Za-z0-9()]+)?)\b/)
  if (chem?.[1] && chem[1].length < 40) return chem[1]
  const clause = p.split(/[.;]/)[0]
  return cleanLabel(clause).slice(0, 56)
}

function cleanLabel (s) {
  return String(s || '')
    .replace(/^(BioRender|scientific|vector|icon|style|of|a|an)\s+/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase())
}

/**
 * Human-readable plan for the chat log.
 * @param {object} plan
 */
export function formatPlanForChat (plan) {
  if (!plan) return 'Could not parse a layout plan.'
  const lines = [
    `Max plan — ${plan.title} (${plan.format})`,
    `Canvas: ${plan.canvas.width}×${plan.canvas.height}`,
    plan.summary,
    '',
    'Pieces:'
  ]
  plan.items.forEach((it, i) => {
    const tag = it.kind === 'icon' ? 'icon' : it.kind === 'image' ? 'image' : 'svg'
    lines.push(`${i + 1}. [${tag}] ${it.id} @ (${it.x},${it.y}) ${it.w}×${it.h} — ${it.prompt.slice(0, 100)}`)
  })
  lines.push('', plan._composed
    ? 'Composed into a clean step grid. Build: panels → icons → arrows → captions.'
    : 'Build order: SVG layout → text/frames → icons → images')
  return lines.filter(Boolean).join('\n')
}

/**
 * Draw live layout placeholders so the canvas shows progress before content arrives.
 * @returns {Map<string, Element>}
 */
export function drawLayoutGuides (svgEditor, plan) {
  const { svgCanvas } = svgEditor
  const parent = svgCanvas.getCurrentGroup?.() ||
    svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()
  const map = new Map()
  if (!parent) return map

  const doc = svgCanvas.getDOMDocument()
  const layer = doc.createElementNS(NS_SVG, 'g')
  layer.setAttribute('id', svgCanvas.getNextId())
  layer.setAttribute('data-ai-max-guides', '1')
  layer.style.pointerEvents = 'none'
  parent.append(layer)

  plan.items.forEach((item, i) => {
    const g = doc.createElementNS(NS_SVG, 'g')
    g.setAttribute('data-ai-max-slot', item.id)

    const rect = doc.createElementNS(NS_SVG, 'rect')
    rect.setAttribute('x', String(item.x))
    rect.setAttribute('y', String(item.y))
    rect.setAttribute('width', String(item.w))
    rect.setAttribute('height', String(item.h))
    rect.setAttribute('fill', item.kind === 'svg' ? '#e8f0fe' : '#eef8f0')
    rect.setAttribute('fill-opacity', '0.55')
    rect.setAttribute('stroke', item.kind === 'svg' ? '#0D99FF' : '#3d9a5f')
    rect.setAttribute('stroke-width', '1.5')
    rect.setAttribute('stroke-dasharray', '6 4')
    rect.setAttribute('rx', '4')

    const label = doc.createElementNS(NS_SVG, 'text')
    label.setAttribute('x', String(item.x + 8))
    label.setAttribute('y', String(item.y + 18))
    label.setAttribute('fill', '#555')
    label.setAttribute('font-family', 'sans-serif')
    label.setAttribute('font-size', String(Math.min(14, Math.max(10, item.w / 18))))
    label.textContent = `${i + 1}. ${item.kind} · ${item.id}`

    const status = doc.createElementNS(NS_SVG, 'text')
    status.setAttribute('x', String(item.x + 8))
    status.setAttribute('y', String(item.y + item.h - 10))
    status.setAttribute('fill', '#888')
    status.setAttribute('font-family', 'sans-serif')
    status.setAttribute('font-size', '11')
    status.setAttribute('data-ai-max-status', '1')
    status.textContent = 'waiting…'

    g.append(rect, label, status)
    layer.append(g)
    map.set(item.id, g)
  })

  paint(svgEditor)
  return map
}

function setGuideState (guide, state) {
  if (!guide) return
  const rect = guide.querySelector('rect')
  const status = guide.querySelector('[data-ai-max-status]')
  if (!rect) return
  if (state === 'active') {
    rect.setAttribute('stroke-width', '2.5')
    rect.setAttribute('fill-opacity', '0.75')
    rect.setAttribute('stroke-dasharray', '4 3')
    if (status) status.textContent = 'generating…'
  } else if (state === 'done') {
    if (status) status.textContent = 'done'
  } else if (state === 'fail') {
    rect.setAttribute('stroke', '#c44')
    if (status) status.textContent = 'failed'
  }
}

function removeGuide (guide) {
  try { guide?.remove() } catch (_) { /* ignore */ }
}

function fadeInElement (el, ms = 280) {
  if (!el) return
  el.style.opacity = '0'
  el.style.transition = `opacity ${ms}ms ease`
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.opacity = '1'
    })
  })
}

/**
 * Place an SVG fragment into a positioned nested <svg> box with progressive child reveal.
 */
export async function placeSvgInBox (svgEditor, svgXml, box, opts = {}) {
  const { signal, stepMs = 28, onProgress } = opts
  const { svgCanvas } = svgEditor
  const { InsertElementCommand, BatchCommand } = svgCanvas.history
  let xml = svgXml
  if (!/\sxmlns=/.test(xml)) {
    xml = xml.replace(/<svg\b/i, `<svg xmlns="${NS_SVG}"`)
  }
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml')
  if (doc.querySelector('parsererror')) {
    return { ok: false, message: 'Invalid SVG fragment' }
  }
  const src = doc.documentElement
  if (!src || src.localName?.toLowerCase() !== 'svg') {
    return { ok: false, message: 'Not an SVG root' }
  }

  const parent = svgCanvas.getCurrentGroup?.() ||
    svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()
  if (!parent) return { ok: false, message: 'No layer' }

  const vb = src.getAttribute('viewBox') ||
    `0 0 ${src.getAttribute('width') || box.w} ${src.getAttribute('height') || box.h}`

  const batch = new BatchCommand('AI Max SVG')
  const nest = svgCanvas.getDOMDocument().createElementNS(NS_SVG, 'svg')
  nest.setAttribute('id', svgCanvas.getNextId())
  nest.setAttribute('x', String(box.x))
  nest.setAttribute('y', String(box.y))
  nest.setAttribute('width', String(box.w))
  nest.setAttribute('height', String(box.h))
  nest.setAttribute('viewBox', vb)
  nest.setAttribute('overflow', 'visible')
  nest.setAttribute('data-ai-max', opts.role || 'svg')
  parent.append(nest)
  batch.addSubCommand(new InsertElementCommand(nest))

  const kids = [...src.children].filter((c) => c.nodeType === 1)
  const defs = kids.filter((c) => c.tagName?.toLowerCase() === 'defs')
  const rest = kids.filter((c) => c.tagName?.toLowerCase() !== 'defs')

  for (const d of defs) {
    nest.append(svgCanvas.getDOMDocument().importNode(d, true))
  }

  const total = Math.max(1, rest.length)
  let i = 0
  for (const child of rest) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const node = svgCanvas.getDOMDocument().importNode(child, true)
    node.style.opacity = '0'
    node.style.transition = 'opacity 160ms ease'
    nest.append(node)
    requestAnimationFrame(() => { node.style.opacity = '1' })
    i++
    onProgress?.({ index: i, total, label: `Drawing ${i}/${total}` })
    paint(svgEditor)
    await delay(stepMs, signal)
  }

  svgCanvas.addCommandToHistory(batch)
  svgCanvas.selectOnly?.([nest], true)
  svgCanvas.call?.('changed', [nest])
  paint(svgEditor)
  return { ok: true, element: nest }
}

function buildSvgPieceSystemPrompt (box, role) {
  return `You generate ONE compact self-contained SVG piece for a scientific ${role || 'panel'}.
Output a complete <svg viewBox="0 0 ${box.w} ${box.h}" xmlns="http://www.w3.org/2000/svg"> … </svg>.
HARD LIMITS (critical — responses get truncated otherwise):
- Keep under ~60 elements total. Prefer rect/circle/line/path/text/g only.
- No nested <svg>, no images, no foreignObject, no scripts, no filters/effects stacks.
- Short labels only. Science-friendly flat colors. font-family="sans-serif".
Return ONLY the SVG markup.`
}

/**
 * Deterministic layout SVG for frames / headers / arrows / labels (no AI needed).
 */
export function buildStructuralSvgFallback (item, planTitle = '') {
  const { w, h, role, prompt, id, lines } = item
  const roleL = String(role || '').toLowerCase()
  const idL = String(id || '').toLowerCase()
  const uid = `m${String(id || 'x').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`
  const rawTitle = item.displayTitle || planTitle || extractShortTitle(prompt, id)
  const title = looksLikeIdLabel(rawTitle) ? (planTitle || 'Overview') : rawTitle

  // Full-canvas background + header bar
  if (roleL.includes('background') || idL.includes('bg') || idL.includes('layout')) {
    const headerH = Math.min(120, Math.max(72, Math.round(h * 0.14)))
    const main = planTitle || title
    const fs = Math.min(26, Math.max(16, Math.round(w / 48)))
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#eef2f6"/>
  <rect width="${w}" height="${headerH}" fill="#0f2744"/>
  <text x="40" y="${Math.round(headerH * 0.62)}" fill="#ffffff" font-family="sans-serif" font-size="${fs}" font-weight="700">${escapeXml(String(main).slice(0, 68))}</text>
</svg>`
  }

  // Title / header text banner
  if (roleL.includes('title') || roleL.includes('header') || idL.includes('header') || idL.includes('title')) {
    const fs = Math.min(28, Math.max(14, Math.round(Math.min(w, h) / 10)))
    const main = planTitle || title
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">
  <text x="0" y="${Math.round(h * 0.62)}" fill="#ffffff" font-family="sans-serif" font-size="${fs}" font-weight="700">${escapeXml(String(main).slice(0, 68))}</text>
</svg>`
  }

  // Single panel / card frame — no junk id labels
  if (roleL.includes('frame') || idL.includes('frame') || roleL.includes('panel') || idL.includes('panel')) {
    const heading = String(item.displayTitle || '').trim()
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">
  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="16" fill="#ffffff" stroke="#d8dee6" stroke-width="1.5"/>
  ${heading ? `<text x="18" y="32" fill="#0f2744" font-family="sans-serif" font-size="14" font-weight="700">${escapeXml(heading.slice(0, 42))}</text>` : ''}
</svg>`
  }

  if (roleL.includes('arrow') || idL.includes('arrow')) {
    const mid = Math.round(h / 2)
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">
  <defs>
    <marker id="${uid}ah" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#0D99FF"/>
    </marker>
  </defs>
  <line x1="8" y1="${mid}" x2="${w - 16}" y2="${mid}" stroke="#0D99FF" stroke-width="5" stroke-linecap="round" marker-end="url(#${uid}ah)"/>
</svg>`
  }

  if (roleL.includes('caption') || roleL.includes('label') || roleL.includes('annotation') ||
      idL.includes('caption') || idL.includes('label') || idL.includes('annotation')) {
    const rows = Array.isArray(lines) && lines.length
      ? lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 5)
      : [title]
    let texts = ''
    rows.forEach((line, i) => {
      const weight = i === 0 ? '700' : '400'
      const size = i === 0 ? 13 : 12
      const fill = i === 0 ? '#0f2744' : '#475569'
      const clipped = String(line).length > Math.floor(w / 7)
        ? `${String(line).slice(0, Math.max(4, Math.floor(w / 7) - 1))}…`
        : String(line)
      texts += `<text x="0" y="${18 + i * 20}" fill="${fill}" font-family="sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(clipped)}</text>\n`
    })
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">${texts}</svg>`
  }

  // Multi-card strip
  if (idL.includes('card') || idL.includes('step_card')) {
    const n = 3
    const gap = 20
    const cw = Math.floor((w - gap * (n + 1)) / n)
    const ch = h - gap * 2
    let rects = ''
    for (let i = 0; i < n; i++) {
      const x = gap + i * (cw + gap)
      rects += `<rect x="${x}" y="${gap}" width="${cw}" height="${ch}" rx="16" fill="#ffffff" stroke="#d0d7de" stroke-width="2"/>
      <text x="${x + 18}" y="${gap + 28}" fill="#0D99FF" font-family="sans-serif" font-size="16" font-weight="700">Step ${i + 1}</text>`
    }
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">${rects}</svg>`
  }

  return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
</svg>`
}

function looksLikeIdLabel (s) {
  const t = String(s || '').trim().toLowerCase()
  if (!t) return true
  if (t === 'bg' || t === 'flow' || t.includes('_')) return true
  if (/^(panels?|layout|header|caption|label|arrow|frame|annotation)\b/.test(t) && t.length < 24) return true
  return false
}

function extractShortTitle (prompt, id) {
  const fromPrompt = String(prompt || '')
    .replace(/^[^A-Za-z0-9'"]+/, '')
    .match(/(?:title|banner|heading)[^:]*:\s*['"]?([^.'"\n]+)/i)
  if (fromPrompt?.[1]) return fromPrompt[1].trim().slice(0, 72)
  const quoted = String(prompt || '').match(/['"]([^'"]{8,72})['"]/)
  if (quoted?.[1]) return quoted[1].trim()
  const first = String(prompt || '').split(/[.•\n]/)[0].trim()
  if (first.length > 8 && first.length < 80 && !looksLikeIdLabel(first)) return first
  return String(id || 'Panel').replace(/_/g, ' ')
}

function escapeXml (s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Layout chrome that should be drawn immediately as SVG (no model). */
export function isLayoutStructuralItem (item) {
  const roleL = String(item.role || '').toLowerCase()
  const idL = String(item.id || '').toLowerCase()
  const kind = String(item.kind || '').toLowerCase()
  if (kind !== 'svg') return false
  return (
    roleL.includes('background') || roleL.includes('title') || roleL.includes('header') ||
    roleL.includes('frame') || roleL.includes('panel') || roleL.includes('caption') ||
    roleL.includes('label') || roleL.includes('arrow') || roleL.includes('annotation') ||
    roleL.includes('decoration') ||
    idL.includes('bg') || idL.includes('layout') || idL.includes('header') || idL.includes('title') ||
    idL.includes('frame') || idL.includes('panel') || idL.includes('caption') || idL.includes('label') ||
    idL.includes('arrow') || idL.includes('annotation') || idL.includes('card')
  )
}

/**
 * Build order: background → panels → icons → arrows → captions (text on top)
 */
export function sortMaxBuildOrder (items) {
  const phase = (it) => {
    const kind = String(it.kind || 'svg').toLowerCase()
    const idL = `${it.id} ${it.role}`.toLowerCase()
    if (kind === 'svg' && (idL.includes('bg') || idL.includes('layout') || idL.includes('background'))) return 0
    if (kind === 'svg' && (idL.includes('frame') || idL.includes('panel') || idL.includes('card'))) return 1
    if (kind === 'svg' && (idL.includes('header') || idL.includes('title'))) return 2
    if (kind === 'svg' && isLayoutStructuralItem(it) && !idL.includes('arrow') && !idL.includes('caption') && !idL.includes('label') && !idL.includes('annotation')) return 3
    if (kind === 'svg' && !isLayoutStructuralItem(it)) return 4
    if (kind === 'icon') return 5
    if (kind === 'image') return 6
    if (kind === 'svg' && idL.includes('arrow')) return 7
    if (kind === 'svg' && (idL.includes('caption') || idL.includes('label') || idL.includes('annotation'))) return 8
    return 9
  }
  return [...items].sort((a, b) => phase(a) - phase(b))
}

async function generateSvgPiece (apiKey, textModel, item, signal, planTitle = '') {
  // Poster chrome: always local — reliable and instant
  if (isLayoutStructuralItem(item)) {
    return {
      svg: buildStructuralSvgFallback(item, planTitle),
      source: 'layout'
    }
  }

  const systemInstruction = buildSvgPieceSystemPrompt(item, item.role)
  const userText = `Create a compact SVG icon/diagram (${item.w}×${item.h}) for role="${item.role}".
Brief: ${item.prompt}
Keep it simple and complete. Flat scientific illustration style.`

  let lastErr = 'No SVG in model reply'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = await generateGeminiText({
        apiKey,
        model: textModel,
        contents: [{
          role: 'user',
          parts: [{
            text: attempt === 0
              ? userText
              : `${userText}\nRETRY: previous output was invalid/truncated. Use fewer shapes. Close all tags.`
          }]
        }],
        systemInstruction,
        signal,
        generationConfig: {
          temperature: attempt === 0 ? 0.35 : 0.2,
          maxOutputTokens: 12288
        }
      })
      const svg = extractSvgFromText(reply)
      if (svg) return { svg, source: attempt === 0 ? 'model' : 'model-retry' }
      lastErr = `Model reply had no usable <svg> (len=${(reply || '').length})`
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      lastErr = err?.message || String(err)
    }
  }

  return {
    svg: buildStructuralSvgFallback(item, planTitle),
    source: 'fallback',
    warning: lastErr
  }
}

/**
 * Run Max mode: plan then build with live canvas progress.
 * @param {object} ctx
 */
export async function runMaxMode (ctx) {
  const {
    svgEditor,
    apiKey,
    textModel,
    imageModel,
    userPrompt,
    includeCanvas,
    signal,
    onStep,
    onPlan,
    onItem
  } = ctx
  const { svgCanvas } = svgEditor
  const res = svgCanvas.getResolution?.() || { w: 1200, h: 800 }

  onStep?.(0, 'Planning layout')
  const planText = await generateGeminiText({
    apiKey,
    model: textModel,
    contents: [{
      role: 'user',
      parts: [{ text: userPrompt || 'Create a scientific graphical abstract.' }]
    }],
    systemInstruction: buildMaxPlanSystemPrompt({
      w: Math.round(res.w) || 1200,
      h: Math.round(res.h) || 800,
      userRequest: userPrompt || '',
      canvasSvg: includeCanvas ? svgCanvas.getSvgString() : ''
    }),
    signal
  })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const plan = extractMaxPlan(planText)
  if (!plan || !plan.items.length) {
    throw new Error('Could not parse Max layout plan. Try a clearer brief (e.g. “graphical abstract for CRISPR paper”).')
  }
  onPlan?.(plan, planText)

  onStep?.(1, 'Drawing layout on canvas')
  const empty = `<svg xmlns="${NS_SVG}" width="${plan.canvas.width}" height="${plan.canvas.height}"></svg>`
  if (svgCanvas.setSvgString(empty) === false) {
    throw new Error('Failed to prepare canvas for Max composition')
  }
  svgEditor.updateCanvas?.(true)
  await delay(40, signal)

  const guides = drawLayoutGuides(svgEditor, plan)
  await delay(180, signal)

  let okIcons = 0
  let okSvg = 0
  let fails = 0
  /** @type {string[]} */
  const failReasons = []
  /** @type {string[]} */
  const warnings = []

  const buildItems = sortMaxBuildOrder(plan.items)
  onStep?.(1, `SVG first (${buildItems.filter((x) => x.kind === 'svg').length}), then icons`)

  for (let i = 0; i < buildItems.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const item = buildItems[i]
    const guide = guides.get(item.id)
    setGuideState(guide, 'active')
    paint(svgEditor)
    const phaseLabel = item.kind === 'svg'
      ? (isLayoutStructuralItem(item) ? 'layout SVG' : 'SVG')
      : item.kind
    onStep?.(2, `${i + 1}/${buildItems.length} [${phaseLabel}]: ${item.id}`)
    onItem?.(item, i, buildItems.length)

    try {
      if (item.kind === 'icon' || item.kind === 'image') {
        const img = await generateGeminiImage({
          apiKey,
          model: imageModel,
          contents: [{
            role: 'user',
            parts: [{
              text: buildRasterPrompt(item.prompt, item.kind === 'icon' ? 'icon' : 'image')
            }]
          }],
          systemInstruction: item.kind === 'icon'
            ? 'BioRender-style scientific icon. Pure white background. Single subject. Always return an image.'
            : 'Generate the requested scientific illustration. Always return an image.',
          signal,
          aspectRatio: '1:1'
        })
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        removeGuide(guide)
        guides.delete(item.id)
        const placed = await placeImageOnCanvas(svgEditor, img.dataUrl, {
          mode: 'append',
          icon: item.kind === 'icon',
          x: item.x,
          y: item.y,
          width: item.w,
          height: item.h
        })
        if (placed.ok) {
          fadeInElement(placed.element, 320)
          okIcons++
        } else {
          fails++
          failReasons.push(`${item.id}: ${placed.message || 'image place failed'}`)
        }
        paint(svgEditor)
        await delay(120, signal)
      } else {
        const gen = await generateSvgPiece(apiKey, textModel, item, signal, plan.title)
        if (gen.warning) {
          warnings.push(`${item.id}: used layout fallback (${gen.warning})`)
        }
        removeGuide(guide)
        guides.delete(item.id)
        const placed = await placeSvgInBox(svgEditor, gen.svg, item, {
          role: item.role,
          signal,
          stepMs: gen.source === 'layout' ? 12 : 24,
          onProgress: (p) => onStep?.(3, `${item.id}: ${p.label}`)
        })
        if (placed.ok) {
          fadeInElement(placed.element, 200)
          okSvg++
        } else {
          fails++
          failReasons.push(`${item.id}: ${placed.message || 'svg place failed'}`)
        }
        paint(svgEditor)
        await delay(gen.source === 'layout' ? 40 : 80, signal)
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      setGuideState(guide, 'fail')
      fails++
      failReasons.push(`${item.id}: ${err?.message || String(err)}`)
      paint(svgEditor)
      onItem?.(item, i, buildItems.length, err)
    }
  }

  for (const g of guides.values()) removeGuide(g)

  onStep?.(4, 'Done')
  paint(svgEditor)
  return {
    plan,
    okIcons,
    okSvg,
    fails,
    total: plan.items.length,
    failReasons,
    warnings
  }
}
