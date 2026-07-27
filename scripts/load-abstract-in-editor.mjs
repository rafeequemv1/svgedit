/**
 * Load the hydrogel graphical abstract into the live SVGEdit canvas.
 * Opens a headed browser so you can see/edit it in the editor.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const abstractPath = path.join(root, 'examples/hydrogel-graphical-abstract.svg')
const url = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000/src/editor/index.html'
const headed = process.env.HEADED !== '0'

if (!fs.existsSync(abstractPath)) {
  console.error('Missing abstract SVG. Run: node scripts/make-hydrogel-abstract.mjs')
  process.exit(1)
}

// Ensure abstract exists / regenerate for freshness
await import('./make-hydrogel-abstract.mjs')

let svg = fs.readFileSync(abstractPath, 'utf8')
// Strip XML declaration — setSvgString expects SVG markup
svg = svg.replace(/<\?xml[^?]+\?>\s*/i, '')

const browser = await chromium.launch({
  headless: !headed,
  channel: process.env.PW_CHANNEL || undefined
})
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })

page.on('pageerror', (err) => console.error('[pageerror]', err.message))

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForFunction(() => window.svgEditor?.svgCanvas?.setSvgString, null, { timeout: 60000 })

// Dismiss storage dialog if present
await page.evaluate(() => {
  const dialog = document.querySelector('se-storage-dialog')
  if (dialog?.getAttribute('dialog') === 'open') {
    const ok = dialog.shadowRoot?.querySelector('#storage_ok') || dialog.querySelector('#storage_ok')
    if (ok) ok.click()
    else dialog.setAttribute('dialog', 'close')
  }
})
await page.waitForTimeout(400)

const result = await page.evaluate(async (xml) => {
  const editor = window.svgEditor
  const canvas = editor.svgCanvas
  canvas.clear()
  const ok = canvas.setSvgString(xml) !== false
  // Fit canvas to figure size
  try {
    canvas.setResolution(900, 520)
  } catch (_e) { /* older API */ }
  editor.updateCanvas?.(true)
  editor.zoomChanged?.(window, 'canvas')
  // Prefer fit-to-content style zoom if available
  try {
    editor.zoomImage?.()
  } catch (_e) { /* ignore */ }

  const root = document.getElementById('svgcontent')
  return {
    ok,
    mode: canvas.getMode?.(),
    resolution: canvas.getResolution?.(),
    paths: root?.querySelectorAll('path').length || 0,
    texts: root?.querySelectorAll('text').length || 0,
    gels: root?.querySelectorAll('[shape="hydrogel"], [id^="gel-"]').length || 0,
    title: root?.querySelector('title')?.textContent || null,
    childCount: root?.querySelector('g.layer')?.children?.length || 0
  }
}, svg)

console.log('Canvas load result:', JSON.stringify(result, null, 2))

const shot = path.join(root, 'examples/hydrogel-abstract-in-editor.png')
await page.screenshot({ path: shot, fullPage: true })
console.log('Screenshot:', shot)

if (!result.ok || result.paths < 5) {
  console.error('FAIL: abstract did not land on canvas')
  await browser.close()
  process.exit(1)
}

console.log('PASS: graphical abstract is on the editor canvas')
console.log(headed
  ? 'Browser left open for inspection — close the window when done.'
  : 'Headless run complete.')

if (headed) {
  // Keep editor open until user closes the browser window
  await new Promise((resolve) => {
    browser.on('disconnected', resolve)
    setTimeout(resolve, 10 * 60 * 1000)
  })
}

await browser.close().catch(() => {})
process.exit(0)
