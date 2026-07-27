/**
 * Vega-Lite chart templates and supported mark catalog.
 */

const SCHEMA = 'https://vega.github.io/schema/vega-lite/v6.json'

/** @type {Array<{id:string,label:string,mark:string,description:string}>} */
export const VEGA_MARK_TYPES = [
  { id: 'bar', label: 'Bar', mark: 'bar', description: 'Vertical bar chart' },
  { id: 'bar_horizontal', label: 'Bar (horizontal)', mark: 'bar', description: 'Horizontal bar chart' },
  { id: 'line', label: 'Line', mark: 'line', description: 'Line chart' },
  { id: 'area', label: 'Area', mark: 'area', description: 'Area chart' },
  { id: 'point', label: 'Scatter', mark: 'point', description: 'Scatter plot' },
  { id: 'circle', label: 'Circle', mark: 'circle', description: 'Circle scatter' },
  { id: 'square', label: 'Square', mark: 'square', description: 'Square markers' },
  { id: 'tick', label: 'Tick', mark: 'tick', description: 'Tick marks' },
  { id: 'rule', label: 'Rule', mark: 'rule', description: 'Reference lines' },
  { id: 'rect', label: 'Heatmap', mark: 'rect', description: 'Heatmap / matrix' },
  { id: 'arc', label: 'Pie / Donut', mark: 'arc', description: 'Pie or donut chart' },
  { id: 'boxplot', label: 'Box plot', mark: 'boxplot', description: 'Distribution box plot' },
  { id: 'errorbar', label: 'Error bar', mark: 'errorbar', description: 'Error bars' },
  { id: 'errorband', label: 'Error band', mark: 'errorband', description: 'Confidence band' },
  { id: 'trail', label: 'Trail', mark: 'trail', description: 'Connected trail' },
  { id: 'text', label: 'Text', mark: 'text', description: 'Text labels on data' },
  { id: 'trail_line', label: 'Connected scatter', mark: 'line', description: 'Points connected by line' },
  { id: 'histogram', label: 'Histogram', mark: 'bar', description: 'Binned histogram' }
]

/**
 * @param {string[]} columns
 * @param {string} templateId
 */
export function buildTemplateSpec (columns, templateId = 'bar') {
  const cat = columns.find((c) => /category|group|name|label|type|gene|sample/i.test(c)) || columns[0] || 'category'
  const val = columns.find((c) => /value|count|amount|score|fold|expression|rate|percent/i.test(c)) ||
    columns.find((c) => c !== cat) || columns[1] || 'value'
  const color = columns.find((c) => c !== cat && c !== val) || cat

  const base = {
    $schema: SCHEMA,
    title: 'Chart',
    data: { values: [] },
    width: 480,
    height: 300
  }

  switch (templateId) {
    case 'bar_horizontal':
      return {
        ...base,
        mark: 'bar',
        encoding: {
          y: { field: cat, type: 'nominal', title: cat },
          x: { field: val, type: 'quantitative', title: val }
        }
      }
    case 'line':
      return {
        ...base,
        mark: { type: 'line', point: true },
        encoding: {
          x: { field: cat, type: 'ordinal', title: cat },
          y: { field: val, type: 'quantitative', title: val }
        }
      }
    case 'area':
      return {
        ...base,
        mark: 'area',
        encoding: {
          x: { field: cat, type: 'ordinal', title: cat },
          y: { field: val, type: 'quantitative', title: val }
        }
      }
    case 'point':
    case 'circle':
    case 'square':
      return {
        ...base,
        mark: templateId === 'point' ? 'point' : templateId,
        encoding: {
          x: { field: cat, type: 'quantitative', title: cat },
          y: { field: val, type: 'quantitative', title: val },
          color: { field: color, type: 'nominal' }
        }
      }
    case 'arc':
      return {
        ...base,
        mark: { type: 'arc', innerRadius: 50 },
        encoding: {
          theta: { field: val, type: 'quantitative' },
          color: { field: cat, type: 'nominal' }
        }
      }
    case 'rect':
      return {
        ...base,
        mark: 'rect',
        encoding: {
          x: { field: cat, type: 'ordinal', title: cat },
          y: { field: color, type: 'ordinal', title: color },
          color: { field: val, type: 'quantitative', title: val }
        }
      }
    case 'boxplot':
      return {
        ...base,
        mark: 'boxplot',
        encoding: {
          x: { field: cat, type: 'nominal', title: cat },
          y: { field: val, type: 'quantitative', title: val }
        }
      }
    case 'errorbar':
      return {
        ...base,
        mark: 'errorbar',
        encoding: {
          x: { field: cat, type: 'nominal', title: cat },
          y: { field: val, type: 'quantitative', title: val }
        }
      }
    case 'errorband':
      return {
        ...base,
        mark: 'errorband',
        encoding: {
          x: { field: cat, type: 'ordinal', title: cat },
          y: { field: val, type: 'quantitative', title: val }
        }
      }
    case 'trail':
      return {
        ...base,
        mark: 'trail',
        encoding: {
          x: { field: cat, type: 'quantitative', title: cat },
          y: { field: val, type: 'quantitative', title: val },
          size: { value: 2 }
        }
      }
    case 'text':
      return {
        ...base,
        mark: 'text',
        encoding: {
          x: { field: cat, type: 'ordinal', title: cat },
          y: { field: val, type: 'quantitative', title: val },
          text: { field: val, type: 'quantitative' }
        }
      }
    case 'trail_line':
      return {
        ...base,
        mark: { type: 'line', point: true },
        encoding: {
          x: { field: cat, type: 'quantitative', title: cat },
          y: { field: val, type: 'quantitative', title: val },
          order: { field: cat, type: 'quantitative' }
        }
      }
    case 'histogram':
      return {
        ...base,
        mark: 'bar',
        encoding: {
          x: { field: val, type: 'quantitative', bin: true, title: val },
          y: { aggregate: 'count', title: 'Count' }
        }
      }
    case 'tick':
      return {
        ...base,
        mark: 'tick',
        encoding: {
          x: { field: cat, type: 'nominal', title: cat },
          y: { field: val, type: 'quantitative', title: val }
        }
      }
    case 'rule':
      return {
        ...base,
        mark: 'rule',
        encoding: {
          x: { field: cat, type: 'quantitative', title: cat },
          y: { field: val, type: 'quantitative', title: val }
        }
      }
    default:
      return {
        ...base,
        mark: 'bar',
        encoding: {
          x: { field: cat, type: 'nominal', title: cat },
          y: { field: val, type: 'quantitative', title: val }
        }
      }
  }
}

/**
 * Analysis types the AI can suggest for attached CSV.
 */
export const PLOT_ANALYSIS_TYPES = [
  'Distribution (histogram, box plot)',
  'Comparison (bar, grouped bar)',
  'Trend over categories (line, area)',
  'Relationship (scatter)',
  'Composition (pie / arc)',
  'Matrix / heatmap (rect)',
  'Uncertainty (error bar, error band)',
  'Correlation (scatter with color)',
  'Ranking (horizontal bar)',
  'Time series (line with ordinal x)'
]

/**
 * Prompt section listing all Vega-Lite marks for the model.
 */
export function buildVegaMarkCatalogSection () {
  const lines = VEGA_MARK_TYPES.map((m) => `- **${m.label}** (\`mark: ${m.mark}\`): ${m.description}`)
  return `# Vega-Lite chart types available
${lines.join('\n')}

Supported marks: bar, line, area, point, circle, square, tick, rule, rect (heatmap), arc (pie), boxplot, errorbar, errorband, trail, text.
Use layered charts (layer, facet, repeat) when the user confirms multiple views.`
}
