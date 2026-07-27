/**
 * Image attach helpers for AI chat (upload / clipboard paste).
 */

const MAX_IMAGES = 8
const MAX_EDGE = 1600
const MAX_BYTES_SOFT = 1_800_000 // stay under typical serverless body limits after base64

/**
 * @param {Blob|File} blob
 * @returns {Promise<{ mimeType: string, data: string, previewUrl: string, name: string, width?: number, height?: number }>}
 */
export async function blobToGeminiImage (blob, name = 'image') {
  const type = (blob.type || 'image/png').toLowerCase()
  if (!type.startsWith('image/')) {
    throw new Error('Not an image')
  }

  const bitmap = await createImageBitmap(blob)
  let { width, height } = bitmap
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const tw = Math.max(1, Math.round(width * scale))
  const th = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, tw, th)
  bitmap.close?.()

  // Prefer JPEG for photos; keep PNG for transparency / simple graphics when small
  const preferJpeg = type.includes('jpeg') || type.includes('jpg') || type.includes('webp') ||
    (tw * th > 400_000)
  const outType = preferJpeg ? 'image/jpeg' : (type.includes('png') ? 'image/png' : 'image/jpeg')
  let quality = 0.88
  let dataUrl = canvas.toDataURL(outType, quality)
  while (dataUrl.length > MAX_BYTES_SOFT * 1.37 && quality > 0.45) {
    quality -= 0.1
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  const comma = dataUrl.indexOf(',')
  const data = dataUrl.slice(comma + 1)
  const mimeType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
  return {
    mimeType,
    data,
    previewUrl: dataUrl,
    name: name || (blob.name || 'image'),
    width: tw,
    height: th
  }
}

/**
 * @param {DataTransfer|null|undefined} dt
 * @returns {File[]}
 */
export function imageFilesFromDataTransfer (dt) {
  if (!dt) return []
  const files = []
  if (dt.files?.length) {
    for (const f of dt.files) {
      if (f.type?.startsWith('image/')) files.push(f)
    }
  }
  if (!files.length && dt.items?.length) {
    for (const item of dt.items) {
      if (item.kind === 'file' && item.type?.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
  }
  return files
}

/**
 * Build Gemini parts for a user turn.
 * @param {string} text
 * @param {Array<{mimeType:string,data:string}>} images
 */
export function buildUserParts (text, images = []) {
  const parts = []
  const trimmed = (text || '').trim()
  if (trimmed) parts.push({ text: trimmed })
  for (const img of images) {
    if (!img?.data || !img?.mimeType) continue
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data
      }
    })
  }
  if (!parts.length) {
    parts.push({ text: 'Please look at the attached image(s).' })
  } else if (!trimmed && images.length) {
    parts.unshift({ text: 'Please look at the attached image(s) and respond. If I asked to draw or recreate something, output SVG for the canvas.' })
  }
  return parts
}

export { MAX_IMAGES }
