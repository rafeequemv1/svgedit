/**
 * Vega-Lite → SVG rendering (lazy-loaded).
 */

/** @type {Promise<any>|null} */
let vegaEmbedReady = null

async function loadVegaEmbed () {
  if (!vegaEmbedReady) {
    vegaEmbedReady = import('vega-embed').then((m) => m.default || m)
  }
  return vegaEmbedReady
}

/**
 * @param {string} inner
 * @param {number} w
 * @param {number} h
 */
function wrapSvg (inner, w, h) {
  const body = String(inner || '').trim()
  if (/^<svg[\s>]/i.test(body)) return body
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
}

/**
 * @param {object} spec
 * @param {{w:number,h:number}} size
 */
export async function vegaSpecToSvg (spec, size = { w: 640, h: 400 }) {
  const embed = await loadVegaEmbed()
  const w = Math.max(120, Math.round(spec.width || size.w - 48))
  const h = Math.max(96, Math.round(spec.height || size.h - 80))
  const vs = JSON.parse(JSON.stringify(spec))
  vs.width = w
  vs.height = h
  delete vs.autosize
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;overflow:hidden;visibility:hidden`
  document.body.appendChild(host)
  try {
    const result = await embed(host, vs, { actions: false, renderer: 'svg', tooltip: false })
    const svg = await result.view.toSVG()
    result.view.finalize()
    return wrapSvg(svg, w, h)
  } finally {
    host.remove()
  }
}
