import { diagnoseAndSanitizeSvg, smoothAiImportedGraphics } from './apply-svg.js'

/**
 * Progressive SVG reveal on canvas (client-side only — no extra AI cost).
 */

const NS_SVG = 'http://www.w3.org/2000/svg'

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

/**
 * @param {string} svgXml
 * @returns {{ svg: Element, defs: Element[], kids: Element[] }|null}
 */
export function parseSvgDocument (svgXml) {
  const diagnosed = diagnoseAndSanitizeSvg(svgXml)
  if (!diagnosed.ok) return null
  let xml = diagnosed.xml
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml')
  if (doc.querySelector('parsererror')) return null
  const svg = doc.documentElement
  if (!svg || svg.localName?.toLowerCase() !== 'svg') return null
  const defs = []
  const kids = []
  for (const child of [...svg.children]) {
    const tag = child.tagName?.toLowerCase()
    if (tag === 'defs') defs.push(child)
    else if (child.nodeType === 1) kids.push(child)
  }
  return { svg, defs, kids, details: diagnosed.details }
}

/**
 * Apply SVG with per-element reveal animation (no extra model calls).
 * @returns {Promise<{ ok: boolean, message?: string, group?: Element }>}
 */
export async function applySvgToCanvasAnimated (svgEditor, svgXml, mode, opts = {}) {
  const { onProgress, signal, stepMs = 36 } = opts
  const { svgCanvas } = svgEditor
  const parsed = parseSvgDocument(svgXml)
  if (!parsed) {
    const d = diagnoseAndSanitizeSvg(svgXml)
    return { ok: false, message: d.message || 'Invalid SVG', details: d.details }
  }

  const { InsertElementCommand, BatchCommand } = svgCanvas.history
  const layer = svgCanvas.getCurrentGroup?.() ||
    svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()
  if (!layer) return { ok: false, message: 'No layer' }

  if (mode === 'replace') {
    // Clear document content then draw progressively into a fresh canvas size
    const w = parsed.svg.getAttribute('width') || parsed.svg.viewBox?.baseVal?.width
    const h = parsed.svg.getAttribute('height') || parsed.svg.viewBox?.baseVal?.height
    const empty = `<svg xmlns="${NS_SVG}" width="${w || 640}" height="${h || 480}"></svg>`
    if (svgCanvas.setSvgString(empty) === false) {
      return { ok: false, message: 'Failed to reset canvas' }
    }
  }

  const parent = svgCanvas.getCurrentGroup?.() ||
    svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()
  if (!parent) return { ok: false, message: 'No layer' }

  const batch = new BatchCommand('AI Draw')
  const g = svgCanvas.getDOMDocument().createElementNS(NS_SVG, 'g')
  g.setAttribute('id', svgCanvas.getNextId())
  g.setAttribute('data-ai-draw', '1')
  parent.append(g)
  batch.addSubCommand(new InsertElementCommand(g))

  // Defs first (instant)
  for (const d of parsed.defs) {
    const node = svgCanvas.getDOMDocument().importNode(d, true)
    try { svgCanvas.uniquifyElems?.(node) } catch (_) { /* ignore */ }
    g.append(node)
  }

  const total = Math.max(1, parsed.kids.length)
  let i = 0
  for (const child of parsed.kids) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const node = svgCanvas.getDOMDocument().importNode(child, true)
    try { svgCanvas.uniquifyElems?.(node) } catch (_) { /* ignore */ }
    // Soft fade-in without extra network
    if (!node.getAttribute('opacity')) {
      node.style.opacity = '0'
      node.style.transition = 'opacity 180ms ease'
    }
    g.append(node)
    requestAnimationFrame(() => {
      node.style.opacity = node.getAttribute('opacity') || '1'
    })
    i++
    onProgress?.({
      index: i,
      total,
      label: `Drawing ${i}/${total}`
    })
    await delay(stepMs, signal)
  }

  smoothAiImportedGraphics(svgEditor, g)
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.selectOnly?.([g], true)
  svgCanvas.call?.('changed', [g])
  svgEditor.updateCanvas?.(mode === 'replace')
  if (mode === 'replace') {
    try { svgEditor.zoomChanged?.(window, 'canvas') } catch (_) { /* ignore */ }
  }
  return { ok: true, group: g }
}

/**
 * Replace currently selected elements with AI SVG (progressive).
 */
export async function replaceSelectionWithSvg (svgEditor, svgXml, opts = {}) {
  const { svgCanvas } = svgEditor
  const selected = (svgCanvas.getSelectedElements?.() || []).filter(Boolean)
  if (!selected.length) {
    return applySvgToCanvasAnimated(svgEditor, svgXml, 'append', opts)
  }

  const { RemoveElementCommand, InsertElementCommand, BatchCommand } = svgCanvas.history
  const batch = new BatchCommand('AI Edit Selection')
  const parent = selected[0].parentNode
  const nextSibling = selected[selected.length - 1].nextSibling

  for (const el of selected) {
    const next = el.nextSibling
    const par = el.parentNode
    el.remove()
    batch.addSubCommand(new RemoveElementCommand(el, next, par))
  }

  // Temporarily append progressive group at same parent
  const parsed = parseSvgDocument(svgXml)
  if (!parsed) {
    const d = diagnoseAndSanitizeSvg(svgXml)
    return { ok: false, message: d.message || 'Invalid SVG', details: d.details }
  }

  const g = svgCanvas.getDOMDocument().createElementNS(NS_SVG, 'g')
  g.setAttribute('id', svgCanvas.getNextId())
  g.setAttribute('data-ai-edit', '1')
  parent.insertBefore(g, nextSibling)
  batch.addSubCommand(new InsertElementCommand(g))

  for (const d of parsed.defs) {
    g.append(svgCanvas.getDOMDocument().importNode(d, true))
  }

  const { signal, onProgress, stepMs = 36 } = opts
  const total = Math.max(1, parsed.kids.length)
  let i = 0
  for (const child of parsed.kids) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const node = svgCanvas.getDOMDocument().importNode(child, true)
    try { svgCanvas.uniquifyElems?.(node) } catch (_) { /* ignore */ }
    node.style.opacity = '0'
    node.style.transition = 'opacity 180ms ease'
    g.append(node)
    requestAnimationFrame(() => { node.style.opacity = '1' })
    i++
    onProgress?.({ index: i, total, label: `Updating ${i}/${total}` })
    await delay(stepMs, signal)
  }

  smoothAiImportedGraphics(svgEditor, g)
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.selectOnly?.([g], true)
  svgCanvas.call?.('changed', [g])
  svgEditor.updateCanvas?.(false)
  return { ok: true, group: g }
}

/**
 * Snapshot selected elements as SVG markup for the model.
 */
export function serializeSelection (svgCanvas) {
  const selected = (svgCanvas.getSelectedElements?.() || []).filter(Boolean)
  if (!selected.length) return ''
  const ser = new XMLSerializer()
  return selected.map((el) => ser.serializeToString(el)).join('\n')
}
