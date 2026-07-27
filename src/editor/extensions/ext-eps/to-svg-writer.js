/**
 * UDOC Writer that emits editable SVG paths, text, and images.
 * @license MIT
 */

const pathToD = (path) => {
  if (!path?.cmds?.length) return ''
  let d = ''
  let c = 0
  const crds = path.crds
  for (let j = 0; j < path.cmds.length; j++) {
    const cmd = path.cmds[j]
    if (cmd === 'M') {
      d += `M ${crds[c]} ${crds[c + 1]} `
      c += 2
    } else if (cmd === 'L') {
      d += `L ${crds[c]} ${crds[c + 1]} `
      c += 2
    } else if (cmd === 'C') {
      d += `C ${crds[c]} ${crds[c + 1]} ${crds[c + 2]} ${crds[c + 3]} ${crds[c + 4]} ${crds[c + 5]} `
      c += 6
    } else if (cmd === 'Q') {
      d += `Q ${crds[c]} ${crds[c + 1]} ${crds[c + 2]} ${crds[c + 3]} `
      c += 4
    } else if (cmd === 'Z') {
      d += 'Z '
    }
  }
  return d.trim()
}

const rgbToHex = (colr, alpha = 1) => {
  if (!colr || colr.typ) return null
  const r = Math.round(Math.max(0, Math.min(1, colr[0])) * 255)
  const g = Math.round(Math.max(0, Math.min(1, colr[1])) * 255)
  const b = Math.round(Math.max(0, Math.min(1, colr[2])) * 255)
  if (alpha < 1) return `rgba(${r},${g},${b},${alpha})`
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

const matrixAttr = (m) => {
  if (!m || (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0)) {
    return ''
  }
  return ` transform="matrix(${m[0]} ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]})"`
}

const rgbaToDataUrl = (buff, w, h) => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const imgd = ctx.createImageData(w, h)
  for (let i = 0; i < buff.length; i++) imgd.data[i] = buff[i]
  ctx.putImageData(imgd, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * @returns {object} UDOC-compatible SVG writer
 */
export const createToSvgWriter = () => {
  /** @type {string[]} */
  const parts = []
  let pageBox = [0, 0, 100, 100]

  return {
    StartPage (x0, y0, x1, y1) {
      pageBox = [x0, y0, x1, y1]
    },
    Fill (gst, evenOdd) {
      const d = pathToD(gst.pth)
      if (!d) return
      const fill = rgbToHex(gst.colr, gst.ca)
      if (!fill) return
      const rule = evenOdd ? 'evenodd' : 'nonzero'
      parts.push(`<path d="${d}" fill="${fill}" fill-rule="${rule}" stroke="none"/>`)
    },
    Stroke (gst) {
      const d = pathToD(gst.pth)
      if (!d) return
      const stroke = rgbToHex(gst.COLR, gst.CA) || '#000000'
      const lw = Math.max(0.01, gst.lwidth || 1)
      parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${lw}"/>`)
    },
    PutText (gst, str) {
      if (!str) return
      const fill = rgbToHex(gst.colr, gst.ca) || '#000000'
      const size = gst.font?.Tfs || 12
      const font = (gst.font?.Tf || 'Arial').replace(/"/g, '')
      const m = gst.font?.Tm || [1, 0, 0, 1, 0, 0]
      const ctm = gst.ctm || [1, 0, 0, 1, 0, 0]
      const tm = [
        ctm[0] * m[0] + ctm[1] * m[2],
        ctm[0] * m[1] + ctm[1] * m[3],
        ctm[2] * m[0] + ctm[3] * m[2],
        ctm[2] * m[1] + ctm[3] * m[3],
        ctm[4] * m[0] + ctm[5] * m[2] + m[4],
        ctm[4] * m[1] + ctm[5] * m[3] + m[5]
      ]
      const escaped = String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      parts.push(`<text font-family="${font}" font-size="${size}" fill="${fill}"${matrixAttr(tm)}>${escaped}</text>`)
    },
    PutImage (gst, buff, w, h, msk) {
      if (!buff || buff.length !== w * h * 4) return
      const href = rgbaToDataUrl(buff, w, h)
      if (!href) return
      const m = gst.ctm || [1, 0, 0, 1, 0, 0]
      const imgM = [
        m[0] / w, m[1] / w,
        m[2] / h, m[3] / h,
        m[4], m[5]
      ]
      parts.push(`<image width="${w}" height="${h}" href="${href}" preserveAspectRatio="none"${matrixAttr(imgM)}/>`)
    },
    ShowPage () {},
    Done () {},
    toSvg () {
      const [x0, y0, x1, y1] = pageBox
      const width = Math.max(1, x1 - x0)
      const height = Math.max(1, y1 - y0)
      const displayScale = Math.max(1, Math.ceil(800 / Math.max(width, height)))
      const outW = width * displayScale
      const outH = height * displayScale
      return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="${x0} ${y0} ${width} ${height}">`,
        `<g id="eps-import" transform="scale(1,-1) translate(0,${-(y0 + height)})">`,
        ...parts,
        '</g>',
        '</svg>'
      ].join('')
    },
    getPartCount () {
      return parts.length
    }
  }
}
