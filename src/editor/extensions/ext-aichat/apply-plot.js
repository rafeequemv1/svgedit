/**
 * Render AI plot specs (Vega-Lite / ECharts) to SVG on the canvas.
 */

import { applySvgToCanvas } from './apply-svg.js'
import { primaryCsvTable } from './csv-attach.js'

/** @type {Promise<any>|null} */
let echartsReady = null
/** @type {Promise<any>|null} */
let vegaEmbedReady = null

async function loadVegaEmbed () {
  if (!vegaEmbedReady) {
    vegaEmbedReady = import('vega-embed').then((m) => m.default || m)
  }
  return vegaEmbedReady
}

async function loadEcharts () {
  if (!echartsReady) {
    echartsReady = (async () => {
      const echarts = await import('echarts/core')
      const { BarChart, LineChart, ScatterChart, PieChart, BoxplotChart, HeatmapChart } = await import('echarts/charts')
      const {
        GridComponent, TooltipComponent, LegendComponent, TitleComponent,
        DatasetComponent, ToolboxComponent
      } = await import('echarts/components')
      const { SVGRenderer } = await import('echarts/renderers')
      echarts.use([
        BarChart, LineChart, ScatterChart, PieChart, BoxplotChart, HeatmapChart,
        GridComponent, TooltipComponent, LegendComponent, TitleComponent,
        DatasetComponent, ToolboxComponent, SVGRenderer
      ])
      return echarts
    })()
  }
  return echartsReady
}

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
 * @param {object} obj
 */
function isVegaLiteSpec (obj) {
  if (!obj || typeof obj !== 'object') return false
  const schema = String(obj.$schema || '')
  if (/vega-lite/i.test(schema)) return true
  return !!(obj.mark && obj.encoding)
}

/**
 * @param {object} obj
 */
function isEchartsOption (obj) {
  if (!obj || typeof obj !== 'object') return false
  return !!(obj.series || obj.xAxis || obj.dataset || obj.radar)
}

/**
 * @param {string} text
 * @param {'vega'|'echarts'} preferred
 */
export function extractPlotSpecFromText (text, preferred = 'vega') {
  const vega = extractFencedJson(text, ['vega-lite', 'vega', 'vl', 'json'])
  const echarts = extractFencedJson(text, ['echarts', 'echart', 'json'])
  const vegaOk = isVegaLiteSpec(vega)
  const echartsOk = isEchartsOption(echarts)

  if (preferred === 'echarts') {
    if (echartsOk) return { engine: 'echarts', spec: echarts }
    if (vegaOk) return { engine: 'vega', spec: vega }
  } else {
    if (vegaOk) return { engine: 'vega', spec: vega }
    if (echartsOk) return { engine: 'echarts', spec: echarts }
  }
  return null
}

/**
 * @param {object} spec
 * @param {{rows:object[]}|null} csv
 */
export function injectCsvIntoVegaSpec (spec, csv) {
  const copy = JSON.parse(JSON.stringify(spec))
  if (!csv?.rows?.length) return copy
  if (!copy.data) copy.data = {}
  if (!copy.data.values || !Array.isArray(copy.data.values) || copy.data.values.length < 2) {
    copy.data.values = csv.rows
  }
  return copy
}

/**
 * @param {object} opt
 * @param {{rows:object[]}|null} csv
 */
export function injectCsvIntoEchartsOption (opt, csv) {
  const copy = JSON.parse(JSON.stringify(opt))
  if (!csv?.rows?.length) return copy
  if (!copy.dataset) copy.dataset = {}
  if (!copy.dataset.source || !Array.isArray(copy.dataset.source) || copy.dataset.source.length < 2) {
    copy.dataset.source = csv.rows
  }
  return copy
}

/**
 * @param {string} inner
 * @param {number} w
 * @param {number} h
 */
function wrapSvg (inner, w, h) {
  const body = String(inner || '').trim()
  if (/^<svg[\s>]/i.test(body)) return body
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
}

/**
 * @param {object} spec
 * @param {{w:number,h:number}} size
 */
export async function vegaSpecToSvg (spec, size = { w: 640, h: 400 }) {
  const embed = await loadVegaEmbed()
  const w = Math.max(280, Math.round(spec.width || size.w - 48))
  const h = Math.max(200, Math.round(spec.height || size.h - 80))
  const vs = { ...spec, width: w, height: h }
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden'
  document.body.appendChild(host)
  try {
    const result = await embed(host, vs, { actions: false, renderer: 'svg' })
    const svg = await result.view.toSVG()
    result.view.finalize()
    return wrapSvg(svg, w, h)
  } finally {
    host.remove()
  }
}

/**
 * @param {object} option
 * @param {{w:number,h:number}} size
 */
export async function echartsOptionToSvg (option, size = { w: 640, h: 400 }) {
  const echarts = await loadEcharts()
  const w = Math.max(280, size.w - 48)
  const h = Math.max(200, size.h - 80)
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px`
  document.body.appendChild(host)
  try {
    const chart = echarts.init(host, null, { renderer: 'svg', width: w, height: h })
    chart.setOption(option, { notMerge: true })
    const svgEl = host.querySelector('svg')
    const xml = svgEl?.outerHTML || ''
    chart.dispose()
    if (!xml) throw new Error('ECharts produced no SVG')
    return wrapSvg(xml, w, h)
  } finally {
    host.remove()
  }
}

/**
 * @param {{engine:'vega'|'echarts',spec:object}} plot
 * @param {{rows:object[]}[]} csvFiles
 * @param {{w:number,h:number}} canvasSize
 */
export async function renderPlotToSvg (plot, csvFiles, canvasSize) {
  const csv = primaryCsvTable(csvFiles)
  if (plot.engine === 'echarts') {
    const opt = injectCsvIntoEchartsOption(plot.spec, csv)
    return echartsOptionToSvg(opt, canvasSize)
  }
  const spec = injectCsvIntoVegaSpec(plot.spec, csv)
  return vegaSpecToSvg(spec, canvasSize)
}

/**
 * @param {string} text
 */
export function stripPlotBlocksFromReply (text) {
  return String(text || '')
    .replace(/```(?:vega-lite|vega|vl|echarts|echart)\s*[\s\S]*?```/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * @param {'vega'|'echarts'} engine
 */
export function buildPlotPromptSection (engine = 'vega') {
  if (engine === 'echarts') {
    return `# Data plots (ECharts — ON)
When the user asks for a chart/graph/plot (especially with CSV data), output ONE fenced block FIRST:

\`\`\`echarts
{
  "title": { "text": "Chart title", "left": "center" },
  "tooltip": {},
  "legend": {},
  "dataset": { "source": [] },
  "xAxis": { "type": "category" },
  "yAxis": { "type": "value" },
  "series": [{ "type": "bar" }]
}
\`\`\`

Rules:
- Leave \`dataset.source\` as \`[]\` when CSV is attached — the host injects all rows.
- Map columns with \`encode: { x: "columnName", y: "columnName" }\` on series when using dataset.
- Supported types: bar, line, scatter, pie, boxplot, heatmap.
- Short caption AFTER the fence. Do not also draw the same chart as hand-made SVG.`
  }
  return `# Data plots (Vega-Lite — ON)
When the user asks for a chart/graph/plot (especially with CSV data), output ONE fenced block FIRST:

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
- Marks: bar, line, point, area, boxplot, rect (heatmap), arc (pie).
- Short caption AFTER the fence. Do not also draw the same chart as hand-made SVG.`
}

/**
 * @param {object} svgEditor
 * @param {string} replyText
 * @param {'vega'|'echarts'} engine
 * @param {Array<{rows:object[]}>} csvFiles
 * @param {'replace'|'append'} mode
 * @param {{w:number,h:number}} canvasSize
 */
export async function applyPlotFromReply (svgEditor, replyText, engine, csvFiles, mode, canvasSize) {
  const plot = extractPlotSpecFromText(replyText, engine)
  if (!plot) return { ok: false, message: 'No plot spec in reply' }
  try {
    const svg = await renderPlotToSvg(plot, csvFiles, canvasSize)
    const result = applySvgToCanvas(svgEditor, svg, mode)
    return { ...result, engine: plot.engine }
  } catch (err) {
    return { ok: false, message: err?.message || String(err), engine: plot.engine }
  }
}
