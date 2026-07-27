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
- Use kind="svg" for titles, captions, arrows, boxes, flowcharts, charts, labels, panel frames, connectors — keep each SVG brief SIMPLE (flat shapes + short text; avoid full-scene illustrations in SVG).
- Use kind="icon" for BioRender-style biological objects (cells, proteins, organs, labware) — single subject, will be transparent cutouts.
- Use kind="image" sparingly for richer multi-object scenes that are not cutout icons.
- Prefer 1 background svg, 1 cards/frames svg, 1 arrows svg, 1 captions svg, plus 2–4 icons. Do not ask SVG pieces to render complex 3D chemistry.
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
        prompt: String(it.prompt || it.label || '').trim()
      }
    })
    .filter((it) => it.prompt)

  let raster = 0
  items = items.filter((it) => {
    if (it.kind === 'svg') return true
    raster++
    return raster <= MAX_ICONS
  }).slice(0, MAX_ITEMS)

  return {
    title: String(plan.title || 'Composition'),
    format: String(plan.format || 'figure'),
    canvas: { width, height },
    summary: String(plan.summary || ''),
    items
  }
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
  lines.push('', 'Building on canvas…')
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
 * Deterministic layout SVG when the model fails (keeps Max mode usable).
 */
export function buildStructuralSvgFallback (item) {
  const { w, h, role, prompt, id } = item
  const roleL = String(role || '').toLowerCase()
  const idL = String(id || '').toLowerCase()
  const title = (prompt || id || 'Panel').split(/[.•\n]/)[0].slice(0, 48)

  if (roleL.includes('background') || idL.includes('bg') || idL.includes('header')) {
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f2744"/>
      <stop offset="55%" stop-color="#f7f9fc"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <text x="36" y="48" fill="#ffffff" font-family="sans-serif" font-size="28" font-weight="700">${escapeXml(title)}</text>
</svg>`
  }

  if (roleL.includes('arrow') || idL.includes('arrow')) {
    const mid = Math.round(h / 2)
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">
  <defs>
    <marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#0D99FF"/>
    </marker>
  </defs>
  <line x1="8" y1="${mid}" x2="${Math.round(w / 2 - 20)}" y2="${mid}" stroke="#0D99FF" stroke-width="6" stroke-linecap="round" marker-end="url(#ah)"/>
  <line x1="${Math.round(w / 2 + 20)}" y1="${mid}" x2="${w - 16}" y2="${mid}" stroke="#0D99FF" stroke-width="6" stroke-linecap="round" marker-end="url(#ah)"/>
</svg>`
  }

  if (roleL.includes('caption') || roleL.includes('label') || idL.includes('caption') || idL.includes('label')) {
    const lines = String(prompt || '')
      .split(/(?:Step\s*\d|•|\n|;)/i)
      .map((s) => s.replace(/^[^A-Za-z0-9]+/, '').trim())
      .filter(Boolean)
      .slice(0, 3)
    const cols = Math.max(1, lines.length)
    const colW = w / cols
    const texts = lines.map((line, i) => {
      const cx = Math.round(colW * i + colW / 2)
      return `<text x="${cx}" y="${Math.round(h / 2)}" text-anchor="middle" fill="#1f2937" font-family="sans-serif" font-size="14">${escapeXml(line.slice(0, 70))}</text>`
    }).join('\n')
    return `<svg xmlns="${NS_SVG}" viewBox="0 0 ${w} ${h}">${texts || `<text x="20" y="30" fill="#333" font-family="sans-serif" font-size="14">${escapeXml(title)}</text>`}</svg>`
  }

  // Default: card / panel frame(s)
  if (roleL.includes('panel') || roleL.includes('card') || idL.includes('card') || idL.includes('step')) {
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
  <text x="16" y="28" fill="#334155" font-family="sans-serif" font-size="14">${escapeXml(title)}</text>
</svg>`
}

function escapeXml (s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function generateSvgPiece (apiKey, textModel, item, signal) {
  const systemInstruction = buildSvgPieceSystemPrompt(item, item.role)
  const userText = `Create a compact SVG (${item.w}×${item.h}) for role="${item.role}".
Brief: ${item.prompt}
Keep it simple and complete.`

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

  // Structural fallback so the abstract still composes
  return {
    svg: buildStructuralSvgFallback(item),
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

  for (let i = 0; i < plan.items.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const item = plan.items[i]
    const guide = guides.get(item.id)
    setGuideState(guide, 'active')
    paint(svgEditor)
    onStep?.(2, `${i + 1}/${plan.items.length}: ${item.id}`)
    onItem?.(item, i, plan.items.length)

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
        const gen = await generateSvgPiece(apiKey, textModel, item, signal)
        if (gen.warning) {
          warnings.push(`${item.id}: used layout fallback (${gen.warning})`)
        }
        removeGuide(guide)
        guides.delete(item.id)
        const placed = await placeSvgInBox(svgEditor, gen.svg, item, {
          role: item.role,
          signal,
          stepMs: 24,
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
        await delay(80, signal)
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      setGuideState(guide, 'fail')
      fails++
      failReasons.push(`${item.id}: ${err?.message || String(err)}`)
      paint(svgEditor)
      onItem?.(item, i, plan.items.length, err)
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
