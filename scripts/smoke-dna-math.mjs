import { computeDnaGeometry } from '../src/editor/extensions/ext-dna/dna-math.js'

const pts = []
for (let i = 0; i <= 20; i++) {
  pts.push({ x: 40 + i * 18, y: 120 + Math.sin(i * 0.45) * 40 })
}
const g = computeDnaGeometry(pts, { thickness: 1, showBasePairs: true, showHistones: true })
console.log({
  empty: g.empty,
  len: Math.round(g.pathLength),
  samples: g.samples.length,
  rungs: g.cartoon.rungs.length,
  histones: g.histones.length,
  hasBack: g.cartoon.backA.length > 10,
  hasFront: g.cartoon.frontA.length > 10
})
