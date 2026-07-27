/**
 * Graphical abstract: chemical synthesis of graphene
 * Graphite → Graphene Oxide (oxidation/exfoliation) → Graphene (reduction)
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../examples')
mkdirSync(outDir, { recursive: true })

const W = 960
const H = 560

/** Hex honeycomb lattice path segments (bonds) + atom sites */
function honeycombLattice ({ cx, cy, cols, rows, size, wobble = 0 }) {
  const dx = size * 1.5
  const dy = size * Math.sqrt(3)
  const atoms = []
  const bonds = []
  const key = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`
  const seen = new Set()

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = cx + c * dx - ((cols - 1) * dx) / 2
      const oy = cy + r * dy - ((rows - 1) * dy) / 2 + (c % 2 ? dy / 2 : 0)
      const pts = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6
        const jx = wobble ? (Math.sin(c * 1.7 + r * 2.1 + i) * wobble) : 0
        const jy = wobble ? (Math.cos(c * 1.3 + r * 1.9 + i) * wobble) : 0
        pts.push([ox + Math.cos(a) * size + jx, oy + Math.sin(a) * size + jy])
      }
      for (let i = 0; i < 6; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % 6]
        const bk = [key(x1, y1), key(x2, y2)].sort().join('|')
        if (!seen.has(bk)) {
          seen.add(bk)
          bonds.push([x1, y1, x2, y2])
        }
        const ak = key(x1, y1)
        if (!seen.has('a' + ak)) {
          seen.add('a' + ak)
          atoms.push({ x: x1, y: y1 })
        }
      }
    }
  }
  return { atoms, bonds }
}

function bondsPath (bonds) {
  return bonds.map(([x1, y1, x2, y2]) =>
    `M${x1.toFixed(2)},${y1.toFixed(2)}L${x2.toFixed(2)},${y2.toFixed(2)}`
  ).join('')
}

function atomsPath (atoms, r) {
  return atoms.map(a =>
    `M${(a.x - r).toFixed(2)},${a.y.toFixed(2)}a${r},${r} 0 1,0 ${(r * 2).toFixed(2)},0a${r},${r} 0 1,0 ${(-r * 2).toFixed(2)},0`
  ).join('')
}

/** Stacked graphite sheets (3 layers offset) */
function graphiteStack (baseX, baseY) {
  const layers = []
  for (let L = 0; L < 4; L++) {
    const lat = honeycombLattice({
      cx: baseX + L * 6,
      cy: baseY + L * 14,
      cols: 4,
      rows: 2,
      size: 11
    })
    const shade = 30 + L * 18
    layers.push({
      bonds: lat.bonds,
      atoms: lat.atoms,
      fill: `rgb(${shade},${shade},${shade + 8})`,
      stroke: `rgb(${shade + 40},${shade + 40},${shade + 50})`
    })
  }
  return layers
}

const graphite = graphiteStack(155, 250)
const goLat = honeycombLattice({ cx: 480, cy: 255, cols: 5, rows: 3, size: 12, wobble: 1.8 })
const gLat = honeycombLattice({ cx: 780, cy: 250, cols: 5, rows: 3, size: 13, wobble: 0 })

/** Oxygen functional groups on GO */
const oxyGroups = [
  { x: 430, y: 210, kind: 'epoxy' },
  { x: 505, y: 225, kind: 'oh' },
  { x: 460, y: 275, kind: 'cooh' },
  { x: 530, y: 290, kind: 'epoxy' },
  { x: 495, y: 310, kind: 'oh' },
  { x: 545, y: 240, kind: 'oh' }
]

function renderOxy (g) {
  if (g.kind === 'epoxy') {
    return `<g>
      <circle cx="${g.x}" cy="${g.y}" r="5.5" fill="#ef4444" stroke="#991b1b" stroke-width="1"/>
      <text x="${g.x}" y="${g.y + 3.5}" text-anchor="middle" font-size="7" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#fff">O</text>
    </g>`
  }
  if (g.kind === 'oh') {
    return `<g>
      <circle cx="${g.x}" cy="${g.y}" r="5" fill="#f97316" stroke="#9a3412" stroke-width="1"/>
      <text x="${g.x}" y="${g.y + 3}" text-anchor="middle" font-size="6" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#fff">OH</text>
    </g>`
  }
  return `<g>
    <rect x="${g.x - 10}" y="${g.y - 6}" width="20" height="12" rx="3" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>
    <text x="${g.x}" y="${g.y + 3}" text-anchor="middle" font-size="6" font-family="Segoe UI, Arial, sans-serif" font-weight="700" fill="#fff">COOH</text>
  </g>`
}

const graphiteLayersSvg = graphite.map((layer, i) => `
  <g id="graphite-layer-${i}" opacity="${0.55 + i * 0.12}">
    <path d="${bondsPath(layer.bonds)}" fill="none" stroke="${layer.stroke}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="${atomsPath(layer.atoms, 2.4)}" fill="${layer.fill}" stroke="#0f172a" stroke-width="0.4" fill-rule="evenodd"/>
  </g>`).join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Graphical Abstract — Synthesis of Graphene</title>
  <desc>Graphite oxidation to GO, then reduction to graphene (chemical route)</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f1f5f9"/>
    </linearGradient>
    <linearGradient id="sheetG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="sheetGO" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
    <marker id="arr" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#0f172a"/>
    </marker>
    <filter id="soft" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="480" y="38" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="700" fill="#0f172a">Chemical Synthesis of Graphene</text>
  <text x="480" y="58" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#475569">Graphite → graphene oxide → reduced graphene · Hummers-style route</text>

  <!-- Panel 1: Graphite -->
  <rect x="28" y="78" width="270" height="340" rx="14" fill="url(#card)" stroke="#cbd5e1" filter="url(#soft)"/>
  <text x="163" y="106" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#334155">1. Graphite</text>
  <text x="163" y="124" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#64748b">Stacked sp² carbon layers</text>
  <g id="graphite-stack" transform="translate(0,-10)">
    ${graphiteLayersSvg}
  </g>
  <text x="163" y="390" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#475569">van der Waals stacked sheets</text>

  <!-- Arrow 1 -->
  <g transform="translate(310, 220)">
    <path d="M0,20 H78" stroke="#0f172a" stroke-width="2.5" marker-end="url(#arr)"/>
    <rect x="4" y="-18" width="70" height="42" rx="8" fill="#fee2e2" stroke="#dc2626"/>
    <text x="39" y="-2" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700" fill="#991b1b">oxidize</text>
    <text x="39" y="12" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="9" fill="#7f1d1d">H₂SO₄ / KMnO₄</text>
  </g>

  <!-- Panel 2: GO -->
  <rect x="400" y="78" width="250" height="340" rx="14" fill="url(#card)" stroke="#cbd5e1" filter="url(#soft)"/>
  <text x="525" y="106" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#b45309">2. Graphene oxide</text>
  <text x="525" y="124" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#64748b">Exfoliated · oxygen groups</text>
  <!-- separated sheets hint -->
  <ellipse cx="525" cy="255" rx="95" ry="70" fill="#fef3c7" opacity="0.45"/>
  <g id="go-sheet">
    <path d="${bondsPath(goLat.bonds)}" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/>
    <path d="${atomsPath(goLat.atoms, 2.6)}" fill="url(#sheetGO)" stroke="#1e293b" stroke-width="0.45" fill-rule="evenodd"/>
    ${oxyGroups.map(renderOxy).join('\n    ')}
  </g>
  <text x="525" y="390" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#475569">epoxy · OH · COOH</text>

  <!-- Arrow 2 -->
  <g transform="translate(662, 220)">
    <path d="M0,20 H78" stroke="#0f172a" stroke-width="2.5" marker-end="url(#arr)"/>
    <rect x="4" y="-18" width="70" height="42" rx="8" fill="#dbeafe" stroke="#2563eb"/>
    <text x="39" y="-2" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700" fill="#1e40af">reduce</text>
    <text x="39" y="12" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="9" fill="#1e3a8a">N₂H₄ / heat</text>
  </g>

  <!-- Panel 3: Graphene -->
  <rect x="752" y="78" width="180" height="340" rx="14" fill="url(#card)" stroke="#cbd5e1" filter="url(#soft)"/>
  <text x="842" y="106" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#0f172a">3. Graphene</text>
  <text x="842" y="124" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#64748b">2D honeycomb</text>
  <ellipse cx="842" cy="250" rx="72" ry="72" fill="#e0f2fe" opacity="0.55"/>
  <g id="graphene-sheet" transform="translate(62,0)">
    <path d="${bondsPath(gLat.bonds)}" fill="none" stroke="#38bdf8" stroke-width="1.65" stroke-linecap="round"/>
    <path d="${atomsPath(gLat.atoms, 2.8)}" fill="url(#sheetG)" stroke="#020617" stroke-width="0.5" fill-rule="evenodd"/>
  </g>
  <text x="842" y="375" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#0369a1">sp² monolayer</text>
  <text x="842" y="392" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="10" fill="#64748b">rGO / graphene</text>

  <!-- Legend -->
  <g transform="translate(28, 438)">
    <rect width="904" height="96" rx="12" fill="#0f172a"/>
    <text x="18" y="22" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="#f8fafc">Process notes</text>
    <text x="18" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">① Intercalation &amp; oxidation (Hummers) opens the graphite gallery</text>
    <text x="18" y="62" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">② Sonication / stirring yields hydrophilic GO sheets with O-functional groups</text>
    <text x="18" y="80" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">③ Chemical or thermal reduction restores conjugated sp² network → graphene / rGO</text>
    <circle cx="720" cy="28" r="4.5" fill="#1e293b" stroke="#94a3b8"/>
    <text x="732" y="32" font-family="Segoe UI, Arial, sans-serif" font-size="10" fill="#cbd5e1">C atom</text>
    <circle cx="790" cy="28" r="4.5" fill="#ef4444"/>
    <text x="802" y="32" font-family="Segoe UI, Arial, sans-serif" font-size="10" fill="#cbd5e1">O / OH</text>
    <text x="886" y="80" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="10" fill="#94a3b8">SVGEdit · MCP abstract</text>
  </g>
</svg>
`

const outSvg = join(outDir, 'graphene-synthesis-abstract.svg')
writeFileSync(outSvg, svg, 'utf8')
console.log('Wrote', outSvg)
