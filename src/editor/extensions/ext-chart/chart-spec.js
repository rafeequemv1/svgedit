/**
 * Vega-Lite chart groups on the canvas (metadata + re-render).
 */

import { parseSvgDocument } from '../ext-aichat/reveal-svg.js'
import { vegaSpecToSvg } from '../ext-aichat/vega-render.js'
import { injectCsvIntoVegaSpec } from '../ext-aichat/csv-attach.js'

const NS_SVG = 'http://www.w3.org/2000/svg'
export const CHART_SHAPE = 'chart'
const META_ROLE = 'plot-spec'

/**
 * @param {Element|null|undefined} el
 * @returns {SVGGElement|null}
 */
export function findChartGroup (el) {
  let cur = el
  while (cur && cur.nodeType === 1) {
    if (cur.getAttribute?.('shape') === CHART_SHAPE) return /** @type {SVGGElement} */ (cur)
    if (cur.tagName === 'svg' || cur.id === 'svgcontent') break
    cur = cur.parentNode
  }
  return null
}

/**
 * @param {Element} group
 */
export function getPlotMetadataEl (group) {
  return group.querySelector?.(`metadata[data-role="${META_ROLE}"]`) || null
}

/**
 * @param {Element} group
 * @returns {object|null}
 */
export function readPlotSpec (group) {
  const meta = getPlotMetadataEl(group)
  if (!meta?.textContent?.trim()) return null
  try {
    return JSON.parse(meta.textContent)
  } catch {
    return null
  }
}

/**
 * @param {Document} doc
 * @param {Element} group
 * @param {object} spec
 */
export function writePlotSpec (doc, group, spec) {
  let meta = getPlotMetadataEl(group)
  if (!meta) {
    meta = doc.createElementNS(NS_SVG, 'metadata')
    meta.setAttribute('data-role', META_ROLE)
    group.insertBefore(meta, group.firstChild)
  }
  meta.textContent = JSON.stringify(spec)
}

/**
 * @param {object} spec
 * @returns {string[]}
 */
export function specColumnNames (spec) {
  const cols = new Set()
  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return
    if (typeof obj.field === 'string') cols.add(obj.field)
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') walk(v)
    }
  }
  walk(spec.encoding)
  if (Array.isArray(spec.data?.values)?.[0]) {
    Object.keys(spec.data.values[0]).forEach((k) => cols.add(k))
  }
  return [...cols]
}

/**
 * @param {object} spec
 */
export function getMarkType (spec) {
  const m = spec?.mark
  if (typeof m === 'string') return m
  if (m && typeof m === 'object' && m.type) return m.type
  return 'bar'
}

/**
 * @param {object} spec
 * @param {string} mark
 */
export function setMarkType (spec, mark) {
  const copy = JSON.parse(JSON.stringify(spec))
  if (copy.mark && typeof copy.mark === 'object') {
    copy.mark.type = mark
  } else {
    copy.mark = mark
  }
  return copy
}

/**
 * @param {object} spec
 */
export function getTitle (spec) {
  if (typeof spec?.title === 'string') return spec.title
  if (spec?.title?.text) return spec.title.text
  return ''
}

/**
 * @param {object} spec
 * @param {string} title
 */
export function setTitle (spec, title) {
  const copy = JSON.parse(JSON.stringify(spec))
  if (!title) {
    delete copy.title
    return copy
  }
  if (typeof copy.title === 'object') copy.title.text = title
  else copy.title = title
  return copy
}

/**
 * @param {Element} group
 */
export function getChartVisualChildren (group) {
  return [...group.childNodes].filter((n) =>
    n.nodeType === 1 && !(n.tagName?.toLowerCase() === 'metadata' && n.getAttribute('data-role') === META_ROLE)
  )
}

/**
 * @param {object} svgEditor
 * @param {Element} group
 * @param {object} spec
 * @param {{rows:object[]}[]|null} [csvFiles]
 */
export async function rerenderChartGroup (svgEditor, group, spec, csvFiles = null) {
  const { svgCanvas } = svgEditor
  const csv = csvFiles?.[0] || null
  const fullSpec = injectCsvIntoVegaSpec(spec, csv)
  delete fullSpec.autosize
  const w = Number(fullSpec.width) || 520
  const h = Number(fullSpec.height) || 320
  const svgStr = await vegaSpecToSvg(fullSpec, { w: w + 48, h: h + 80 })
  const parsed = parseSvgDocument(svgStr)
  if (!parsed) throw new Error('Chart render produced invalid SVG')

  const doc = svgCanvas.getDOMDocument()
  getChartVisualChildren(group).forEach((ch) => ch.remove())
  for (const child of parsed.kids) {
    const node = doc.importNode(child, true)
    try { svgCanvas.uniquifyElems?.(node) } catch (_) { /* ignore */ }
    group.appendChild(node)
  }
  for (const d of parsed.defs) {
    const node = doc.importNode(d, true)
    try { svgCanvas.uniquifyElems?.(node) } catch (_) { /* ignore */ }
    group.insertBefore(node, group.firstChild?.nextSibling || null)
  }
  writePlotSpec(doc, group, fullSpec)
  svgCanvas.call?.('changed', [group])
  svgEditor.updateCanvas?.(false)
  return group
}

/**
 * @param {object} svgEditor
 * @param {object} spec
 * @param {{rows:object[]}[]|null} csvFiles
 * @param {'replace'|'append'} mode
 * @param {{w:number,h:number}} canvasSize
 * @param {Element|null} [replaceGroup]
 */
export async function placeChartOnCanvas (svgEditor, spec, csvFiles, mode, canvasSize, replaceGroup = null) {
  const { svgCanvas } = svgEditor
  const fullSpec = injectCsvIntoVegaSpec(spec, csvFiles?.[0] || null)
  const w = Number(fullSpec.width) || Math.max(280, canvasSize.w - 48)
  const h = Number(fullSpec.height) || Math.max(200, canvasSize.h - 80)
  fullSpec.width = w
  fullSpec.height = h

  if (mode === 'replace' && !replaceGroup) {
    const empty = `<svg xmlns="${NS_SVG}" width="${canvasSize.w}" height="${canvasSize.h}" viewBox="0 0 ${canvasSize.w} ${canvasSize.h}"></svg>`
    svgCanvas.setSvgString(empty)
  }

  const svgStr = await vegaSpecToSvg(fullSpec, canvasSize)
  const parsed = parseSvgDocument(svgStr)
  if (!parsed) return { ok: false, message: 'Chart render failed' }

  const { InsertElementCommand, BatchCommand } = svgCanvas.history
  const parent = replaceGroup?.parentNode ||
    svgCanvas.getCurrentGroup?.() ||
    svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()
  if (!parent) return { ok: false, message: 'No layer' }

  const doc = svgCanvas.getDOMDocument()
  const batch = new BatchCommand(replaceGroup ? 'Update chart' : 'Place chart')

  let group = replaceGroup
  if (!group) {
    group = doc.createElementNS(NS_SVG, 'g')
    group.setAttribute('id', svgCanvas.getNextId())
    group.setAttribute('shape', CHART_SHAPE)
    group.setAttribute('data-plot-engine', 'vega-lite')
    parent.append(group)
    batch.addSubCommand(new InsertElementCommand(group))
  } else {
    getChartVisualChildren(group).forEach((ch) => ch.remove())
  }

  writePlotSpec(doc, group, fullSpec)
  for (const d of parsed.defs) {
    const node = doc.importNode(d, true)
    try { svgCanvas.uniquifyElems?.(node) } catch (_) { /* ignore */ }
    group.appendChild(node)
  }
  for (const child of parsed.kids) {
    const node = doc.importNode(child, true)
    try { svgCanvas.uniquifyElems?.(node) } catch (_) { /* ignore */ }
    group.appendChild(node)
  }

  if (batch.stack?.length) svgCanvas.addCommandToHistory(batch)
  svgCanvas.selectOnly?.([group], true)
  svgCanvas.call?.('changed', [group])
  svgEditor.updateCanvas?.(false)
  return { ok: true, element: group, spec: fullSpec }
}

/**
 * @param {object} svgEditor
 * @returns {Element|null}
 */
export function getSelectedChartGroup (svgEditor) {
  const sel = svgEditor.svgCanvas.getSelectedElements?.() || []
  for (const el of sel) {
    const g = findChartGroup(el)
    if (g) return g
  }
  return null
}

/**
 * @param {object} svgEditor
 * @returns {{group:Element,spec:object}|null}
 */
export function getSelectedChartContext (svgEditor) {
  const group = getSelectedChartGroup(svgEditor)
  if (!group) return null
  const spec = readPlotSpec(group)
  if (!spec) return null
  return { group, spec }
}
