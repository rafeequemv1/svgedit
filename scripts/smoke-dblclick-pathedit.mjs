import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1200, height: 700 })
await page.goto('http://localhost:8000/src/editor/index.html', {
  waitUntil: 'networkidle',
  timeout: 90000
})
await page.waitForTimeout(1200)
await page.evaluate(() => {
  const d = document.querySelector('se-storage-dialog')
  if (d?.getAttribute('dialog') === 'open') {
    d.shadowRoot?.querySelector('#storage_ok')?.click()
  }
})
await page.waitForTimeout(400)

const result = await page.evaluate(async () => {
  const canvas = window.svgEditor.svgCanvas

  // Style preservation
  const rect = canvas.addSVGElementsFromJson({
    element: 'rect',
    attr: {
      id: canvas.getNextId(),
      x: 80, y: 80, width: 160, height: 100,
      fill: '#ef4444', stroke: '#111111', 'stroke-width': 2
    }
  })
  const converted = canvas.convertToPath(rect)
  const styleOk = {
    fill: converted?.getAttribute('fill'),
    stroke: converted?.getAttribute('stroke'),
    sw: converted?.getAttribute('stroke-width')
  }

  // Direct toEditMode (core path edit)
  canvas.pathActions.toEditMode(converted)
  const directEdit = {
    mode: canvas.getCurrentMode(),
    grips: document.querySelectorAll('[id^=pathpointgrip_]').length
  }

  // Call dblClickEvent with a synthetic event on a line
  canvas.pathActions.clear()
  canvas.setMode('select')
  const line = canvas.addSVGElementsFromJson({
    element: 'line',
    attr: {
      id: canvas.getNextId(),
      x1: 300, y1: 120, x2: 500, y2: 260,
      stroke: '#2563eb', 'stroke-width': 4, fill: 'none'
    }
  })
  canvas.selectOnly([line], true)
  const lb = line.getBoundingClientRect()
  const evt = new MouseEvent('dblclick', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: lb.x + lb.width / 2,
    clientY: lb.y + lb.height / 2
  })
  Object.defineProperty(evt, 'target', { get: () => line })
  canvas.dblClickEvent(evt)
  await new Promise((r) => setTimeout(r, 80))

  const afterLine = {
    mode: canvas.getCurrentMode(),
    grips: document.querySelectorAll('[id^=pathpointgrip_]').length,
    bluePath: [...document.querySelectorAll('#svgcontent path')].some(
      (p) => p.getAttribute('stroke') === '#2563eb'
    )
  }

  // Corner stability
  canvas.pathActions.clear()
  canvas.setMode('select')
  const poly = canvas.addSVGElementsFromJson({
    element: 'polygon',
    attr: {
      id: canvas.getNextId(),
      points: '560,100 700,100 700,220 560,220',
      fill: '#f59e0b', stroke: '#000', 'stroke-width': 1
    }
  })
  const cr = await import(new URL('../../packages/svgcanvas/core/corner-radius.js', window.location.href).href)
  const r1 = cr.applyCornerRadius(poly, 20)
  const el = r1.elem
  const before = el.getAttribute('data-corner-points')
  for (let i = 0; i < 10; i++) {
    cr.getShapeCornerPoints(el)
    cr.applyCornerRadius(el, 20 + i)
  }
  const after = el.getAttribute('data-corner-points')

  return { styleOk, directEdit, afterLine, cornerStable: before === after }
})

console.log(JSON.stringify(result, null, 2))
await page.screenshot({ path: 'examples/dblclick-pathedit-smoke.png' })
await browser.close()
