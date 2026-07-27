import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => console.error('PAGEERROR', e.message))
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('CONSOLE', msg.text())
})

await page.goto('http://localhost:8000/src/editor/index.html', { waitUntil: 'networkidle', timeout: 90000 })
await page.waitForTimeout(2500)
await page.evaluate(() => {
  const d = document.querySelector('se-storage-dialog')
  if (d?.getAttribute('dialog') === 'open') {
    d.shadowRoot?.querySelector('#storage_ok')?.click()
  }
})
await page.waitForTimeout(800)

const result = await page.evaluate(async () => {
  const ed = window.svgEditor
  if (!ed) return { ok: false, reason: 'no editor' }
  const btn = document.getElementById('tool_dna')
  if (!btn) return { ok: false, reason: 'no tool_dna button — extension missing?' }

  // Programmatically create DNA along a curve
  const pts = []
  for (let i = 0; i <= 24; i++) {
    pts.push({ x: 80 + i * 16, y: 200 + Math.sin(i * 0.4) * 50 })
  }
  const canvas = ed.svgCanvas
  const g = canvas.addSVGElementsFromJson({
    element: 'g',
    attr: {
      id: canvas.getNextId(),
      shape: 'dna',
      'data-points': JSON.stringify(pts),
      'data-thickness': '1',
      'data-style-mode': 'cartoon',
      'data-strand-color': '#2563eb',
      'data-rung-color': '#f59e0b',
      'data-base-pair-mode': 'mono',
      'data-base-pair-color-at': '#3b82f6',
      'data-base-pair-color-gc': '#ef4444',
      'data-single-strand': 'false',
      'data-show-base-pairs': 'true',
      'data-show-directionality': 'true',
      'data-show-histones': 'false',
      'data-histone-every': '60',
      'data-annotation-every': '0',
      'data-annotation-start': '1',
      style: 'pointer-events:visiblePainted'
    }
  })

  // Import regenerate from extension path via dynamic import of already-loaded module
  // Call through selecting tool + using canvas — instead invoke math inline by dispatching
  const mod = await import('/src/editor/extensions/ext-dna/ext-dna.js')
  // regenerate is not exported as named from default — check
  const { regenerateDna } = await import('/src/editor/extensions/ext-dna/ext-dna.js')
  if (typeof regenerateDna === 'function') {
    regenerateDna(g)
  }

  const kids = g.querySelectorAll('*').length
  const strands = g.querySelectorAll('[data-role^="strand"]').length
  const rungs = g.querySelectorAll('[data-role="rungs"]').length
  const polarity = g.querySelectorAll('[data-role="polarity"]').length
  canvas.selectOnly([g], true)
  return {
    ok: kids > 0 && strands > 0 && rungs > 0,
    kids,
    strands,
    rungs,
    polarity,
    modeOk: !!btn,
    hasRegenerate: typeof regenerateDna === 'function'
  }
})

console.log(JSON.stringify(result, null, 2))
await page.screenshot({ path: 'examples/dna-brush-verify.png', fullPage: true })
await browser.close()
