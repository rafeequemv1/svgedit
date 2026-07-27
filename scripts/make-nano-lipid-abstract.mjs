/**
 * Graphical abstract using nanoparticle + lipid bilayer generators.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { computeNanoparticleGeometry } from '../src/editor/extensions/ext-nanoparticle/nanoparticle-math.js'
import { computeBilayerGeometry } from '../src/editor/extensions/ext-lipidbilayer/bilayer-math.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../examples')
mkdirSync(outDir, { recursive: true })

const W = 960
const H = 560

const nanoYellow = computeNanoparticleGeometry({
  cx: 210, cy: 265, radius: 78,
  spacing: 16, particleRadius: 5.5, packing: 'hex'
})
const nanoCoreShell = computeNanoparticleGeometry({
  cx: 210, cy: 265, radius: 32,
  spacing: 12, particleRadius: 4.2, packing: 'hex'
})

const bilayerFree = computeBilayerGeometry({
  x1: 520, y1: 210, x2: 860, y2: 210,
  spacing: 20, headRadius: 5.5, tailLength: 13,
  bilayerGap: 3.5, tailSpread: 32, waviness: 2.5, wavinessFreq: 2, curvature: 8
})

const bilayerBound = computeBilayerGeometry({
  x1: 560, y1: 340, x2: 820, y2: 390,
  spacing: 18, headRadius: 5, tailLength: 12,
  bilayerGap: 3, tailSpread: 28, waviness: 1.5, wavinessFreq: 3, curvature: 18
})

const circlesPath = (sites, fill, stroke, sw = 0.8) => {
  let d = ''
  for (const s of sites) {
    d += `M${s.x - s.r},${s.y}a${s.r},${s.r} 0 1,0 ${s.r * 2},0a${s.r},${s.r} 0 1,0 ${-s.r * 2},0`
  }
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" fill-rule="evenodd"/>`
}

const renderBilayer = (geom, opts = {}) => {
  const {
    membrane = '#b8dce8',
    head = '#e8a838',
    tail = '#475569',
    headStroke = '#92400e',
    id = 'bilayer'
  } = opts
  let s = `<g id="${id}">`
  if (geom.membranePoints) {
    s += `<polygon points="${geom.membranePoints}" fill="${membrane}" opacity="0.55" stroke="none"/>`
  }
  let tails = ''
  let heads = ''
  for (const site of geom.sites) {
    for (const t of [...site.upperTails, ...site.lowerTails]) {
      tails += `M${t.x1},${t.y1}L${t.x2},${t.y2}`
    }
    heads += `M${site.upperHead.x - site.upperHead.r},${site.upperHead.y}a${site.upperHead.r},${site.upperHead.r} 0 1,0 ${site.upperHead.r * 2},0a${site.upperHead.r},${site.upperHead.r} 0 1,0 ${-site.upperHead.r * 2},0`
    heads += `M${site.lowerHead.x - site.lowerHead.r},${site.lowerHead.y}a${site.lowerHead.r},${site.lowerHead.r} 0 1,0 ${site.lowerHead.r * 2},0a${site.lowerHead.r},${site.lowerHead.r} 0 1,0 ${-site.lowerHead.r * 2},0`
  }
  if (tails) s += `<path d="${tails}" fill="none" stroke="${tail}" stroke-width="1.35" stroke-linecap="round"/>`
  if (heads) s += `<path d="${heads}" fill="${head}" stroke="${headStroke}" stroke-width="0.9" fill-rule="evenodd"/>`
  s += '</g>'
  return s
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Graphical Abstract — Nanoparticle–Membrane Interaction</title>
  <desc>Built with SVGEdit nanoparticle + lipid bilayer generators</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f1f5f9"/>
    </linearGradient>
    <marker id="arr" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#0f172a"/>
    </marker>
    <filter id="soft" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#0f172a" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="480" y="40" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="700" fill="#0f172a">Nanoparticle Docking at a Lipid Bilayer</text>
  <text x="480" y="62" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#475569">Graphical abstract · hex-packed NP · membrane leaflets · binding &amp; curvature</text>

  <!-- Left card: nanoparticle -->
  <rect x="36" y="86" width="350" height="360" rx="14" fill="url(#card)" stroke="#cbd5e1" filter="url(#soft)"/>
  <text x="211" y="114" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#a16207">1. Functional nanoparticle</text>
  <text x="211" y="132" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#64748b">Hexagonal lattice · core–shell motif</text>

  <g id="nanoparticle-main" shape="nanoparticle">
    <circle cx="210" cy="265" r="${nanoYellow.outerR}" fill="#f9ba00" fill-opacity="0.12" stroke="#c49200" stroke-width="1.2" stroke-dasharray="3 2"/>
    ${circlesPath(nanoYellow.sites, '#f9ba00', '#c49200', 0.75)}
    <circle cx="210" cy="265" r="${nanoCoreShell.outerR}" fill="#38bdf8" fill-opacity="0.18" stroke="#0284c7" stroke-width="1"/>
    ${circlesPath(nanoCoreShell.sites, '#0ea5e9', '#0369a1', 0.7)}
  </g>

  <!-- NP icon badge -->
  <g transform="translate(56, 390)">
    <circle cx="16" cy="16" r="14" fill="#fef3c7" stroke="#d97706" stroke-width="1.4"/>
    <circle cx="16" cy="16" r="5" fill="#f59e0b"/>
    <circle cx="10" cy="12" r="2.2" fill="#fbbf24"/>
    <circle cx="22" cy="14" r="2" fill="#fbbf24"/>
    <circle cx="14" cy="22" r="1.8" fill="#fbbf24"/>
    <text x="38" y="20" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#334155">Drug-loaded NP</text>
  </g>

  <!-- Process arrow -->
  <g transform="translate(410, 250)">
    <path d="M0,20 H95" stroke="#0f172a" stroke-width="3" marker-end="url(#arr)"/>
    <rect x="12" y="-14" width="70" height="26" rx="8" fill="#dbeafe" stroke="#2563eb"/>
    <text x="47" y="3" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="#1e40af">docking</text>
    <text x="47" y="42" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#475569">approach</text>
  </g>

  <!-- Right card: membranes -->
  <rect x="530" y="86" width="394" height="360" rx="14" fill="url(#card)" stroke="#cbd5e1" filter="url(#soft)"/>
  <text x="727" y="114" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#0e7490">2. Membrane engagement</text>
  <text x="727" y="132" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#64748b">Lipid bilayer · leaflet heads/tails · local bend</text>

  ${renderBilayer(bilayerFree, { id: 'bilayer-resting', membrane: '#a5d8e8', head: '#e8a838', tail: '#334155' })}
  <text x="690" y="188" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#0f766e">resting bilayer</text>

  <!-- Small NP approaching curved membrane -->
  <g id="nanoparticle-dock" shape="nanoparticle" transform="translate(470, 55) scale(0.55)">
    ${(() => {
      const n = computeNanoparticleGeometry({ cx: 210, cy: 265, radius: 48, spacing: 14, particleRadius: 4.5 })
      return `<circle cx="210" cy="265" r="${n.outerR}" fill="#f9ba00" fill-opacity="0.15" stroke="#c49200" stroke-width="1.2" stroke-dasharray="3 2"/>` +
        circlesPath(n.sites, '#f9ba00', '#c49200', 0.7)
    })()}
  </g>

  ${renderBilayer(bilayerBound, { id: 'bilayer-bound', membrane: '#7dd3c7', head: '#f59e0b', tail: '#1f2937' })}
  <text x="700" y="420" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#0f766e">NP-induced curvature</text>

  <!-- Legend -->
  <g transform="translate(36, 468)">
    <rect width="888" height="68" rx="12" fill="#0f172a"/>
    <text x="18" y="24" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="#f8fafc">Legend</text>
    <circle cx="28" cy="44" r="5" fill="#f9ba00" stroke="#c49200"/>
    <text x="40" y="48" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Nanoparticle sites</text>
    <circle cx="180" cy="44" r="5" fill="#0ea5e9" stroke="#0369a1"/>
    <text x="192" y="48" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Core cluster</text>
    <circle cx="310" cy="44" r="5" fill="#e8a838" stroke="#92400e"/>
    <text x="322" y="48" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Lipid heads</text>
    <line x1="430" y1="44" x2="458" y2="44" stroke="#94a3b8" stroke-width="2" stroke-linecap="round"/>
    <text x="466" y="48" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Fatty-acid tails</text>
    <rect x="600" y="36" width="22" height="14" rx="2" fill="#a5d8e8" opacity="0.8"/>
    <text x="630" y="48" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Membrane</text>
    <text x="870" y="48" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="10" fill="#94a3b8">SVGEdit · NP + bilayer · Cursor preview</text>
  </g>
</svg>
`

const out = join(outDir, 'nano-lipid-graphical-abstract.svg')
writeFileSync(out, svg, 'utf8')
console.log('Wrote', out, 'bytes', svg.length)
console.log('NP sites', nanoYellow.sites.length, 'bilayer lipids', bilayerFree.sites.length + bilayerBound.sites.length)
