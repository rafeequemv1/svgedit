/**
 * Max mode — two-step graphical abstract / poster / slide builder.
 * Step 1: text model plans layout (JSON).
 * Step 2: generate BioRender icons + SVG pieces and place them.
 */

import { generateGeminiText, generateGeminiImage, extractSvgFromText } from './gemini.js'
import { placeImageOnCanvas, buildRasterPrompt } from './place-image.js'

const NS_SVG = 'http://www.w3.org/2000/svg'
const MAX_ITEMS = 14
const MAX_ICONS = 8

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
- Use kind="icon" for BioRender-style biological objects (cells, proteins, organs, labware) — single subject, will be transparent cutouts.
- Use kind="svg" for titles, captions, arrows, boxes, flowcharts, charts, labels, panels frames, connectors, geometric layouts.
- Use kind="image" sparingly for richer multi-object scenes that are not cutout icons.
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
  // Find outermost JSON object
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

  // Cap icon/image count
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
  lines.push('', 'Building now…')
  return lines.filter(Boolean).join('\n')
}

/**
 * Place an SVG fragment into a positioned nested <svg> box.
 */
export function placeSvgInBox (svgEditor, svgXml, box, opts = {}) {
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

  for (const child of [...src.childNodes]) {
    if (child.nodeType === 1) {
      nest.append(svgCanvas.getDOMDocument().importNode(child, true))
    }
  }
  parent.append(nest)
  batch.addSubCommand(new InsertElementCommand(nest))
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call?.('changed', [nest])
  return { ok: true, element: nest }
}

function buildSvgPieceSystemPrompt (box, role) {
  return `You generate ONE self-contained SVG piece for a scientific ${role || 'panel'}.
Output a complete <svg> with viewBox fitting the content. Preferred size ~${box.w}×${box.h}.
Rules: no scripts, no foreignObject, no external URLs. Use path/rect/circle/text/g. Science-friendly colors. font-family="sans-serif".
Return ONLY the SVG (optional short caption text outside is ok but SVG is required).`
}

/**
 * Run Max mode: plan then build.
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
    placeMode,
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

  onStep?.(1, 'Preparing canvas')
  const empty = `<svg xmlns="${NS_SVG}" width="${plan.canvas.width}" height="${plan.canvas.height}"></svg>`
  // Max compositions always size the canvas to the plan
  if (svgCanvas.setSvgString(empty) === false) {
    throw new Error('Failed to prepare canvas for Max composition')
  }
  svgEditor.updateCanvas?.(true)

  let okIcons = 0
  let okSvg = 0
  let fails = 0

  for (let i = 0; i < plan.items.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const item = plan.items[i]
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
        const placed = await placeImageOnCanvas(svgEditor, img.dataUrl, {
          mode: 'append',
          icon: item.kind === 'icon',
          x: item.x,
          y: item.y,
          width: item.w,
          height: item.h
        })
        if (placed.ok) okIcons++
        else fails++
      } else {
        const reply = await generateGeminiText({
          apiKey,
          model: textModel,
          contents: [{ role: 'user', parts: [{ text: item.prompt }] }],
          systemInstruction: buildSvgPieceSystemPrompt(item, item.role),
          signal
        })
        const svg = extractSvgFromText(reply)
        if (!svg) {
          fails++
          continue
        }
        const placed = placeSvgInBox(svgEditor, svg, item, { role: item.role })
        if (placed.ok) okSvg++
        else fails++
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      fails++
      onItem?.(item, i, plan.items.length, err)
    }
  }

  onStep?.(4, 'Done')
  svgEditor.updateCanvas?.(false)
  return {
    plan,
    okIcons,
    okSvg,
    fails,
    total: plan.items.length
  }
}
