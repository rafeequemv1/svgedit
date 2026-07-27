/**
 * Render AI Vega-Lite plot specs to chart groups on the canvas.
 */

import { placeChartOnCanvas } from '../ext-chart/chart-spec.js'
import { buildVegaMarkCatalogSection } from '../ext-chart/chart-templates.js'

/**
 * @param {string} text
 * @param {string[]} tags
 */
function extractFencedJson (text, tags) {
  for (const tag of tags) {
    const re = new RegExp('```\\s*' + tag + '\\s*([\\s\\S]*?)```', 'i')
    const m = String(text || '').match(re)
    if (!m?.[1]) continue
    const raw = m[1].trim()
    try {
      return JSON.parse(raw)
    } catch {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try { return JSON.parse(raw.slice(start, end + 1)) } catch { /* ignore */ }
      }
    }
  }
  return null
}

/**
 * @param {string} text
 * @param {string} tag
 * @returns {object[]}
 */
function extractAllFencedJson (text, tag) {
  const re = new RegExp('```\\s*' + tag + '\\s*([\\s\\S]*?)```', 'gi')
  const out = []
  let m
  const src = String(text || '')
  while ((m = re.exec(src)) !== null) {
    const raw = m[1].trim()
    try {
      out.push(JSON.parse(raw))
    } catch {
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try { out.push(JSON.parse(raw.slice(start, end + 1))) } catch { /* ignore */ }
      }
    }
  }
  return out
}

/**
 * @param {object} obj
 */
function isVegaLiteSpec (obj) {
  if (!obj || typeof obj !== 'object') return false
  const schema = String(obj.$schema || '')
  if (/vega-lite/i.test(schema)) return true
  return !!(obj.mark && obj.encoding)
}

/**
 * @param {string} text
 */
export function extractPlotSpecFromText (text) {
  const vega = extractFencedJson(text, ['vega-lite', 'vega', 'vl'])
  if (isVegaLiteSpec(vega)) return { engine: 'vega-lite', spec: vega }
  const loose = extractFencedJson(text, ['json'])
  if (isVegaLiteSpec(loose)) return { engine: 'vega-lite', spec: loose }
  return null
}

/**
 * @param {string} text
 * @returns {object[]}
 */
export function extractAllPlotSpecsFromText (text) {
  const fromVega = extractAllFencedJson(text, 'vega-lite')
    .concat(extractAllFencedJson(text, 'vega'))
    .concat(extractAllFencedJson(text, 'vl'))
    .filter(isVegaLiteSpec)
  if (fromVega.length) return fromVega
  return extractAllFencedJson(text, 'json').filter(isVegaLiteSpec)
}

/**
 * @param {string} text
 */
export function stripPlotBlocksFromReply (text) {
  return String(text || '')
    .replace(/```(?:vega-lite|vega|vl)\s*[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Build Vega-Lite plot instructions for the system prompt.
 */
export function buildPlotPromptSection () {
  return `# Data plots (Vega-Lite — ON)
When the user asks for a chart/graph/plot (especially with CSV data), output ONE OR MORE fenced blocks FIRST:

\`\`\`vega-lite
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "title": "Chart title",
  "data": { "values": [] },
  "mark": "bar",
  "encoding": {
    "x": { "field": "category", "type": "nominal" },
    "y": { "field": "value", "type": "quantitative" }
  }
}
\`\`\`

Rules:
- Leave \`data.values\` as \`[]\` when CSV is attached — the host injects all rows.
- Use correct field names from the CSV columns in \`encoding\`.
- For multiple charts (after user confirms), emit multiple \`\`\`vega-lite blocks (one per chart).
- Short caption AFTER the fence(s). Do not also draw the same chart as hand-made SVG.

${buildVegaMarkCatalogSection()}`
}

/**
 * Prompt when user asks what analyses/plots are possible (CSV attached, no render yet).
 */
export function buildPlotAnalysisPromptSection () {
  return `# CSV plot exploration (suggest only — do NOT emit vega-lite yet)
The user attached CSV data and wants analysis suggestions.

List suitable options from ALL Vega-Lite families (bar/column, line/step, scatter/bubble, area/stream, histogram/density, box/error, heatmap, pie/donut, Gantt/ranged, strip/tick, radar, faceted small multiples).

For each suggestion: name the chart type, columns to use, and the scientific question it answers.
End with: "Reply **yes** or name the plots you want (e.g. grouped bar + scatter + heatmap), and I will generate them."
Do NOT output \`\`\`vega-lite blocks until the user confirms.`
}

/**
 * @param {object} svgEditor
 * @param {string} replyText
 * @param {Array<{rows:object[]}>} csvFiles
 * @param {'replace'|'append'} mode
 * @param {{w:number,h:number}} canvasSize
 * @param {Element|null} [replaceGroup]
 */
export async function applyPlotFromReply (svgEditor, replyText, csvFiles, mode, canvasSize, replaceGroup = null) {
  const specs = extractAllPlotSpecsFromText(replyText)
  const single = extractPlotSpecFromText(replyText)
  const toRender = specs.length ? specs : (single ? [single.spec] : [])
  if (!toRender.length) return { ok: false, message: 'No plot spec in reply' }

  const results = []
  let lastGroup = replaceGroup
  for (let i = 0; i < toRender.length; i++) {
    const spec = toRender[i]
    const placeMode = (i === 0 && mode === 'replace' && !replaceGroup) ? 'replace' : 'append'
    try {
      const result = await placeChartOnCanvas(
        svgEditor,
        spec,
        csvFiles,
        placeMode,
        canvasSize,
        i === 0 ? replaceGroup : null
      )
      results.push(result)
      if (result.ok && result.element) lastGroup = result.element
    } catch (err) {
      results.push({ ok: false, message: err?.message || String(err) })
    }
  }
  const okCount = results.filter((r) => r.ok).length
  return {
    ok: okCount > 0,
    count: okCount,
    total: toRender.length,
    element: lastGroup,
    engine: 'vega-lite',
    message: okCount ? `Placed ${okCount} chart(s)` : (results[0]?.message || 'Plot failed')
  }
}
