import fs from 'fs'

const GS_CDN = 'https://cdn.jsdelivr.net/npm/@jspawn/ghostscript-wasm@0.0.2'
const epsPath = process.argv[2]

const bytes = new Uint8Array(fs.readFileSync(epsPath))
console.log('Loading Ghostscript WASM from CDN...')

const mod = await import(`${GS_CDN}/gs.mjs`)
const gs = await mod.default({ locateFile: (f) => `${GS_CDN}/${f}` })

gs.FS.writeFile('input.eps', bytes)
const code = gs.callMain([
  '-q', '-dSAFER', '-dNOPAUSE', '-dBATCH', '-dQUIET',
  '-sDEVICE=pdfwrite',
  '-dEPSCrop',
  '-sOutputFile=output.pdf',
  'input.eps'
])
console.log('GS exit code:', code)
if (code !== 0) process.exit(1)

const pdf = gs.FS.readFile('output.pdf')
fs.writeFileSync('scripts/test-eps-output.pdf', pdf)
console.log('PDF size:', pdf.length)

const { readFileSync } = fs
const { createToSvgWriter } = await import('../src/editor/extensions/ext-eps/to-svg-writer.js')
const [udoc, fromPs, fromPdf] = await Promise.all([
  import('../src/editor/extensions/ext-eps/vendor/UDOC.js?raw'),
  import('../src/editor/extensions/ext-eps/vendor/FromPS.js?raw'),
  import('../src/editor/extensions/ext-eps/vendor/FromPDF.js?raw')
])
const factory = new Function(`${udoc.default}\n${fromPs.default}\n${fromPdf.default}\nreturn { FromPDF };`)
const { FromPDF } = factory()
const writer = createToSvgWriter()
const prevLog = console.log
console.log = () => {}
try {
  FromPDF.Parse(new Uint8Array(pdf), writer)
} finally {
  console.log = prevLog
}
console.log('SVG parts:', writer.getPartCount())
const svg = writer.toSvg()
console.log('paths:', (svg.match(/<path/g) || []).length)
console.log('images:', (svg.match(/<image/g) || []).length)
fs.writeFileSync('scripts/test-eps-output-full.svg', svg)
console.log('Wrote scripts/test-eps-output-full.svg')
