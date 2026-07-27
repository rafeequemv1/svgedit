/**
 * Convert EPS/PostScript bytes to SVG markup.
 * Handles text PS, binary EPS, embedded SVG, DOS TIFF previews, and JPEG/PNG previews.
 * @license MIT
 */

import UTIF from 'utif'
import UPNG from 'upng-js'

const MAX_PARSE_TOKENS = 250000
const DOS_EPS_MAGIC = [0xC5, 0xD0, 0xD3, 0xC6]

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const bytesToLatin1 = (bytes) => {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i])
  }
  return out
}

/**
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export const findPostScriptOffset = (bytes) => {
  if (!bytes?.length) return -1
  const sig = [0x25, 0x21, 0x50, 0x53] // %!PS
  outer:
  for (let i = 0; i <= bytes.length - 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (bytes[i + j] !== sig[j]) continue outer
    }
    return i
  }
  return -1
}

/**
 * @param {Uint8Array} bytes
 * @returns {string|null}
 */
export const extractPostScriptText = (bytes) => {
  const start = findPostScriptOffset(bytes)
  if (start < 0) return null
  let end = bytes.length
  const eof = [0x25, 0x25, 0x45, 0x4F, 0x46] // %%EOF
  outer:
  for (let i = start; i <= bytes.length - 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (bytes[i + j] !== eof[j]) continue outer
    }
    end = i + 5
    break
  }
  return bytesToLatin1(bytes.subarray(start, end))
}

/**
 * @param {string} text
 * @returns {string}
 */
export const stripBinarySections = (text) => {
  return text
    .replace(/%%BeginBinary:[\s\S]*?%%EndBinary/gi, '\n')
    .replace(/%%BeginData:[\s\S]*?%%EndData/gi, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number[]} sig
 * @returns {boolean}
 */
const matchAt = (bytes, offset, sig) => {
  if (offset + sig.length > bytes.length) return false
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false
  }
  return true
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {number}
 */
const readU32LE = (bytes, offset) => {
  return bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
}

/**
 * @param {Uint8Array} bytes
 * @returns {{psOffset:number,psLength:number,wmfOffset:number,wmfLength:number,tiffOffset:number,tiffLength:number}|null}
 */
export const parseDosEpsHeader = (bytes) => {
  if (!bytes || bytes.length < 32 || !matchAt(bytes, 0, DOS_EPS_MAGIC)) return null
  return {
    psOffset: readU32LE(bytes, 4),
    psLength: readU32LE(bytes, 8),
    wmfOffset: readU32LE(bytes, 12),
    wmfLength: readU32LE(bytes, 16),
    tiffOffset: readU32LE(bytes, 20),
    tiffLength: readU32LE(bytes, 24)
  }
}

/**
 * @param {Uint8Array} bytes
 * @returns {Uint8Array|null}
 */
export const extractDosEpsTiffPreview = (bytes) => {
  const header = parseDosEpsHeader(bytes)
  if (!header?.tiffLength || header.tiffOffset <= 0) return null
  const end = header.tiffOffset + header.tiffLength
  if (end > bytes.length) return null
  const tiff = bytes.subarray(header.tiffOffset, end)
  if (tiff[0] !== 0x49 && tiff[0] !== 0x4D) return null
  return tiff
}

/**
 * @param {Uint8Array} tiffBytes
 * @returns {string}
 */
export const decodeTiffToDataUrl = (tiffBytes) => {
  const ifds = UTIF.decode(tiffBytes)
  if (!ifds?.length) {
    throw new Error('Invalid TIFF preview in EPS file')
  }
  UTIF.decodeImage(tiffBytes, ifds[0])
  const rgba = UTIF.toRGBA8(ifds[0])
  const width = ifds[0].width
  const height = ifds[0].height
  const png = UPNG.encode([rgba.buffer], width, height, 0)
  return bytesToDataUrl(new Uint8Array(png), 'image/png')
}

/**
 * @param {Uint8Array} bytes
 * @returns {{bytes: Uint8Array, mime: string}|null}
 */
export const findEmbeddedPreview = (bytes) => {
  if (!bytes?.length) return null

  /** @type {{bytes: Uint8Array, mime: string}[]} */
  const found = []

  const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
  for (let i = 0; i <= bytes.length - 8; i++) {
    if (!matchAt(bytes, i, pngSig)) continue
    for (let j = i + 8; j <= bytes.length - 8; j++) {
      if (bytes[j] === 0x49 && bytes[j + 1] === 0x45 &&
          bytes[j + 2] === 0x4E && bytes[j + 3] === 0x44 &&
          bytes[j + 4] === 0xAE && bytes[j + 5] === 0x42 &&
          bytes[j + 6] === 0x60 && bytes[j + 7] === 0x82) {
        found.push({ bytes: bytes.subarray(i, j + 8), mime: 'image/png' })
        break
      }
    }
  }

  for (let i = 0; i <= bytes.length - 3; i++) {
    if (bytes[i] !== 0xFF || bytes[i + 1] !== 0xD8 || bytes[i + 2] !== 0xFF) continue
    for (let j = i + 3; j < bytes.length - 1; j++) {
      if (bytes[j] === 0xFF && bytes[j + 1] === 0xD9) {
        found.push({ bytes: bytes.subarray(i, j + 2), mime: 'image/jpeg' })
        break
      }
    }
  }

  if (!found.length) return null
  found.sort((a, b) => b.bytes.length - a.bytes.length)
  return found[0]
}

/**
 * @param {Uint8Array} bytes
 * @param {string} mime
 * @returns {string}
 */
export const bytesToDataUrl = (bytes, mime) => {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

/**
 * @param {string} epsText
 * @returns {boolean}
 */
export const isLikelyTextEps = (epsText) => {
  if (!epsText) return false
  return findPostScriptOffset(new Uint8Array([...epsText].map(c => c.charCodeAt(0)))) >= 0 ||
    /^[\s\r\n]*%!PS/i.test(epsText)
}

/**
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export const hasTiffPreviewHeader = (bytes) => {
  if (!bytes || bytes.length < 4) return false
  return (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
    (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A) ||
    (bytes[0] === 0xC5 && bytes[1] === 0xD0 && bytes[2] === 0xD3 && bytes[3] === 0xC6)
  )
}

/**
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export const isSupportedEpsBytes = (bytes) => {
  if (!bytes?.length) return false
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true
  if (findPostScriptOffset(bytes) >= 0) return true
  if (hasTiffPreviewHeader(bytes)) return true
  return Boolean(findEmbeddedPreview(bytes))
}

/**
 * @param {string} epsText
 * @returns {{x:number,y:number,width:number,height:number}|null}
 */
export const parseBoundingBox = (epsText) => {
  const m = /%%BoundingBox:\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i.exec(epsText)
  if (!m) return null
  const llx = Number(m[1])
  const lly = Number(m[2])
  const urx = Number(m[3])
  const ury = Number(m[4])
  return {
    x: llx,
    y: lly,
    width: Math.max(1, urx - llx),
    height: Math.max(1, ury - lly)
  }
}

/**
 * @param {string} epsText
 * @returns {string|null}
 */
const extractEmbeddedSvg = (epsText) => {
  const xmlIdx = epsText.indexOf('<?xml')
  if (xmlIdx >= 0) {
    const end = epsText.indexOf('</svg>', xmlIdx)
    if (end >= 0) return epsText.slice(xmlIdx, end + 6)
  }
  const svgIdx = epsText.indexOf('<svg')
  if (svgIdx >= 0) {
    const end = epsText.indexOf('</svg>', svgIdx)
    if (end >= 0) return epsText.slice(svgIdx, end + 6)
  }
  return null
}

/**
 * @param {string} svg
 * @returns {boolean}
 */
export const isPlaceholderSvg = (svg) => {
  return svg.includes('stroke="#cccccc"') && !svg.includes('<path d=')
}

/**
 * @param {Uint8Array} bytes
 * @returns {{x:number,y:number,width:number,height:number}}
 */
export const parseBoundingBoxFromBytes = (bytes) => {
  const fullText = bytesToLatin1(bytes)
  const psText = extractPostScriptText(bytes)
  return (psText && parseBoundingBox(psText)) ||
    parseBoundingBox(fullText) ||
    { x: 0, y: 0, width: 800, height: 600 }
}

/**
 * @param {string} svg
 * @returns {boolean}
 */
const isPlaceholderSvgInternal = isPlaceholderSvg

/**
 * @param {string} psText
 * @param {{width:number,height:number}} bbox
 * @returns {string}
 */
const epsToSvgFromPs = (psText, bbox) => {
  const { width, height } = bbox
  const flipY = (y) => height - y

  /** @type {string[]} */
  const paths = []
  /** @type {number[]} */
  const current = []
  let penDown = false

  const flush = (close = false) => {
    if (current.length < 4) {
      current.length = 0
      penDown = false
      return
    }
    let d = `M ${current[0]} ${flipY(current[1])}`
    for (let i = 2; i < current.length; i += 2) {
      d += ` L ${current[i]} ${flipY(current[i + 1])}`
    }
    if (close) d += ' Z'
    paths.push(`<path d="${d}" fill="none" stroke="#000000" stroke-width="1"/>`)
    current.length = 0
    penDown = false
  }

  const body = psText
    .replace(/%%[^\n]*\n/g, '\n')
    .replace(/%[^\n]*\n/g, '\n')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')

  const tokens = body.split(/\s+/).filter(Boolean)
  if (tokens.length > MAX_PARSE_TOKENS) {
    throw new Error('EPS file is too complex to parse in the browser')
  }
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase()
    if (t === 'moveto' && i >= 2) {
      if (penDown) flush(false)
      const x = Number(tokens[i - 2])
      const y = Number(tokens[i - 1])
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        current.push(x, y)
        penDown = true
      }
    } else if (t === 'lineto' && i >= 2) {
      const x = Number(tokens[i - 2])
      const y = Number(tokens[i - 1])
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        current.push(x, y)
      }
    } else if (t === 'closepath') {
      flush(true)
    } else if (t === 'stroke' || t === 'fill') {
      flush(t === 'fill')
    } else if (t === 'curveto' && i >= 6) {
      const x = Number(tokens[i - 2])
      const y = Number(tokens[i - 1])
      if (!Number.isNaN(x) && !Number.isNaN(y)) {
        current.push(x, y)
      }
    } else if (t === 'newpath') {
      flush(false)
    }
  }
  flush(false)

  if (!paths.length) {
    paths.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#cccccc"/>`)
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<g id="eps-import">',
    ...paths,
    '</g>',
    '</svg>'
  ].join('')
}

/**
 * @param {string} href
 * @param {{width:number,height:number}} bbox
 * @returns {string}
 */
const svgFromPreviewHref = (href, bbox) => {
  const { width, height } = bbox
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<g id="eps-preview">',
    `<image width="${width}" height="${height}" href="${href}" xlink:href="${href}"/>`,
    '</g>',
    '</svg>'
  ].join('')
}

/**
 * @param {{bytes: Uint8Array, mime: string}} preview
 * @param {{width:number,height:number}} bbox
 * @returns {string}
 */
const svgFromPreview = (preview, bbox) => {
  return svgFromPreviewHref(bytesToDataUrl(preview.bytes, preview.mime), bbox)
}

/**
 * @param {string} epsText
 * @returns {string}
 */
export const epsToSvg = (epsText) => {
  const bytes = new Uint8Array(epsText.length)
  for (let i = 0; i < epsText.length; i++) {
    bytes[i] = epsText.charCodeAt(i) & 0xFF
  }
  return epsBytesToSvg(bytes)
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const epsBytesToSvg = (bytes) => {
  if (!bytes?.length) {
    throw new Error('Empty EPS file')
  }

  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    throw new Error('PDF-based EPS is not supported. Re-export as “EPS (no PDF compatibility)” or use SVG.')
  }

  const fullText = bytesToLatin1(bytes)
  const embedded = extractEmbeddedSvg(fullText)
  if (embedded) return embedded

  const psText = extractPostScriptText(bytes)
  const bbox = (psText && parseBoundingBox(psText)) ||
    parseBoundingBox(fullText) ||
    { x: 0, y: 0, width: 800, height: 600 }

  const dosTiff = extractDosEpsTiffPreview(bytes)
  if (dosTiff) {
    try {
      const href = decodeTiffToDataUrl(dosTiff)
      return svgFromPreviewHref(href, bbox)
    } catch (err) {
      console.warn('DOS EPS TIFF preview decode failed:', err)
    }
  }

  let vectorSvg = null
  if (psText) {
    vectorSvg = epsToSvgFromPs(stripBinarySections(psText), bbox)
  }

  if (vectorSvg && !isPlaceholderSvgInternal(vectorSvg)) {
    return vectorSvg
  }

  const preview = findEmbeddedPreview(bytes)
  if (preview) {
    return svgFromPreview(preview, bbox)
  }

  if (vectorSvg) return vectorSvg

  if (hasTiffPreviewHeader(bytes)) {
    throw new Error('EPS has a TIFF preview that could not be decoded. Try saving as SVG from Illustrator.')
  }

  if (!isSupportedEpsBytes(bytes)) {
    throw new Error('Unrecognized EPS format — try exporting as SVG from the source app')
  }

  throw new Error('Could not extract vector data or preview from this EPS file')
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export const isEpsFileName = (name) => /\.eps$/i.test(name || '')

/**
 * @param {File|Blob} file
 * @returns {boolean}
 */
export const isEpsFile = (file) => {
  const type = file?.type || ''
  return isEpsFileName(file?.name) ||
    type === 'application/postscript' ||
    type === 'application/eps' ||
    type === 'application/x-eps'
}
