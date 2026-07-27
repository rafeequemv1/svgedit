/**
 * Full EPS import: UDOC FromPS, Ghostscript (WASM) -> PDF -> UDOC FromPDF -> SVG.
 * Falls back to high-resolution PNG raster if vector extraction fails.
 * @license MIT
 */

import { createToSvgWriter } from './to-svg-writer.js'
import { bytesToDataUrl, parseBoundingBoxFromBytes } from './eps-to-svg.js'

const GS_CDN = 'https://cdn.jsdelivr.net/npm/@jspawn/ghostscript-wasm@0.0.2'
const GS_LOCAL = '/ghostscript'

/** @type {Promise<any>|null} */
let gsPromise = null

/** @type {Promise<any>|null} */
let udocPromise = null

/**
 * @param {string} src
 * @returns {Promise<void>}
 */
const loadScript = (src) => new Promise((resolve, reject) => {
  const existing = document.querySelector(`script[src="${src}"]`)
  if (existing) {
    existing.addEventListener('load', () => resolve())
    existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)))
    return
  }
  const script = document.createElement('script')
  script.src = src
  script.async = true
  script.onload = () => resolve()
  script.onerror = () => reject(new Error(`Failed to load ${src}`))
  document.head.append(script)
})

/**
 * Prefer bundled Ghostscript WASM (same origin); fall back to CDN.
 * @returns {Promise<string>}
 */
const resolveGsBase = async () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const local = `${window.location.origin}${GS_LOCAL}`
    try {
      const res = await fetch(`${local}/gs.wasm`, { method: 'HEAD' })
      if (res.ok) return local
    } catch (_) { /* use CDN */ }
  }
  return GS_CDN
}

const loadGhostscript = async () => {
  if (gsPromise) return gsPromise

  gsPromise = (async () => {
    if (typeof window === 'undefined') {
      throw new Error('Ghostscript EPS conversion requires a browser environment')
    }

    const base = await resolveGsBase()
    const locateFile = (file) => `${base}/${file}`

    try {
      // Runtime URL (CDN or /ghostscript) — hide from rollup dynamic-import analysis
      const importGs = new Function('u', 'return import(u)')
      const mod = await importGs(`${base}/gs.mjs`)
      return mod.default({ locateFile })
    } catch (err) {
      console.warn('Ghostscript ESM load failed, trying script fallback:', err)
    }

    await loadScript(`${base}/browser.js`)
    await loadScript(`${base}/gs.js`)
    const createModule = globalThis.exports?.Module
    if (!createModule) {
      throw new Error('Ghostscript WASM failed to initialize')
    }
    return createModule({ locateFile })
  })()

  return gsPromise
}

const loadUdoc = async () => {
  if (!udocPromise) {
    udocPromise = Promise.all([
      import('pako'),
      import('./vendor/UDOC.js?raw'),
      import('./vendor/FromPS.js?raw'),
      import('./vendor/FromPDF.js?raw')
    ]).then(([pakoMod, udoc, fromPs, fromPdf]) => {
      globalThis.pako = pakoMod.default || pakoMod
      const factory = new Function(`${udoc.default}\n${fromPs.default}\n${fromPdf.default}\nreturn { FromPDF, FromPS, UDOC };`)
      return factory()
    })
  }
  return udocPromise
}

/**
 * @param {any} gs
 * @param {string[]} args
 * @returns {number}
 */
const runGs = (gs, args) => {
  const code = gs.callMain(args)
  if (code !== 0) {
    throw new Error(`Ghostscript failed (exit ${code})`)
  }
  return code
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export const epsBytesToPdf = async (bytes) => {
  const gs = await loadGhostscript()
  const inName = 'input.eps'
  const outName = 'output.pdf'
  gs.FS.writeFile(inName, bytes)
  try {
    runGs(gs, [
      '-q', '-dSAFER', '-dNOPAUSE', '-dBATCH', '-dQUIET',
      '-sDEVICE=pdfwrite',
      '-dEPSCrop',
      '-sOutputFile=' + outName,
      inName
    ])
    return gs.FS.readFile(outName)
  } finally {
    try { gs.FS.unlink(inName) } catch (_) { /* ignore */ }
    try { gs.FS.unlink(outName) } catch (_) { /* ignore */ }
  }
}

/**
 * @param {Uint8Array} bytes
 * @param {number} dpi
 * @returns {Promise<Uint8Array>}
 */
export const epsBytesToPng = async (bytes, dpi = 300) => {
  const gs = await loadGhostscript()
  const inName = 'input.eps'
  const outName = 'output.png'
  gs.FS.writeFile(inName, bytes)
  try {
    runGs(gs, [
      '-q', '-dSAFER', '-dNOPAUSE', '-dBATCH', '-dQUIET',
      '-sDEVICE=png16m',
      `-r${dpi}`,
      '-dEPSCrop',
      '-dBackgroundColor=16#ffffff',
      '-sOutputFile=' + outName,
      inName
    ])
    return gs.FS.readFile(outName)
  } finally {
    try { gs.FS.unlink(inName) } catch (_) { /* ignore */ }
    try { gs.FS.unlink(outName) } catch (_) { /* ignore */ }
  }
}

/**
 * @param {Uint8Array} pdfBytes
 * @returns {Promise<string|null>}
 */
export const pdfBytesToSvg = async (pdfBytes) => {
  const { FromPDF } = await loadUdoc()
  const writer = createToSvgWriter()
  const prevLog = console.log
  console.log = () => {}
  try {
    FromPDF.Parse(pdfBytes, writer)
  } finally {
    console.log = prevLog
  }
  if (writer.getPartCount() === 0) return null
  return writer.toSvg()
}

/**
 * Parse EPS PostScript directly via UDOC FromPS.
 * @param {Uint8Array} bytes
 * @returns {Promise<string|null>}
 */
export const epsBytesToPsSvg = async (bytes) => {
  const { FromPS } = await loadUdoc()
  const writer = createToSvgWriter()
  const prevLog = console.log
  console.log = () => {}
  try {
    FromPS.Parse(bytes, writer)
  } finally {
    console.log = prevLog
  }
  if (writer.getPartCount() === 0) return null
  return writer.toSvg()
}

/**
 * @param {Uint8Array} pngBytes
 * @param {{width:number,height:number}} bbox
 * @returns {string}
 */
export const pngBytesToSvg = (pngBytes, bbox) => {
  const { width, height } = bbox
  const href = bytesToDataUrl(pngBytes, 'image/png')
  const displayScale = Math.max(1, Math.ceil(800 / Math.max(width, height)))
  const outW = width * displayScale
  const outH = height * displayScale
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outW}" height="${outH}" viewBox="0 0 ${width} ${height}">`,
    '<g id="eps-raster">',
    `<image width="${width}" height="${height}" href="${href}" xlink:href="${href}"/>`,
    '</g>',
    '</svg>'
  ].join('')
}

/**
 * @param {string} svg
 * @returns {boolean}
 */
const hasVisibleSvgContent = (svg) => {
  return svg && (
    svg.includes('<path') ||
    svg.includes('<text') ||
    svg.includes('<image')
  )
}

/**
 * @param {Uint8Array} pngBytes
 * @returns {Promise<boolean>}
 */
const pngHasVisibleContent = async (pngBytes) => {
  if (!pngBytes?.length || typeof document === 'undefined') {
    return pngBytes?.length > 5000
  }
  try {
    const blob = new Blob([pngBytes], { type: 'image/png' })
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close?.()
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const step = Math.max(4, Math.floor(data.length / 4 / 5000) * 4)
    for (let i = 0; i < data.length; i += step) {
      const a = data[i + 3]
      if (a > 8 && (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248)) {
        return true
      }
    }
  } catch (_) { /* ignore */ }
  return false
}

/**
 * Full EPS import: PostScript parse, then GS vector, then GS raster.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export const epsBytesToFullSvg = async (bytes) => {
  const bbox = parseBoundingBoxFromBytes(bytes)
  let lastError = null

  try {
    const psSvg = await epsBytesToPsSvg(bytes)
    if (hasVisibleSvgContent(psSvg)) {
      return psSvg
    }
  } catch (err) {
    lastError = err
    console.warn('EPS PostScript parse failed:', err)
  }

  try {
    const pdf = await epsBytesToPdf(bytes)
    const vectorSvg = await pdfBytesToSvg(pdf)
    if (hasVisibleSvgContent(vectorSvg)) {
      return vectorSvg
    }
  } catch (err) {
    lastError = err
    console.warn('EPS vector conversion failed:', err)
  }

  try {
    const png = await epsBytesToPng(bytes)
    if (png?.length && await pngHasVisibleContent(png)) {
      return pngBytesToSvg(png, bbox)
    }
    if (png?.length) {
      lastError = new Error('Ghostscript rendered a blank image for this Illustrator EPS')
    }
  } catch (err) {
    lastError = err
    console.warn('EPS raster conversion failed:', err)
  }

  throw lastError || new Error(
    'Could not convert this Illustrator EPS. Re-export from Illustrator as SVG, or use ' +
    'File > Save As with "Create PDF Compatible File" and an embedded preview.'
  )
}
