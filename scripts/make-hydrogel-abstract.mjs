/**
 * Build a publication-style graphical abstract using hydrogel geometry.
 * Demo artifact for future MCP / agent-driven figure generation.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { generateHydrogelGeometry, batchHydrogelGeometry } from '../src/editor/extensions/ext-hydrogel/hydrogel-math.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../examples')
mkdirSync(outDir, { recursive: true })

const W = 900
const H = 520

const makeGel = (rect, opts, seed) =>
  batchHydrogelGeometry(generateHydrogelGeometry(rect, opts, seed))

const gelLoaded = makeGel(
  { x: 70, y: 140, w: 260, h: 240 },
  {
    hydrogelShape: 'circle',
    density: 55,
    chainLength: 18,
    polymerColor: 'rgba(14, 165, 233, 0.85)',
    polymerThickness: 1.35,
    showParticles: true,
    particleCount: 36,
    particleRadius: 3.2,
    particleColor: 'rgba(245, 158, 11, 1)',
    poreSize: 16,
    networkType: 'cross-linked',
    crosslinkDensity: 28,
    crosslinkerRadius: 2.2,
    crosslinkerColor: 'rgba(236, 72, 153, 1)',
    swelling: 62,
    payloadRelease: 0
  },
  20260719
)

const gelReleased = makeGel(
  { x: 560, y: 155, w: 220, h: 200 },
  {
    hydrogelShape: 'circle',
    density: 40,
    chainLength: 14,
    polymerColor: 'rgba(56, 189, 248, 0.55)',
    polymerThickness: 1.15,
    showParticles: true,
    particleCount: 36,
    particleRadius: 3.0,
    particleColor: 'rgba(245, 158, 11, 1)',
    poreSize: 18,
    networkType: 'cross-linked',
    crosslinkDensity: 18,
    crosslinkerRadius: 2.0,
    crosslinkerColor: 'rgba(236, 72, 153, 0.85)',
    swelling: 28,
    payloadRelease: 72
  },
  20260720
)

const gelPath = (b, role) => {
  let s = ''
  if (b.chainsD) {
    s += `<path data-role="${role}-chains" d="${b.chainsD}" fill="none" stroke="${b.chainsStroke}" stroke-width="${b.chainsStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  if (b.crosslinksD) {
    s += `<path data-role="${role}-crosslinks" d="${b.crosslinksD}" fill="${b.crosslinksFill}" stroke="none" fill-rule="evenodd"/>`
  }
  if (b.particlesD) {
    s += `<path data-role="${role}-particles" d="${b.particlesD}" fill="${b.particlesFill}" stroke="none" fill-rule="evenodd"/>`
  }
  return s
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Graphical Abstract — Stimuli-Responsive Hydrogel Drug Release</title>
  <desc>Generated via SVGEdit hydrogel math for MCP integration demo</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f1f5f9"/>
    </linearGradient>
    <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6 Z" fill="#0f172a"/>
    </marker>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.12"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="450" y="42" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="700" fill="#0f172a">Stimuli-Responsive Hydrogel for Controlled Drug Release</text>
  <text x="450" y="66" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="#475569">Graphical abstract · polymer network · payload encapsulation · triggered release</text>

  <rect x="40" y="90" width="320" height="330" rx="14" fill="url(#panel)" stroke="#cbd5e1" filter="url(#soft)"/>
  <text x="200" y="118" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#0369a1">1. Drug-loaded hydrogel</text>
  <text x="200" y="136" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#64748b">Cross-linked network · encapsulated payload</text>

  <g id="gel-loaded" shape="hydrogel">
    ${gelPath(gelLoaded, 'loaded')}
  </g>

  <g transform="translate(58, 360)" opacity="0.95">
    <path d="M8,8 L8,4 L28,4 L28,8 L34,38 Q21,46 8,38 Z" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5"/>
    <rect x="6" y="2" width="24" height="5" rx="1" fill="#0284c7"/>
    <circle cx="16" cy="24" r="2.2" fill="#f59e0b"/>
    <circle cx="22" cy="28" r="1.8" fill="#f59e0b"/>
    <text x="42" y="28" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#334155">Depot reservoir</text>
  </g>

  <g transform="translate(390, 220)">
    <path d="M0,30 H90" stroke="#0f172a" stroke-width="3" marker-end="url(#arrowHead)"/>
    <rect x="8" y="-18" width="74" height="28" rx="8" fill="#fef3c7" stroke="#d97706"/>
    <text x="45" y="1" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="#92400e">pH / heat</text>
    <text x="45" y="52" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#475569">stimulus</text>
  </g>

  <path d="M360,300 Q450,360 540,300" fill="none" stroke="#ec4899" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#arrowHead)" opacity="0.7"/>
  <text x="450" y="375" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#be185d">payload release</text>

  <rect x="540" y="90" width="320" height="330" rx="14" fill="url(#panel)" stroke="#cbd5e1" filter="url(#soft)"/>
  <text x="700" y="118" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#9d174d">2. Triggered release</text>
  <text x="700" y="136" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#64748b">Network deswells · cargo diffuses out</text>

  <g id="gel-released" shape="hydrogel">
    ${gelPath(gelReleased, 'released')}
  </g>

  <g transform="translate(780, 355)" opacity="0.95">
    <circle cx="22" cy="22" r="18" fill="#fce7f3" stroke="#db2777" stroke-width="1.5"/>
    <circle cx="22" cy="22" r="7" fill="#fbcfe8" stroke="#be185d" stroke-width="1"/>
    <circle cx="18" cy="16" r="2" fill="#f59e0b"/>
    <circle cx="28" cy="20" r="1.6" fill="#f59e0b"/>
    <circle cx="24" cy="28" r="1.8" fill="#f59e0b"/>
    <text x="-70" y="26" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#334155">Target tissue</text>
  </g>

  <g transform="translate(40, 440)">
    <rect width="820" height="58" rx="10" fill="#0f172a"/>
    <text x="16" y="22" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" fill="#f8fafc">Legend</text>
    <line x1="16" y1="40" x2="46" y2="40" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
    <text x="52" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Polymer chains</text>
    <circle cx="170" cy="40" r="4" fill="#ec4899"/>
    <text x="180" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Cross-links</text>
    <circle cx="290" cy="40" r="4" fill="#f59e0b"/>
    <text x="300" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Drug particles</text>
    <path d="M420,40 H455" stroke="#f8fafc" stroke-width="2" marker-end="url(#arrowHead)"/>
    <text x="465" y="44" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#e2e8f0">Process flow</text>
    <text x="800" y="44" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="10" fill="#94a3b8">LabCanvas / SVGEdit hydrogel · MCP demo</text>
  </g>
</svg>
`

const out = join(outDir, 'hydrogel-graphical-abstract.svg')
writeFileSync(out, svg, 'utf8')
console.log('Wrote', out)
console.log('bytes', svg.length)
console.log('loaded bounds', gelLoaded.bounds)
console.log('released bounds', gelReleased.bounds)
