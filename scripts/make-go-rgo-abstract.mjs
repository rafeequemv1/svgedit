/**
 * Precise recreation of GO/rGO circular graphical abstract
 * Matches reference: Structure · Properties · Applications · Functionality
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../examples')
mkdirSync(outDir, { recursive: true })

const W = 920
const H = 920
const CX = 460
const CY = 460
const R = 448
const HUB_R = 112
const FONT = `font-family="Arial, Helvetica, sans-serif"`
const LABEL_BLUE = '#2b6cb0'
const FG_RED = '#c53030'

function hexPoints (cx, cy, r) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 6 + (i * Math.PI) / 3
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

function honeycomb7 (cx, cy, r) {
  const positions = [[0, 0]]
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    positions.push([Math.cos(a) * r * Math.sqrt(3), Math.sin(a) * r * Math.sqrt(3)])
  }
  return positions.map(([dx, dy]) =>
    `<polygon points="${hexPoints(cx + dx, cy + dy, r)}" fill="url(#hex3d)" stroke="#1a202c" stroke-width="1.15"/>`
  ).join('\n      ')
}

/** Continuous hex lattice (filled faces + edges) — closer to reference look */
function grapheneLattice ({ id, cx, cy, cols, rows, size }) {
  const dx = size * 1.5
  const dy = size * Math.sqrt(3)
  const faces = []
  const edges = []
  const seen = new Set()
  const key = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = cx + c * dx - ((cols - 1) * dx) / 2
      const oy = cy + r * dy - ((rows - 1) * dy) / 2 + (c % 2 ? dy / 2 : 0)
      const pts = []
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 6 + (i * Math.PI) / 3
        pts.push([ox + Math.cos(a) * size, oy + Math.sin(a) * size])
      }
      faces.push(`<polygon points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="#edf2f7" stroke="none"/>`)
      for (let i = 0; i < 6; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % 6]
        const bk = [key(x1, y1), key(x2, y2)].sort().join('|')
        if (!seen.has(bk)) {
          seen.add(bk)
          edges.push(`M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`)
        }
      }
    }
  }
  return `<g id="${id}">
    ${faces.join('\n    ')}
    <path d="${edges.join('')}" fill="none" stroke="#4a5568" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`
}

function ohBadge (x, y) {
  return `<g>
    <circle cx="${x}" cy="${y}" r="8" fill="#fff" stroke="${FG_RED}" stroke-width="1.3"/>
    <text x="${x}" y="${y + 3.2}" text-anchor="middle" ${FONT} font-size="8.5" font-weight="700" fill="${FG_RED}">OH</text>
  </g>`
}
function oBadge (x, y) {
  return `<g>
    <circle cx="${x}" cy="${y}" r="7.5" fill="#fff" stroke="${FG_RED}" stroke-width="1.3"/>
    <text x="${x}" y="${y + 3.5}" text-anchor="middle" ${FONT} font-size="10" font-weight="700" fill="${FG_RED}">O</text>
  </g>`
}
function coohBadge (x, y, label = 'COOH') {
  return `<g>
    <rect x="${x - 18}" y="${y - 8}" width="36" height="16" rx="3" fill="#fff" stroke="${FG_RED}" stroke-width="1.2"/>
    <text x="${x}" y="${y + 3.5}" text-anchor="middle" ${FONT} font-size="8" font-weight="700" fill="${FG_RED}">${label}</text>
  </g>`
}

/** Curved text using textPath */
function curvedText (id, text, r, a0, a1, size = 12.5, weight = 700) {
  // a0,a1 in degrees; 0=east, CCW in math but SVG y-down → use same trig
  const rad = d => (d * Math.PI) / 180
  const x1 = CX + r * Math.cos(rad(a0))
  const y1 = CY + r * Math.sin(rad(a0))
  const x2 = CX + r * Math.cos(rad(a1))
  const y2 = CY + r * Math.sin(rad(a1))
  // sweep 1 = CCW
  const sweep = a1 > a0 ? 1 : 0
  return `
  <defs><path id="${id}" fill="none" d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 0,${sweep} ${x2.toFixed(2)},${y2.toFixed(2)}"/></defs>
  <text ${FONT} font-size="${size}" font-weight="${weight}" fill="#1a202c">
    <textPath href="#${id}" startOffset="50%" text-anchor="middle">${text}</textPath>
  </text>`
}

// Structure lattices
const rgo = grapheneLattice({ id: 'rgo', cx: 245, cy: 175, cols: 5, rows: 3, size: 15 })
const go = grapheneLattice({ id: 'go', cx: 245, cy: 300, cols: 5, rows: 3, size: 15 })

// Functionality diagrams
function hydroxyl (x, y) {
  return `<g transform="translate(${x},${y})">
    <text x="-34" y="4" ${FONT} font-size="13" font-weight="700" fill="#1a202c">R</text>
    <line x1="-26" y1="0" x2="-8" y2="0" stroke="#1a202c" stroke-width="2"/>
    <circle cx="0" cy="0" r="9" fill="#fff" stroke="#1a202c" stroke-width="1.8"/>
    <text x="0" y="4.5" text-anchor="middle" ${FONT} font-size="12" font-weight="700" fill="#1a202c">O</text>
    <line x1="9" y1="0" x2="24" y2="0" stroke="#1a202c" stroke-width="2"/>
    <circle cx="30" cy="0" r="3.5" fill="#1a202c"/>
    <text x="40" y="4.5" ${FONT} font-size="13" font-weight="700" fill="#1a202c">H</text>
    <text x="8" y="28" text-anchor="middle" ${FONT} font-size="13" font-weight="700" fill="${LABEL_BLUE}">Hydroxyl</text>
  </g>`
}
function carboxylic (x, y) {
  return `<g transform="translate(${x},${y})">
    <text x="-36" y="4" ${FONT} font-size="13" font-weight="700" fill="#1a202c">R</text>
    <line x1="-28" y1="0" x2="-10" y2="0" stroke="#1a202c" stroke-width="1.8"/>
    <circle cx="0" cy="0" r="8" fill="#fff" stroke="#1a202c" stroke-width="1.7"/>
    <text x="0" y="4" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#1a202c">C</text>
    <!-- double bond up to O -->
    <line x1="-1.8" y1="-8" x2="-1.8" y2="-18" stroke="#1a202c" stroke-width="1.6"/>
    <line x1="1.8" y1="-8" x2="1.8" y2="-18" stroke="#1a202c" stroke-width="1.6"/>
    <circle cx="0" cy="-26" r="8" fill="#fff" stroke="#1a202c" stroke-width="1.7"/>
    <text x="0" y="-22" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#1a202c">O</text>
    <!-- OH to the right-down -->
    <line x1="7" y1="4" x2="18" y2="12" stroke="#1a202c" stroke-width="1.7"/>
    <circle cx="26" cy="16" r="8" fill="#fff" stroke="#1a202c" stroke-width="1.7"/>
    <text x="26" y="20" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#1a202c">O</text>
    <line x1="34" y1="16" x2="44" y2="16" stroke="#1a202c" stroke-width="1.7"/>
    <circle cx="50" cy="16" r="3.2" fill="#1a202c"/>
    <text x="58" y="20" ${FONT} font-size="12" font-weight="700" fill="#1a202c">H</text>
    <text x="14" y="42" text-anchor="middle" ${FONT} font-size="13" font-weight="700" fill="${LABEL_BLUE}">Carboxylic</text>
  </g>`
}
function epoxide (x, y) {
  return `<g transform="translate(${x},${y})">
    <text x="-32" y="-20" ${FONT} font-size="11" font-weight="700" fill="#1a202c">R₁</text>
    <text x="22" y="-20" ${FONT} font-size="11" font-weight="700" fill="#1a202c">R₂</text>
    <text x="-32" y="30" ${FONT} font-size="11" font-weight="700" fill="#1a202c">R₃</text>
    <text x="22" y="30" ${FONT} font-size="11" font-weight="700" fill="#1a202c">R₄</text>
    <line x1="-18" y1="-14" x2="-8" y2="-2" stroke="#1a202c" stroke-width="1.5"/>
    <line x1="18" y1="-14" x2="8" y2="-2" stroke="#1a202c" stroke-width="1.5"/>
    <line x1="-18" y1="20" x2="-8" y2="10" stroke="#1a202c" stroke-width="1.5"/>
    <line x1="18" y1="20" x2="8" y2="10" stroke="#1a202c" stroke-width="1.5"/>
    <line x1="-8" y1="4" x2="8" y2="4" stroke="#1a202c" stroke-width="1.8"/>
    <line x1="-8" y1="4" x2="0" y2="-12" stroke="#1a202c" stroke-width="1.8"/>
    <line x1="8" y1="4" x2="0" y2="-12" stroke="#1a202c" stroke-width="1.8"/>
    <circle cx="0" cy="-16" r="7.5" fill="#fff" stroke="#1a202c" stroke-width="1.6"/>
    <text x="0" y="-12" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#1a202c">O</text>
    <circle cx="-9" cy="6" r="6" fill="#fff" stroke="#1a202c" stroke-width="1.4"/>
    <circle cx="9" cy="6" r="6" fill="#fff" stroke="#1a202c" stroke-width="1.4"/>
    <text x="-9" y="9" text-anchor="middle" ${FONT} font-size="9" font-weight="700" fill="#1a202c">C</text>
    <text x="9" y="9" text-anchor="middle" ${FONT} font-size="9" font-weight="700" fill="#1a202c">C</text>
    <text x="0" y="50" text-anchor="middle" ${FONT} font-size="13" font-weight="700" fill="${LABEL_BLUE}">Epoxide</text>
  </g>`
}
function carbonyl (x, y) {
  return `<g transform="translate(${x},${y})">
    <text x="-32" y="4" ${FONT} font-size="12" font-weight="700" fill="#1a202c">R</text>
    <line x1="-24" y1="0" x2="-9" y2="0" stroke="#1a202c" stroke-width="1.7"/>
    <circle cx="0" cy="0" r="8" fill="#fff" stroke="#1a202c" stroke-width="1.7"/>
    <text x="0" y="4" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#1a202c">C</text>
    <line x1="-1.6" y1="-8" x2="-1.6" y2="-17" stroke="#1a202c" stroke-width="1.5"/>
    <line x1="1.6" y1="-8" x2="1.6" y2="-17" stroke="#1a202c" stroke-width="1.5"/>
    <circle cx="0" cy="-24" r="8" fill="#fff" stroke="#1a202c" stroke-width="1.7"/>
    <text x="0" y="-20" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#1a202c">O</text>
    <line x1="8" y1="0" x2="22" y2="0" stroke="#1a202c" stroke-width="1.7"/>
    <text x="26" y="4" ${FONT} font-size="12" font-weight="700" fill="#1a202c">R′</text>
    <text x="4" y="24" text-anchor="middle" ${FONT} font-size="12" font-weight="700" fill="${LABEL_BLUE}">Carbonyl</text>
  </g>`
}

function biosensor (x, y) {
  return `<g transform="translate(${x},${y})">
    <rect x="-30" y="12" width="60" height="7" rx="2" fill="#3182ce"/>
    ${[-18, 0, 18].map(dx => `
      <path d="M${dx},12 L${dx},0" stroke="#e53e3e" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M${dx},0 Q${dx - 10},-8 ${dx - 10},-16" fill="none" stroke="#e53e3e" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M${dx},0 Q${dx + 10},-8 ${dx + 10},-16" fill="none" stroke="#e53e3e" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="${dx - 10}" cy="-17" r="2.8" fill="#e53e3e"/>
      <circle cx="${dx + 10}" cy="-17" r="2.8" fill="#e53e3e"/>
    `).join('')}
    <text x="0" y="36" text-anchor="middle" ${FONT} font-size="12" font-weight="700" fill="#1a202c">Biosensor</text>
  </g>`
}
function bioimaging (x, y) {
  return `<g transform="translate(${x},${y})">
    <ellipse cx="0" cy="0" rx="24" ry="17" fill="#68d391" stroke="#276749" stroke-width="1.5"/>
    <ellipse cx="-5" cy="-2" rx="9" ry="8" fill="#2b6cb0"/>
    <ellipse cx="11" cy="5" rx="5" ry="4" fill="#9ae6b4"/>
    <path d="M-18,-6 Q-22,-14 -14,-16" fill="none" stroke="#276749" stroke-width="1.3"/>
    <text x="0" y="36" text-anchor="middle" ${FONT} font-size="12" font-weight="700" fill="#1a202c">Bioimaging</text>
  </g>`
}
function tissue (x, y) {
  return `<g transform="translate(${x},${y})">
    <rect x="-26" y="-18" width="52" height="34" rx="3" fill="#fed7e2" stroke="#d53f8c" stroke-width="1.1"/>
    ${[-10, -2, 6, 14].map(yy => `<path d="M-22,${yy} Q-8,${yy - 5} 0,${yy} Q10,${yy + 5} 22,${yy}" fill="none" stroke="#ed64a6" stroke-width="1.55"/>`).join('')}
    ${[-12, -4, 4, 12].map(xx => `<path d="M${xx},-14 Q${xx + 4},0 ${xx},14" fill="none" stroke="#f687b3" stroke-width="1.35"/>`).join('')}
    <text x="0" y="38" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#1a202c">Tissue Engineering</text>
  </g>`
}
function antibacterial (x, y) {
  return `<g transform="translate(${x},${y})">
    <ellipse cx="-2" cy="0" rx="22" ry="11" fill="#ecc94b" stroke="#975a16" stroke-width="1.5"/>
    <ellipse cx="-8" cy="-2" rx="5" ry="3.5" fill="#d69e2e" opacity="0.45"/>
    <line x1="18" y1="-5" x2="30" y2="-12" stroke="#975a16" stroke-width="1.4"/>
    <line x1="20" y1="0" x2="32" y2="0" stroke="#975a16" stroke-width="1.4"/>
    <line x1="18" y1="5" x2="30" y2="12" stroke="#975a16" stroke-width="1.4"/>
    <circle cx="30" cy="-12" r="2.2" fill="#975a16"/>
    <circle cx="32" cy="0" r="2.2" fill="#975a16"/>
    <circle cx="30" cy="12" r="2.2" fill="#975a16"/>
    <text x="0" y="36" text-anchor="middle" ${FONT} font-size="12" font-weight="700" fill="#1a202c">Antibacterial</text>
  </g>`
}
function phototherapy (x, y) {
  return `<g transform="translate(${x},${y})">
    <polygon points="5,-20 -7,-1 1,-1 -3,20 10,1 1,1" fill="#ed8936" stroke="#c05621" stroke-width="1.3" stroke-linejoin="round"/>
    <text x="2" y="36" text-anchor="middle" ${FONT} font-size="11.5" font-weight="700" fill="#1a202c">Phototherapy</text>
  </g>`
}
function dna (x, y) {
  return `<g transform="translate(${x},${y})">
    <path d="M-9,-18 C-18,-8 -2,0 -9,10 C-16,18 -2,24 -7,30" fill="none" stroke="#3182ce" stroke-width="2.3"/>
    <path d="M9,-18 C18,-8 2,0 9,10 C16,18 2,24 7,30" fill="none" stroke="#e53e3e" stroke-width="2.3"/>
    ${[-12, -3, 6, 15, 24].map(yy =>
      `<line x1="${-8}" y1="${yy}" x2="${8}" y2="${yy}" stroke="#a0aec0" stroke-width="1.5"/>`
    ).join('')}
    <text x="0" y="46" text-anchor="middle" ${FONT} font-size="10.5" font-weight="700" fill="#1a202c">Drug/gene delivery</text>
  </g>`
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>GO/rGO Graphical Abstract</title>
  <desc>Structure, Properties, Applications, and Functionality of Graphene Oxide and Reduced Graphene Oxide</desc>
  <defs>
    <clipPath id="circleClip"><circle cx="${CX}" cy="${CY}" r="${R - 2}"/></clipPath>
    <filter id="softShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="1" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.2"/>
    </filter>
    <radialGradient id="hubFill" cx="45%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#ffe4cc"/>
      <stop offset="100%" stop-color="#f0b27a"/>
    </radialGradient>
    <linearGradient id="hex3d" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a0aec0"/>
      <stop offset="55%" stop-color="#4a5568"/>
      <stop offset="100%" stop-color="#2d3748"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- outer border -->
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="#ffffff" stroke="#1a202c" stroke-width="2.4"/>

  <g clip-path="url(#circleClip)">
    <!-- dashed cross through full diameter -->
    <line x1="${CX}" y1="${CY - R}" x2="${CX}" y2="${CY + R}"
          stroke="#a0aec0" stroke-width="1.5" stroke-dasharray="8 5"/>
    <line x1="${CX - R}" y1="${CY}" x2="${CX + R}" y2="${CY}"
          stroke="#a0aec0" stroke-width="1.5" stroke-dasharray="8 5"/>

    <!-- STRUCTURE (top-left) -->
    <g id="structure">
      ${rgo}
      ${ohBadge(200, 148)}
      ${oBadge(292, 162)}
      <text x="245" y="232" text-anchor="middle" ${FONT} font-size="13.5" font-weight="700" fill="${LABEL_BLUE}">Reduced graphene oxide (rGO)</text>

      ${go}
      ${coohBadge(168, 278, 'COOH')}
      ${ohBadge(210, 262)}
      ${oBadge(255, 292)}
      ${ohBadge(300, 268)}
      ${coohBadge(328, 318, 'COOH')}
      <text x="245" y="365" text-anchor="middle" ${FONT} font-size="13.5" font-weight="700" fill="${LABEL_BLUE}">Graphene oxide (GO)</text>
    </g>

    <!-- PROPERTIES (top-right) — overlapping pastel bubbles -->
    <g id="properties">
      <circle cx="590" cy="155" r="56" fill="#90cdf4" fill-opacity="0.58" stroke="#63b3ed" stroke-width="1.1"/>
      <text x="590" y="160" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="#1a202c">Electrical</text>

      <circle cx="730" cy="148" r="54" fill="#fbb6ce" fill-opacity="0.58" stroke="#f687b3" stroke-width="1.1"/>
      <text x="730" y="153" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="#1a202c">Physical</text>

      <circle cx="630" cy="250" r="58" fill="#faf089" fill-opacity="0.62" stroke="#ecc94b" stroke-width="1.1"/>
      <text x="630" y="255" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="#1a202c">Photothermal</text>

      <circle cx="755" cy="248" r="52" fill="#a3bffa" fill-opacity="0.52" stroke="#7f9cf5" stroke-width="1.1"/>
      <text x="755" y="253" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="#1a202c">Optical</text>

      <circle cx="685" cy="340" r="56" fill="#9ae6b4" fill-opacity="0.58" stroke="#68d391" stroke-width="1.1"/>
      <text x="685" y="345" text-anchor="middle" ${FONT} font-size="13" font-weight="700" fill="#1a202c">Biocompatibility</text>
    </g>

    <!-- APPLICATIONS (bottom-left) 2×3 — kept inside circle -->
    <g id="applications">
      ${biosensor(180, 505)}
      ${bioimaging(305, 505)}
      ${tissue(180, 585)}
      ${antibacterial(305, 585)}
      ${phototherapy(180, 670)}
      ${dna(305, 658)}
    </g>

    <!-- FUNCTIONALITY (bottom-right) -->
    <g id="functionality">
      ${carboxylic(555, 510)}
      ${hydroxyl(715, 500)}
      ${epoxide(615, 605)}
      ${carbonyl(720, 700)}
    </g>
  </g>

  <!-- CENTRAL HUB (above dashed lines visually) -->
  <g id="hub">
    <circle cx="${CX}" cy="${CY}" r="${HUB_R}" fill="url(#hubFill)" stroke="#dd6b20" stroke-width="1.3" filter="url(#softShadow)"/>
    <!-- divider ticks -->
    <line x1="${CX}" y1="${CY - HUB_R}" x2="${CX}" y2="${CY - HUB_R + 12}" stroke="#c05621" stroke-width="1.3"/>
    <line x1="${CX}" y1="${CY + HUB_R - 12}" x2="${CX}" y2="${CY + HUB_R}" stroke="#c05621" stroke-width="1.3"/>
    <line x1="${CX - HUB_R}" y1="${CY}" x2="${CX - HUB_R + 12}" y2="${CY}" stroke="#c05621" stroke-width="1.3"/>
    <line x1="${CX + HUB_R - 12}" y1="${CY}" x2="${CX + HUB_R}" y2="${CY}" stroke="#c05621" stroke-width="1.3"/>

    <g filter="url(#softShadow)">
      ${honeycomb7(CX, CY - 2, 15.5)}
    </g>
    <text x="${CX}" y="${CY + 7}" text-anchor="middle" ${FONT} font-size="21" font-weight="800" fill="#1a202c" letter-spacing="0.5">GO/rGO</text>

    <!-- rim labels (angles: 0° east, CCW; screen y-down)
         Structure NW ≈ 200→245°, Properties NE ≈ 295→340°,
         Applications SW ≈ 155→115° (CW for upright), Functionality SE ≈ 65→25° -->
    ${curvedText('p-structure', 'Structure', HUB_R - 14, 200, 255, 12.5)}
    ${curvedText('p-properties', 'Properties', HUB_R - 14, 285, 340, 12.5)}
    ${curvedText('p-apps', 'Applications', HUB_R - 14, 165, 105, 11.5)}
    ${curvedText('p-func', 'Functionality', HUB_R - 14, 75, 15, 11.5)}
  </g>

  <!-- redraw outer stroke on top -->
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#1a202c" stroke-width="2.4"/>
</svg>
`

const out = join(outDir, 'go-rgo-abstract.svg')
writeFileSync(out, svg, 'utf8')
console.log('Wrote', out)
