/**
 * Place a generated raster image onto the SVG canvas.
 */

/**
 * Remove near-white background → transparent PNG.
 * Only clears white connected to the image edges (flood-fill), so white
 * inside the subject is preserved.
 * @param {string} dataUrl
 * @param {number} [threshold=248]
 * @returns {Promise<string>}
 */
export function knockOutWhiteBackground (dataUrl, threshold = 248) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, w, h)
      const { data } = imageData
      const isBg = (idx) => {
        const i = idx * 4
        return data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold && data[i + 3] > 0
      }

      const visited = new Uint8Array(w * h)
      const queue = []
      const push = (x, y) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return
        const idx = y * w + x
        if (visited[idx]) return
        if (!isBg(idx)) return
        visited[idx] = 1
        queue.push(idx)
      }

      // Seed from all four edges
      for (let x = 0; x < w; x++) {
        push(x, 0)
        push(x, h - 1)
      }
      for (let y = 0; y < h; y++) {
        push(0, y)
        push(w - 1, y)
      }

      while (queue.length) {
        const idx = queue.pop()
        data[idx * 4 + 3] = 0 // transparent
        const x = idx % w
        const y = (idx - x) / w
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Could not process image'))
    img.src = dataUrl
  })
}

/**
 * Read natural size from a data URL.
 * @param {string} dataUrl
 * @returns {Promise<{w:number,h:number}>}
 */
export function probeImageSize (dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({
      w: img.naturalWidth || 1024,
      h: img.naturalHeight || 1024
    })
    img.onerror = () => resolve({ w: 1024, h: 1024 })
    img.src = dataUrl
  })
}

/**
 * @param {object} svgEditor
 * @param {string} dataUrl
 * @param {{ mode?: string, maxSize?: number, icon?: boolean, x?: number, y?: number, width?: number, height?: number }} [opts]
 * @returns {Promise<{ok:boolean, message?:string, element?:Element}>}
 */
export async function placeImageOnCanvas (svgEditor, dataUrl, opts = {}) {
  const { mode = 'append', maxSize = opts.icon ? 160 : 420, icon = false } = opts
  const { svgCanvas } = svgEditor
  if (!dataUrl) return { ok: false, message: 'No image data' }

  let href = dataUrl
  if (icon) {
    try {
      href = await knockOutWhiteBackground(dataUrl)
    } catch (_) {
      href = dataUrl
    }
  }

  const size = await probeImageSize(href)
  let w
  let h
  if (opts.width && opts.height) {
    w = Math.max(24, Math.round(opts.width))
    h = Math.max(24, Math.round(opts.height))
  } else {
    const scale = Math.min(1, maxSize / Math.max(size.w, size.h))
    w = Math.max(24, Math.round(size.w * scale))
    h = Math.max(24, Math.round(size.h * scale))
  }

  if (mode === 'replace') {
    const empty = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(w + 40, 640)}" height="${Math.max(h + 40, 480)}"></svg>`
    if (svgCanvas.setSvgString(empty) === false) {
      return { ok: false, message: 'Failed to reset canvas' }
    }
  }

  const res = svgCanvas.getResolution?.() || { w: 640, h: 480 }
  const x = opts.x != null
    ? Math.round(opts.x)
    : Math.max(16, Math.round(((res.w || 640) - w) / 2))
  const y = opts.y != null
    ? Math.round(opts.y)
    : Math.max(16, Math.round(((res.h || 480) - h) / 2))

  const parent = svgCanvas.getCurrentGroup?.() ||
    svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()
  if (!parent) return { ok: false, message: 'No layer' }

  const { InsertElementCommand, BatchCommand } = svgCanvas.history
  const batch = new BatchCommand(icon ? 'AI Icon' : 'AI Image')

  const img = svgCanvas.addSVGElementsFromJson({
    element: 'image',
    attr: {
      x,
      y,
      width: w,
      height: h,
      id: svgCanvas.getNextId(),
      preserveAspectRatio: 'xMidYMid meet',
      style: 'pointer-events:inherit',
      'data-ai-image': icon ? 'icon' : 'image'
    }
  })
  svgCanvas.setHref(img, href)
  batch.addSubCommand(new InsertElementCommand(img))
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.selectOnly?.([img], true)
  svgCanvas.call?.('changed', [img])
  svgEditor.updateCanvas?.(mode === 'replace')
  return { ok: true, element: img }
}

/**
 * @param {string} userText
 * @param {'image'|'icon'} kind
 * @returns {string}
 */
export function buildRasterPrompt (userText, kind) {
  const subject = (userText || '').trim() || 'a scientific subject'
  if (kind === 'icon') {
    return `Create ONE scientific icon in BioRender illustration style.

Subject: ${subject}

Strict requirements:
- Single centered subject only (no collage, no scene, no people unless asked)
- BioRender look: clean soft-shaded 3D forms, smooth gradients, professional life-science figure quality
- Pure white background only — no floor, shadow plate, vignette, border, watermark, or text
- Generous padding around the subject so it works as a cutout icon
- High clarity at small size; simple readable silhouette
- Output an image (not SVG code)`
  }

  return `Generate a high-quality image for this request:

${subject}

Requirements:
- Match the user's intent closely
- Clean composition, no watermarks or UI chrome
- Output an image (not SVG code)`
}
