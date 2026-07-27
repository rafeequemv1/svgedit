import fs from 'fs'
import path from 'path'
import { chromium } from '@playwright/test'

const epsPath = process.argv[2] || 'c:/Users/User/Downloads/24085108_2ct8_l124_220211 (1).eps'
const url = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000/src/editor/index.html'

const bytes = fs.readFileSync(epsPath)
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

page.on('console', (msg) => {
  const type = msg.type()
  if (type === 'error' || type === 'warning') {
    console.log(`[browser ${type}]`, msg.text())
  }
})
page.on('pageerror', (err) => console.error('[pageerror]', err.message))

await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
await page.waitForFunction(() => window.svgEditor?.importEpsFile, null, { timeout: 60000 })

// Dismiss storage dialog if shown
await page.evaluate(() => {
  const dialog = document.querySelector('se-storage-dialog')
  if (dialog?.getAttribute('dialog') === 'open') {
    dialog.setAttribute('dialog', 'close')
  }
})

const result = await page.evaluate(async (fileBytes, fileName) => {
  const arr = new Uint8Array(fileBytes)
  const file = new File([arr], fileName, { type: 'application/postscript' })
  const errors = []
  const logs = []
  const origWarn = console.warn
  const origError = console.error
  console.warn = (...args) => logs.push(['warn', ...args].join(' '))
  console.error = (...args) => errors.push(['error', ...args].join(' '))
  try {
    window.svgCanvas.clear()
    await window.svgEditor.importEpsFile(file)
    window.svgEditor.updateCanvas()
    window.svgEditor.zoomImage()
  } catch (err) {
    errors.push(String(err?.message || err))
  } finally {
    console.warn = origWarn
    console.error = origError
  }

  const svgroot = document.getElementById('svgroot')
  const layer = svgroot?.querySelector('#svgcontent') || svgroot?.querySelector('g')
  const counts = {
    path: svgroot?.querySelectorAll('path').length || 0,
    text: svgroot?.querySelectorAll('text').length || 0,
    image: svgroot?.querySelectorAll('image').length || 0,
    rect: svgroot?.querySelectorAll('rect').length || 0,
    g: svgroot?.querySelectorAll('g').length || 0
  }
  const resolution = window.svgCanvas.getResolution()
  const contentW = window.svgCanvas.contentW
  const contentH = window.svgCanvas.contentH
  const innerHtmlLen = layer?.innerHTML?.length || 0
  return { counts, errors, logs, resolution, contentW, contentH, innerHtmlLen }
}, [...bytes], path.basename(epsPath))

console.log('Import result:', JSON.stringify(result, null, 2))
const visible = result.counts.path + result.counts.text + result.counts.image > 0
console.log(visible ? 'PASS: visible shapes on canvas' : 'FAIL: no visible shapes on canvas')
await browser.close()
process.exit(visible ? 0 : 1)
