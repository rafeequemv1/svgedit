import { epsBytesToSvg, findEmbeddedPreview, extractPostScriptText } from '../src/editor/extensions/ext-eps/eps-to-svg.js'
import fs from 'fs'

const file = process.argv[2]
const bytes = new Uint8Array(fs.readFileSync(file))
console.log('File:', file)
console.log('Size:', bytes.length)

const preview = findEmbeddedPreview(bytes)
console.log('Preview:', preview ? preview.mime + ' ' + preview.bytes.length : 'none')

const ps = extractPostScriptText(bytes)
console.log('PS length:', ps?.length)

const t = Date.now()
try {
  const svg = epsBytesToSvg(bytes)
  console.log('OK', Date.now() - t, 'ms')
  console.log('svg length:', svg.length)
  console.log('paths:', (svg.match(/<path/g) || []).length)
  console.log('images:', (svg.match(/<image/g) || []).length)
  console.log('has placeholder:', svg.includes('#cccccc'))
  const vb = svg.match(/viewBox="([^"]+)"/)
  console.log('viewBox:', vb?.[1])
  fs.writeFileSync('scripts/test-eps-output.svg', svg)
  console.log('Wrote scripts/test-eps-output.svg')
} catch (e) {
  console.error('FAIL:', e.message)
}
