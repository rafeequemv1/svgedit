/**
 * Read/write Vega-Lite chart properties for the properties panel.
 */

/** @type {string[]} */
export const COLOR_SCHEMES = [
  'category10', 'category20', 'tableau10', 'tableau20',
  'blues', 'greens', 'reds', 'oranges', 'purples', 'greys',
  'viridis', 'magma', 'inferno', 'plasma', 'turbo',
  'spectral', 'rdylgn', 'set1', 'set2', 'paired', 'accent', 'dark2', 'pastel1', 'pastel2'
]

/**
 * @param {object} obj
 * @param {string} path
 * @param {*} [fallback]
 */
export function deepGet (obj, path, fallback = '') {
  const val = path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)
  return val === undefined || val === null ? fallback : val
}

/**
 * @param {object} obj
 * @param {string} path
 * @param {*} value
 */
export function deepSet (obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  if (value === '' || value === null || value === undefined) delete cur[parts[parts.length - 1]]
  else cur[parts[parts.length - 1]] = value
}

/**
 * @param {object} spec
 * @param {string} channel
 */
export function encodingField (spec, channel) {
  const enc = spec?.encoding?.[channel]
  if (!enc) return ''
  if (typeof enc.field === 'string') return enc.field
  return ''
}

/**
 * @param {object} spec
 */
export function hasColorField (spec) {
  return !!encodingField(spec, 'color')
}

/**
 * @param {string} raw
 */
export function normalizeHex (raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase()
  if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s.toLowerCase()
  return ''
}

/**
 * @param {object} spec
 */
export function readControlValues (spec) {
  const mark = typeof spec.mark === 'object' ? spec.mark : { type: spec.mark || 'bar' }
  const padding = spec.padding
  let pad = 20
  if (typeof padding === 'number') pad = padding
  else if (padding && typeof padding === 'object') {
    pad = Number(padding.left ?? padding.top ?? 20) || 20
  }

  return {
    title: typeof spec.title === 'string' ? spec.title : (spec.title?.text || ''),
    width: Number(spec.width) || 480,
    height: Number(spec.height) || 300,
    opacity: Number(mark.opacity ?? spec.encoding?.opacity?.value ?? 1),
    strokeWidth: Number(mark.strokeWidth ?? 1),
    pointSize: Number(mark.size ?? spec.encoding?.size?.value ?? 80),
    innerRadius: Number(mark.innerRadius ?? 0),
    padding: pad,
    markFill: normalizeHex(
      spec.encoding?.color?.value ||
      spec.encoding?.fill?.value ||
      mark.fill ||
      mark.color ||
      '#4c78a8'
    ),
    markStroke: normalizeHex(mark.stroke || spec.encoding?.stroke?.value || '#000000'),
    background: normalizeHex(deepGet(spec, 'config.background', '#ffffff')),
    axisLabel: normalizeHex(deepGet(spec, 'config.axis.labelColor', '#666666')),
    axisGrid: normalizeHex(deepGet(spec, 'config.axis.gridColor', '#dddddd')),
    titleColor: normalizeHex(deepGet(spec, 'config.title.color', '#333333')),
    colorScheme: deepGet(spec, 'encoding.color.scale.scheme', 'category10') || 'category10',
    showLegend: deepGet(spec, 'config.legend.disable', false) !== true,
    legendOrient: deepGet(spec, 'config.legend.orient', 'right') || 'right'
  }
}

/**
 * @param {object} spec
 * @param {object} values
 */
export function applyControlValues (spec, values) {
  const next = JSON.parse(JSON.stringify(spec))
  if (!next.config) next.config = {}
  if (!next.config.axis) next.config.axis = {}
  if (!next.config.title) next.config.title = {}
  if (!next.config.legend) next.config.legend = {}

  if (values.title) {
    if (typeof next.title === 'object') next.title.text = values.title
    else next.title = values.title
  } else {
    delete next.title
  }

  if (Number.isFinite(values.width) && values.width > 0) next.width = values.width
  if (Number.isFinite(values.height) && values.height > 0) next.height = values.height

  const markType = typeof next.mark === 'object' ? next.mark.type : (next.mark || 'bar')
  const mark = typeof next.mark === 'object' ? { ...next.mark } : { type: markType }
  mark.opacity = Math.max(0, Math.min(1, Number(values.opacity) || 1))
  mark.strokeWidth = Math.max(0, Number(values.strokeWidth) || 0)
  if (['point', 'circle', 'square', 'bubble'].includes(markType) || markType === 'point') {
    mark.size = Math.max(4, Number(values.pointSize) || 80)
  }
  if (markType === 'arc' && Number(values.innerRadius) > 0) {
    mark.innerRadius = Number(values.innerRadius)
  }
  if (values.markStroke) {
    const stroke = normalizeHex(values.markStroke) || values.markStroke
    mark.stroke = stroke
    next.mark = mark
  }
  next.mark = mark

  if (!hasColorField(next) && values.markFill) {
    if (!next.encoding) next.encoding = {}
    const fill = normalizeHex(values.markFill) || values.markFill
    next.encoding.color = { value: fill }
    mark.fill = fill
    next.mark = mark
  } else if (hasColorField(next) && values.colorScheme) {
    if (!next.encoding.color) next.encoding.color = {}
    next.encoding.color.type = next.encoding.color.type || 'nominal'
    next.encoding.color.scale = {
      ...(next.encoding.color.scale || {}),
      scheme: values.colorScheme
    }
  }

  const pad = Math.max(0, Number(values.padding) || 0)
  next.padding = { left: pad, right: pad, top: pad, bottom: pad }

  if (values.background) deepSet(next, 'config.background', values.background)
  else delete next.config.background

  if (values.axisLabel) next.config.axis.labelColor = values.axisLabel
  if (values.axisGrid) next.config.axis.gridColor = values.axisGrid
  if (values.titleColor) next.config.title.color = values.titleColor

  next.config.legend.disable = !values.showLegend
  if (values.showLegend) next.config.legend.orient = values.legendOrient || 'right'

  return next
}

/**
 * Bind range + number inputs to stay in sync.
 * @param {HTMLInputElement|null} rangeEl
 * @param {HTMLInputElement|null} numEl
 * @param {() => void} onChange
 */
export function bindRangeNumber (rangeEl, numEl, onChange) {
  if (!rangeEl || !numEl) return
  const sync = (from) => {
    if (from === 'range') numEl.value = rangeEl.value
    else {
      const n = Number(numEl.value)
      if (Number.isFinite(n)) {
        const min = Number(rangeEl.min)
        const max = Number(rangeEl.max)
        const clamped = Math.min(max, Math.max(min, n))
        rangeEl.value = String(clamped)
        numEl.value = String(clamped)
      }
    }
    onChange()
  }
  rangeEl.addEventListener('input', () => sync('range'))
  numEl.addEventListener('input', () => sync('num'))
  numEl.addEventListener('change', () => sync('num'))
}

/**
 * @param {HTMLInputElement|null} pickerEl
 * @param {HTMLInputElement|null} textEl
 * @param {() => void} onChange
 */
export function bindColorPair (pickerEl, textEl, onChange) {
  if (!pickerEl || !textEl) return
  const syncFromPicker = () => {
    textEl.value = pickerEl.value
    onChange()
  }
  const syncFromText = () => {
    const hex = normalizeHex(textEl.value)
    if (hex) {
      pickerEl.value = hex
      textEl.value = hex
      onChange()
    }
  }
  pickerEl.addEventListener('input', syncFromPicker)
  textEl.addEventListener('input', syncFromText)
  textEl.addEventListener('change', syncFromText)
}

/**
 * @param {string} id
 * @param {string} label
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {number} [value]
 */
export function rangeFieldHtml (id, label, min, max, step, value = min) {
  return `
    <label class="chart_range_field">
      <span>${label}</span>
      <div class="chart_range_row">
        <input type="range" id="${id}_range" min="${min}" max="${max}" step="${step}" value="${value}" />
        <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>
    </label>
  `
}

/**
 * @param {string} id
 * @param {string} label
 * @param {string} [value]
 */
export function colorFieldHtml (id, label, value = '#4c78a8') {
  const v = normalizeHex(value) || '#4c78a8'
  return `
    <label class="chart_color_field">
      <span>${label}</span>
      <div class="chart_color_row">
        <input type="color" id="${id}_picker" value="${v}" />
        <input type="text" id="${id}" spellcheck="false" value="${v}" />
      </div>
    </label>
  `
}
