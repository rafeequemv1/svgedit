/**
 * Vega-Lite chart templates and supported mark catalog.
 */

const SCHEMA = 'https://vega.github.io/schema/vega-lite/v6.json'

/**
 * @typedef {{id:string,label:string,mark:string,category:string,description:string}} ChartTemplate
 */

/** @type {ChartTemplate[]} */
export const VEGA_MARK_TYPES = [
  // 1. Bar & column
  { id: 'bar', label: 'Bar (vertical)', mark: 'bar', category: 'Bar & column', description: 'Simple vertical bar chart' },
  { id: 'bar_horizontal', label: 'Bar (horizontal)', mark: 'bar', category: 'Bar & column', description: 'Horizontal bar chart' },
  { id: 'bar_grouped', label: 'Grouped bar', mark: 'bar', category: 'Bar & column', description: 'Side-by-side bars by series' },
  { id: 'bar_stacked', label: 'Stacked bar', mark: 'bar', category: 'Bar & column', description: 'Stacked bars showing composition' },
  { id: 'bar_normalized', label: '100% stacked bar', mark: 'bar', category: 'Bar & column', description: 'Normalized stacked bar (part-to-whole)' },

  // 2. Line & step
  { id: 'line', label: 'Line', mark: 'line', category: 'Line & step', description: 'Single-series trend line' },
  { id: 'line_multi', label: 'Multi-series line', mark: 'line', category: 'Line & step', description: 'Multiple series with color encoding' },
  { id: 'line_step', label: 'Step chart', mark: 'line', category: 'Line & step', description: 'Step-interpolated line chart' },
  { id: 'slope', label: 'Slope graph', mark: 'line', category: 'Line & step', description: 'Change between two points per category' },

  // 3. Scatter & bubble
  { id: 'point', label: 'Scatter', mark: 'point', category: 'Scatter & bubble', description: 'X/Y scatter plot' },
  { id: 'circle', label: 'Circle scatter', mark: 'circle', category: 'Scatter & bubble', description: 'Circle point markers' },
  { id: 'square', label: 'Square scatter', mark: 'square', category: 'Scatter & bubble', description: 'Square point markers' },
  { id: 'bubble', label: 'Bubble plot', mark: 'point', category: 'Scatter & bubble', description: 'Scatter with size encoding' },

  // 4. Area
  { id: 'area', label: 'Area', mark: 'area', category: 'Area', description: 'Single-series area chart' },
  { id: 'area_stacked', label: 'Stacked area', mark: 'area', category: 'Area', description: 'Stacked area by series' },
  { id: 'streamgraph', label: 'Streamgraph', mark: 'area', category: 'Area', description: 'Stacked area with wiggle offset' },

  // 5. Histogram & density
  { id: 'histogram', label: 'Histogram', mark: 'bar', category: 'Histogram & density', description: 'Binned distribution' },
  { id: 'density', label: 'Density plot', mark: 'area', category: 'Histogram & density', description: 'Kernel density estimate' },
  { id: 'strip', label: 'Strip plot', mark: 'tick', category: 'Histogram & density', description: '1D tick distribution along axis' },

  // 6. Box plot & error
  { id: 'boxplot', label: 'Box plot', mark: 'boxplot', category: 'Box plot & error', description: 'Median, IQR, whiskers' },
  { id: 'errorbar', label: 'Error bar', mark: 'errorbar', category: 'Box plot & error', description: 'Uncertainty bars' },
  { id: 'errorband', label: 'Error band', mark: 'errorband', category: 'Box plot & error', description: 'Confidence / SE band around line' },

  // 7. Heatmap & matrix
  { id: 'rect', label: 'Heatmap', mark: 'rect', category: 'Heatmap & matrix', description: '2D grid with color scale' },

  // 8. Pie & donut
  { id: 'arc', label: 'Pie chart', mark: 'arc', category: 'Pie & donut', description: 'Polar arc part-to-whole' },
  { id: 'arc_donut', label: 'Donut chart', mark: 'arc', category: 'Pie & donut', description: 'Pie with inner radius' },

  // 9. Ranged / Gantt
  { id: 'gantt', label: 'Gantt / ranged bar', mark: 'bar', category: 'Ranged & Gantt', description: 'Bar segments with start and end' },
  { id: 'ranged_rule', label: 'Ranged rule', mark: 'rule', category: 'Ranged & Gantt', description: 'Line segment between two values' },

  // 10. Strip / tick (1D)
  { id: 'tick', label: 'Tick plot', mark: 'tick', category: 'Strip & tick', description: 'Tick marks on one axis' },
  { id: 'tick_strip', label: 'Strip (row)', mark: 'tick', category: 'Strip & tick', description: 'Ticks faceted by row' },

  // 11. Radar
  { id: 'radar', label: 'Radar / spider', mark: 'line', category: 'Radar', description: 'Polar multivariate line chart' },

  // 12. Faceted / multi-panel
  { id: 'facet_row', label: 'Facet by row', mark: 'point', category: 'Faceted', description: 'Small multiples in rows' },
  { id: 'facet_col', label: 'Facet by column', mark: 'point', category: 'Faceted', description: 'Small multiples in columns' },
  { id: 'facet_grid', label: 'Facet grid', mark: 'point', category: 'Faceted', description: 'Row × column facet grid' },

  // Other marks
  { id: 'rule', label: 'Rule / reference', mark: 'rule', category: 'Other', description: 'Reference line or span' },
  { id: 'trail', label: 'Trail', mark: 'trail', category: 'Other', description: 'Variable-width connected path' },
  { id: 'text', label: 'Text labels', mark: 'text', category: 'Other', description: 'Text mark on data points' },
  { id: 'trail_line', label: 'Connected scatter', mark: 'line', category: 'Other', description: 'Ordered points connected by line' }
]

/** @type {string[]} */
export const VEGA_MARK_CATEGORIES = [...new Set(VEGA_MARK_TYPES.map((m) => m.category))]

/** Demo rows for chart previews and quick-create without CSV. */
export const CHART_SAMPLE_ROWS = [
  { category: 'A', series: 'S1', value: 24, start: 5, end: 28, size: 12, facet: 'R1' },
  { category: 'B', series: 'S1', value: 42, start: 12, end: 38, size: 18, facet: 'R1' },
  { category: 'C', series: 'S1', value: 35, start: 20, end: 55, size: 14, facet: 'R1' },
  { category: 'A', series: 'S2', value: 18, start: 8, end: 32, size: 10, facet: 'R2' },
  { category: 'B', series: 'S2', value: 50, start: 15, end: 45, size: 22, facet: 'R2' },
  { category: 'C', series: 'S2', value: 28, start: 25, end: 60, size: 16, facet: 'R2' }
]

/**
 * @param {string} templateId
 * @param {Array<{columns:string[],rows:object[]}>|null} [csvFiles]
 */
export function buildChartSpecForCreate (templateId, csvFiles = null) {
  const csv = csvFiles?.[0]
  const columns = csv?.columns?.length
    ? csv.columns
    : Object.keys(CHART_SAMPLE_ROWS[0])
  const spec = buildTemplateSpec(columns, templateId)
  const meta = VEGA_MARK_TYPES.find((m) => m.id === templateId)
  spec.title = meta?.label || 'Chart'
  spec.data = { values: (csv?.rows?.length ? csv.rows : CHART_SAMPLE_ROWS).slice(0, 5000) }
  return spec
}

/**
 * Compact spec for modal thumbnail preview.
 * @param {string} templateId
 */
export function buildPreviewSpec (templateId) {
  const spec = buildChartSpecForCreate(templateId, null)
  spec.width = 168
  spec.height = 104
  spec.title = null
  if (spec.config) delete spec.config
  return spec
}

/**
 * @param {string} templateId
 */
export function getChartTemplateMeta (templateId) {
  return VEGA_MARK_TYPES.find((m) => m.id === templateId) || null
}

/**
 * @param {string[]} columns
 */
function pickColumns (columns) {
  const cat = columns.find((c) => /category|group|name|label|type|gene|sample|series|condition/i.test(c)) || columns[0] || 'category'
  const val = columns.find((c) => /value|count|amount|score|fold|expression|rate|percent|y/i.test(c)) ||
    columns.find((c) => c !== cat) || columns[1] || 'value'
  const series = columns.find((c) => c !== cat && c !== val && /series|group|color|condition|treatment/i.test(c)) ||
    columns.find((c) => c !== cat && c !== val) || cat
  const start = columns.find((c) => /start|begin|from|x0|t0/i.test(c)) || cat
  const end = columns.find((c) => /end|finish|to|x1|t1/i.test(c)) || val
  const size = columns.find((c) => /size|radius|magnitude/i.test(c)) || val
  const facet = columns.find((c) => /facet|panel|split|replicate/i.test(c)) || series
  return { cat, val, series, start, end, size, facet }
}

/**
 * @param {string[]} columns
 * @param {string} templateId
 */
export function buildTemplateSpec (columns, templateId = 'bar') {
  const { cat, val, series, start, end, size, facet } = pickColumns(columns)
  const base = {
    $schema: SCHEMA,
    title: 'Chart',
    data: { values: [] },
    width: 480,
    height: 300
  }

  switch (templateId) {
    case 'bar_horizontal':
      return { ...base, mark: 'bar', encoding: { y: { field: cat, type: 'nominal' }, x: { field: val, type: 'quantitative' } } }
    case 'bar_grouped':
      return { ...base, mark: 'bar', encoding: { x: { field: cat, type: 'nominal' }, y: { field: val, type: 'quantitative' }, xOffset: { field: series, type: 'nominal' }, color: { field: series, type: 'nominal' } } }
    case 'bar_stacked':
      return { ...base, mark: 'bar', encoding: { x: { field: cat, type: 'nominal' }, y: { field: val, type: 'quantitative', stack: 'zero' }, color: { field: series, type: 'nominal' } } }
    case 'bar_normalized':
      return { ...base, mark: 'bar', encoding: { x: { field: cat, type: 'nominal' }, y: { field: val, type: 'quantitative', stack: 'normalize' }, color: { field: series, type: 'nominal' } } }
    case 'line':
      return { ...base, mark: { type: 'line', point: true }, encoding: { x: { field: cat, type: 'ordinal' }, y: { field: val, type: 'quantitative' } } }
    case 'line_multi':
      return { ...base, mark: { type: 'line', point: true }, encoding: { x: { field: cat, type: 'ordinal' }, y: { field: val, type: 'quantitative' }, color: { field: series, type: 'nominal' } } }
    case 'line_step':
      return { ...base, mark: { type: 'line', interpolate: 'step-after', point: true }, encoding: { x: { field: cat, type: 'ordinal' }, y: { field: val, type: 'quantitative' } } }
    case 'slope':
      return { ...base, mark: { type: 'line', point: true }, encoding: { x: { field: start, type: 'nominal' }, x2: { field: end, type: 'nominal' }, y: { field: cat, type: 'nominal' }, detail: { field: cat, type: 'nominal' } } }
    case 'circle':
    case 'square':
      return { ...base, mark: templateId, encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' }, color: { field: series, type: 'nominal' } } }
    case 'bubble':
      return { ...base, mark: 'point', encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' }, size: { field: size, type: 'quantitative' }, color: { field: series, type: 'nominal' } } }
    case 'area':
      return { ...base, mark: 'area', encoding: { x: { field: cat, type: 'ordinal' }, y: { field: val, type: 'quantitative' } } }
    case 'area_stacked':
      return { ...base, mark: 'area', encoding: { x: { field: cat, type: 'ordinal' }, y: { field: val, type: 'quantitative', stack: 'zero' }, color: { field: series, type: 'nominal' } } }
    case 'streamgraph':
      return { ...base, mark: 'area', encoding: { x: { field: cat, type: 'ordinal' }, y: { field: val, type: 'quantitative', stack: 'center' }, color: { field: series, type: 'nominal' } } }
    case 'histogram':
      return { ...base, mark: 'bar', encoding: { x: { field: val, type: 'quantitative', bin: true }, y: { aggregate: 'count' } } }
    case 'density':
      return {
        ...base,
        transform: [{ density: val, as: ['value', 'density'] }],
        mark: 'area',
        encoding: { x: { field: 'value', type: 'quantitative' }, y: { field: 'density', type: 'quantitative' } }
      }
    case 'strip':
      return { ...base, mark: 'tick', encoding: { x: { field: val, type: 'quantitative' }, y: { field: cat, type: 'nominal' } } }
    case 'boxplot':
      return { ...base, mark: 'boxplot', encoding: { x: { field: cat, type: 'nominal' }, y: { field: val, type: 'quantitative' } } }
    case 'errorbar':
      return { ...base, mark: 'errorbar', encoding: { x: { field: cat, type: 'nominal' }, y: { field: val, type: 'quantitative' } } }
    case 'errorband':
      return { ...base, mark: 'errorband', encoding: { x: { field: cat, type: 'ordinal' }, y: { field: val, type: 'quantitative' } } }
    case 'rect':
      return { ...base, mark: 'rect', encoding: { x: { field: cat, type: 'ordinal' }, y: { field: series, type: 'ordinal' }, color: { field: val, type: 'quantitative' } } }
    case 'arc':
      return { ...base, mark: 'arc', encoding: { theta: { field: val, type: 'quantitative' }, color: { field: cat, type: 'nominal' } } }
    case 'arc_donut':
      return { ...base, mark: { type: 'arc', innerRadius: 60 }, encoding: { theta: { field: val, type: 'quantitative' }, color: { field: cat, type: 'nominal' } } }
    case 'gantt':
      return { ...base, mark: 'bar', encoding: { y: { field: cat, type: 'nominal' }, x: { field: start, type: 'quantitative' }, x2: { field: end, type: 'quantitative' } } }
    case 'ranged_rule':
      return { ...base, mark: 'rule', encoding: { x: { field: start, type: 'quantitative' }, x2: { field: end, type: 'quantitative' }, y: { field: cat, type: 'nominal' } } }
    case 'tick':
      return { ...base, mark: 'tick', encoding: { x: { field: cat, type: 'nominal' }, y: { field: val, type: 'quantitative' } } }
    case 'tick_strip':
      return { ...base, mark: 'tick', encoding: { x: { field: val, type: 'quantitative' }, row: { field: cat, type: 'nominal' } } }
    case 'radar':
      return {
        ...base,
        width: 360,
        height: 360,
        mark: { type: 'line', point: true, clip: true },
        encoding: {
          theta: { field: cat, type: 'nominal' },
          radius: { field: val, type: 'quantitative' },
          color: { field: series, type: 'nominal' }
        }
      }
    case 'facet_row':
      return { ...base, mark: 'point', encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' } }, facet: { row: { field: facet, type: 'nominal' } } }
    case 'facet_col':
      return { ...base, mark: 'point', encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' } }, facet: { column: { field: facet, type: 'nominal' } } }
    case 'facet_grid':
      return { ...base, mark: 'point', encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' } }, facet: { row: { field: facet, type: 'nominal' }, column: { field: series, type: 'nominal' } } }
    case 'rule':
      return { ...base, mark: 'rule', encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' } } }
    case 'trail':
      return { ...base, mark: 'trail', encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' }, size: { value: 2 } } }
    case 'text':
      return { ...base, mark: 'text', encoding: { x: { field: cat, type: 'ordinal' }, y: { field: val, type: 'quantitative' }, text: { field: val, type: 'quantitative' } } }
    case 'trail_line':
      return { ...base, mark: { type: 'line', point: true }, encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' }, order: { field: cat, type: 'quantitative' } } }
    case 'point':
      return { ...base, mark: 'point', encoding: { x: { field: cat, type: 'quantitative' }, y: { field: val, type: 'quantitative' }, color: { field: series, type: 'nominal' } } }
    default:
      return { ...base, mark: 'bar', encoding: { x: { field: cat, type: 'nominal' }, y: { field: val, type: 'quantitative' } } }
  }
}

/**
 * Guess template id from an existing Vega-Lite spec.
 * @param {object} spec
 */
export function guessTemplateIdFromSpec (spec) {
  if (!spec) return 'bar'
  if (spec.facet?.row && spec.facet?.column) return 'facet_grid'
  if (spec.facet?.row) return 'facet_row'
  if (spec.facet?.column) return 'facet_col'
  if (spec.transform?.some?.((t) => t.density)) return 'density'
  const enc = spec.encoding || {}
  const mark = typeof spec.mark === 'string' ? spec.mark : spec.mark?.type
  if (mark === 'arc') {
    return spec.mark?.innerRadius ? 'arc_donut' : 'arc'
  }
  if (mark === 'bar') {
    if (enc.x2 || enc.y2) return 'gantt'
    if (enc.y?.stack === 'normalize') return 'bar_normalized'
    if (enc.y?.stack === 'zero' || enc.x?.stack === 'zero') return 'bar_stacked'
    if (enc.xOffset) return 'bar_grouped'
    if (enc.x?.bin || enc.y?.bin) return 'histogram'
    if (enc.y?.type === 'nominal' && enc.x?.type === 'quantitative') return 'bar_horizontal'
    return 'bar'
  }
  if (mark === 'line') {
    if (enc.theta && enc.radius) return 'radar'
    if (spec.mark?.interpolate === 'step-after') return 'line_step'
    if (enc.x2) return 'slope'
    if (enc.color?.field) return 'line_multi'
    return 'line'
  }
  if (mark === 'area') {
    if (enc.y?.stack === 'center') return 'streamgraph'
    if (enc.color?.field && enc.y?.stack) return 'area_stacked'
    return 'area'
  }
  if (mark === 'point' && enc.size?.field) return 'bubble'
  if (mark === 'point') return 'point'
  if (mark === 'circle') return 'circle'
  if (mark === 'square') return 'square'
  if (mark === 'tick') {
    if (enc.row) return 'tick_strip'
    return enc.y?.type === 'nominal' ? 'strip' : 'tick'
  }
  if (mark === 'rule' && enc.x2) return 'ranged_rule'
  if (mark === 'rect') return 'rect'
  if (mark === 'boxplot') return 'boxplot'
  if (mark === 'errorbar') return 'errorbar'
  if (mark === 'errorband') return 'errorband'
  if (mark === 'trail') return 'trail'
  if (mark === 'text') return 'text'
  if (mark === 'rule') return 'rule'
  return 'bar'
}

/**
 * Analysis types the AI can suggest for attached CSV.
 */
export const PLOT_ANALYSIS_TYPES = [
  'Bar & column (simple, grouped, stacked, 100%)',
  'Line & step (trend, multi-series, slope graph)',
  'Scatter & bubble (x/y, size, color, shape)',
  'Area & streamgraph (stacked composition over time)',
  'Histogram & density (distribution of continuous data)',
  'Box plot & error bars (median, IQR, uncertainty)',
  'Heatmap & matrix (2D color grid)',
  'Pie & donut (part-to-whole)',
  'Gantt & ranged bars (start–end intervals)',
  'Strip & tick plots (1D distributions)',
  'Radar / spider (multivariate polar)',
  'Faceted small multiples (row, column, grid)'
]

/**
 * Build HTML <option> groups for the chart type select.
 */
export function buildMarkTypeSelectHtml () {
  return VEGA_MARK_CATEGORIES.map((cat) => {
    const items = VEGA_MARK_TYPES.filter((m) => m.category === cat)
    const opts = items.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')
    return `<optgroup label="${cat}">${opts}</optgroup>`
  }).join('')
}

/**
 * Prompt section listing all Vega-Lite chart families for the model.
 */
export function buildVegaMarkCatalogSection () {
  const families = VEGA_MARK_CATEGORIES.map((cat) => {
    const items = VEGA_MARK_TYPES.filter((m) => m.category === cat)
    const lines = items.map((m) => `  - ${m.label}: ${m.description}`)
    return `### ${cat}\n${lines.join('\n')}`
  }).join('\n\n')

  return `# Vega-Lite chart catalog (${VEGA_MARK_TYPES.length} templates)

Use the appropriate \`mark\` and \`encoding\` (and \`facet\`, \`layer\`, \`transform\` when needed):

${families}

**Marks:** bar, line, area, point, circle, square, tick, rule, rect, arc, boxplot, errorbar, errorband, trail, text.
**Composition:** layer (overlay), facet / row / column (small multiples), repeat, concat.
**Transforms:** bin, aggregate, density, filter, calculate, fold, pivot.
**Stacks:** stack "zero" (stacked), "normalize" (100%), "center" (streamgraph).
**Polar:** theta + radius encodings for pie/donut/radar.
**Ranged:** x/x2 or y/y2 for Gantt bars and ranged rules.
Emit multiple \`\`\`vega-lite blocks when the user confirms several chart types.`
}
