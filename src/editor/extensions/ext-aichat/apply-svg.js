/**
 * Apply AI-generated SVG to the editor canvas.
 */

/**
 * @param {object} svgEditor
 * @param {string} svgXml
 * @param {'replace'|'append'} mode
 * @returns {{ ok: boolean, message?: string }}
 */
export function applySvgToCanvas (svgEditor, svgXml, mode) {
  const { svgCanvas } = svgEditor
  if (!svgXml?.includes('<svg')) {
    return { ok: false, message: 'Invalid SVG' }
  }

  // Ensure xmlns for parsers that require it
  let xml = svgXml
  if (!/\sxmlns=/.test(xml)) {
    xml = xml.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  if (mode === 'replace') {
    const ok = svgCanvas.setSvgString(xml) !== false
    if (!ok) return { ok: false, message: 'Failed to load SVG' }
    svgEditor.updateCanvas?.(true)
    try { svgEditor.zoomChanged?.(window, 'canvas') } catch (_) { /* ignore */ }
    return { ok: true }
  }

  // Append: import as symbol+use (undoable via svgcanvas)
  const el = svgCanvas.importSvgString(xml, true, true)
  if (!el) return { ok: false, message: 'Failed to import SVG' }
  svgCanvas.selectOnly?.([el], true)
  svgCanvas.call?.('changed', [el])
  svgEditor.updateCanvas?.(false)
  return { ok: true }
}

/**
 * Build system prompt for SVG drawing.
 * @param {{ w: number, h: number, mode: string, includeCanvas: boolean, canvasSvg?: string }} ctx
 */
export function buildSystemPrompt (ctx) {
  const { w, h, mode, includeCanvas, canvasSvg } = ctx
  let prompt = `You are an expert SVG illustrator for a scientific diagram editor (SVG-Edit / LabCanvas style).

TASK: Generate a complete, valid SVG drawing that fulfills the user's request.

RULES:
- Reply with SVG only (optional brief note after is ok, but the SVG must be present).
- Prefer a single root <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">.
- Use clean shapes: path, rect, circle, ellipse, line, polygon, text, g.
- No scripts, no foreignObject, no external images/URLs, no HTML.
- Use readable colors suitable for science figures (not neon purple themes).
- Keep IDs simple (e.g. ai_1, ai_2). Group related parts in <g>.
- Text should use font-family="sans-serif" or "serif".
- Mode is "${mode}": ${mode === 'replace' ? 'design a full self-contained scene for the canvas.' : 'design a self-contained graphic that will be imported onto an existing canvas (include its own viewBox; do not assume empty canvas).'}
`

  if (includeCanvas && canvasSvg) {
    const clipped = canvasSvg.length > 12000
      ? `${canvasSvg.slice(0, 12000)}\n<!-- truncated -->`
      : canvasSvg
    prompt += `\nCURRENT CANVAS SVG (context — modify/extend as asked):\n${clipped}\n`
  }

  return prompt
}
