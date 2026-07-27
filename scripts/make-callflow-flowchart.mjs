/**
 * Highly detailed call-support flowchart — matches MCP reference style:
 * dark canvas, numbered badges, swimlane containers, ovals/rects/diamonds,
 * Yes/No orthogonal edges, converging terminal pipeline.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../examples')
mkdirSync(outDir, { recursive: true })

const W = 1480
const H = 920

const FONT = `font-family="Segoe UI, system-ui, Arial, sans-serif"`

/** Rounded rect process node */
function rectNode ({ id, n, x, y, w, h, fill, stroke, label, labelSize = 12 }) {
  const lines = wrapLabel(label, w - 16, labelSize)
  const ty = y + h / 2 - ((lines.length - 1) * (labelSize + 2)) / 2 + labelSize / 3
  return `<g id="node-${id}" data-node="${id}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6"
        fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
  ${badge(n, x, y)}
  ${lines.map((ln, i) =>
    `<text x="${x + w / 2}" y="${ty + i * (labelSize + 2)}" text-anchor="middle" ${FONT} font-size="${labelSize}" font-weight="600" fill="#f8fafc">${esc(ln)}</text>`
  ).join('\n  ')}
</g>`
}

/** Capsule / stadium (start & success terminals) */
function capsuleNode ({ id, n, x, y, w, h, fill, stroke, label, labelSize = 12 }) {
  const r = h / 2
  return `<g id="node-${id}" data-node="${id}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}"
        fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
  ${badge(n, x, y)}
  <text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle" ${FONT} font-size="${labelSize}" font-weight="700" fill="#f8fafc">${esc(label)}</text>
</g>`
}

/** Decision diamond */
function diamondNode ({ id, n, cx, cy, s, fill, stroke, label, labelSize = 11 }) {
  const hw = s * 0.92
  const hh = s * 0.62
  const pts = `${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`
  const lines = wrapLabel(label, s * 1.35, labelSize)
  const ty = cy - ((lines.length - 1) * (labelSize + 1)) / 2 + 3
  return `<g id="node-${id}" data-node="${id}">
  <polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
  ${badge(n, cx - hw + 2, cy - hh + 2)}
  ${lines.map((ln, i) =>
    `<text x="${cx}" y="${ty + i * (labelSize + 1)}" text-anchor="middle" ${FONT} font-size="${labelSize}" font-weight="600" fill="#f8fafc">${esc(ln)}</text>`
  ).join('\n  ')}
</g>`
}

function badge (n, x, y) {
  return `<g class="badge">
  <rect x="${x - 1}" y="${y - 1}" width="18" height="16" rx="2" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8"/>
  <text x="${x + 8}" y="${y + 11}" text-anchor="middle" ${FONT} font-size="9" font-weight="700" fill="#0f172a">${n}</text>
</g>`
}

function container ({ id, n, x, y, w, h, stroke, title }) {
  return `<g id="container-${id}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ry="4"
        fill="rgba(15,23,42,0.35)" stroke="${stroke}" stroke-width="1.5"/>
  ${badge(n, x + 8, y + 8)}
  <text x="${x + 32}" y="${y + 20}" ${FONT} font-size="12" font-weight="700" fill="${stroke}" letter-spacing="0.6">${esc(title)}</text>
</g>`
}

/** Orthogonal path with optional arrow */
function edge (d, { marker = true, dash = false } = {}) {
  return `<path d="${d}" fill="none" stroke="#94a3b8" stroke-width="1.35"
    stroke-linecap="round" stroke-linejoin="round"
    ${dash ? 'stroke-dasharray="4 3"' : ''}
    ${marker ? 'marker-end="url(#arr)"' : ''}/>`
}

function labelAt (x, y, text, color = '#e2e8f0') {
  return `<text x="${x}" y="${y}" ${FONT} font-size="10" font-weight="600" fill="${color}">${esc(text)}</text>`
}

function wrapLabel (text, maxW, size) {
  const approx = maxW / (size * 0.55)
  if (text.length <= approx) return [text]
  const words = text.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (t.length > approx && cur) {
      lines.push(cur)
      cur = w
    } else cur = t
  }
  if (cur) lines.push(cur)
  return lines.slice(0, 3)
}

function esc (s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Layout coordinates (tight match to reference) ──────────────────────────
const C = {
  // containers
  exist: { x: 200, y: 36, w: 720, h: 210 },
  neu: { x: 200, y: 270, w: 860, h: 600 },
  gen: { x: 1120, y: 200, w: 320, h: 520 },

  // start
  start: { x: 36, y: 400, w: 120, h: 44 },

  // existing flow
  qGen: { x: 240, y: 90, w: 168, h: 48 },
  dTech: { cx: 520, cy: 114, s: 78 },
  ansTech: { x: 640, y: 60, w: 200, h: 40 },
  localVm: { x: 640, y: 150, w: 200, h: 48 },

  // new flow
  pop: { x: 240, y: 330, w: 150, h: 48 },
  dMenu: { cx: 500, cy: 354, s: 78 },

  // password track
  pwQ: { x: 600, y: 300, w: 150, h: 44 },
  dPw: { cx: 860, cy: 322, s: 70 },
  pwYes: { x: 950, y: 270, w: 170, h: 36 },
  pwNo: { x: 950, y: 330, w: 170, h: 40 },

  // software track
  swQ: { x: 600, y: 430, w: 150, h: 44 },
  dSw: { cx: 860, cy: 452, s: 70 },
  swYes: { x: 950, y: 400, w: 170, h: 36 },
  swNo: { x: 950, y: 460, w: 170, h: 40 },

  // other track
  otQ: { x: 600, y: 570, w: 150, h: 44 },
  dOt: { cx: 860, cy: 592, s: 70 },
  otYes: { x: 950, y: 540, w: 170, h: 36 },
  otNo: { x: 950, y: 600, w: 170, h: 40 },

  // general process
  smart: { x: 1160, y: 260, w: 240, h: 48 },
  ticket: { x: 1160, y: 370, w: 240, h: 48 },
  follow: { x: 1160, y: 480, w: 240, h: 48 },
  done: { x: 1180, y: 600, w: 200, h: 44 }
}

const parts = []

// Background
parts.push(`<rect width="${W}" height="${H}" fill="#0a0a0a"/>`)
parts.push(`<text x="36" y="28" ${FONT} font-size="14" font-weight="700" fill="#94a3b8">Support Call Routing — Detailed Flowchart</text>`)

// Containers (behind nodes)
parts.push(container({ id: 'existing', n: 2, ...C.exist, stroke: '#3b82f6', title: 'EXISTING CALL FLOW' }))
parts.push(container({ id: 'new', n: 7, ...C.neu, stroke: '#a16207', title: 'NEW CALL FLOW' }))
parts.push(container({ id: 'general', n: 22, ...C.gen, stroke: '#9f1239', title: 'GENERAL_PROCESS' }))

// Edges (drawn under nodes)
const edges = []

// Start → Existing / New
const sx = C.start.x + C.start.w
const sy = C.start.y + C.start.h / 2
edges.push(edge(`M${sx},${sy} H${C.exist.x - 8} V${C.qGen.y + C.qGen.h / 2} H${C.qGen.x}`))
edges.push(edge(`M${sx},${sy} H${C.neu.x - 8} V${C.pop.y + C.pop.h / 2} H${C.pop.x}`))

// Existing: queue → diamond
edges.push(edge(`M${C.qGen.x + C.qGen.w},${C.qGen.y + C.qGen.h / 2} H${C.dTech.cx - C.dTech.s * 0.92}`))
// diamond Yes → answered
edges.push(edge(`M${C.dTech.cx + C.dTech.s * 0.92},${C.dTech.cy} H${C.ansTech.x}`))
edges.push(labelAt(C.dTech.cx + C.dTech.s * 0.92 + 8, C.dTech.cy - 8, 'Yes', '#86efac'))
// diamond No → local vm
edges.push(edge(`M${C.dTech.cx},${C.dTech.cy + C.dTech.s * 0.62} V${C.localVm.y + C.localVm.h / 2} H${C.localVm.x}`))
edges.push(labelAt(C.dTech.cx + 8, C.dTech.cy + C.dTech.s * 0.62 + 14, 'No', '#fca5a5'))

// New: pop → menu diamond
edges.push(edge(`M${C.pop.x + C.pop.w},${C.pop.y + C.pop.h / 2} H${C.dMenu.cx - C.dMenu.s * 0.92}`))

// Menu branches to three queues
const menuR = C.dMenu.cx + C.dMenu.s * 0.92
edges.push(edge(`M${menuR},${C.dMenu.cy} H${C.pwQ.x - 20} V${C.pwQ.y + C.pwQ.h / 2} H${C.pwQ.x}`))
edges.push(edge(`M${menuR},${C.dMenu.cy} H${C.swQ.x}`))
edges.push(edge(`M${menuR},${C.dMenu.cy} H${C.otQ.x - 20} V${C.otQ.y + C.otQ.h / 2} H${C.otQ.x}`))

// Password track
edges.push(edge(`M${C.pwQ.x + C.pwQ.w},${C.pwQ.y + C.pwQ.h / 2} H${C.dPw.cx - C.dPw.s * 0.92}`))
edges.push(edge(`M${C.dPw.cx + C.dPw.s * 0.92},${C.dPw.cy} H${C.pwYes.x} V${C.pwYes.y + C.pwYes.h / 2}`))
edges.push(labelAt(C.dPw.cx + C.dPw.s * 0.7, C.dPw.cy - 18, 'Yes', '#86efac'))
edges.push(edge(`M${C.dPw.cx},${C.dPw.cy + C.dPw.s * 0.62} V${C.pwNo.y + C.pwNo.h / 2} H${C.pwNo.x}`))
edges.push(labelAt(C.dPw.cx + 6, C.dPw.cy + C.dPw.s * 0.62 + 12, 'No', '#fca5a5'))

// Software track
edges.push(edge(`M${C.swQ.x + C.swQ.w},${C.swQ.y + C.swQ.h / 2} H${C.dSw.cx - C.dSw.s * 0.92}`))
edges.push(edge(`M${C.dSw.cx + C.dSw.s * 0.92},${C.dSw.cy} H${C.swYes.x} V${C.swYes.y + C.swYes.h / 2}`))
edges.push(labelAt(C.dSw.cx + C.dSw.s * 0.7, C.dSw.cy - 18, 'Yes', '#86efac'))
edges.push(edge(`M${C.dSw.cx},${C.dSw.cy + C.dSw.s * 0.62} V${C.swNo.y + C.swNo.h / 2} H${C.swNo.x}`))
edges.push(labelAt(C.dSw.cx + 6, C.dSw.cy + C.dSw.s * 0.62 + 12, 'No', '#fca5a5'))

// Other track
edges.push(edge(`M${C.otQ.x + C.otQ.w},${C.otQ.y + C.otQ.h / 2} H${C.dOt.cx - C.dOt.s * 0.92}`))
edges.push(edge(`M${C.dOt.cx + C.dOt.s * 0.92},${C.dOt.cy} H${C.otYes.x} V${C.otYes.y + C.otYes.h / 2}`))
edges.push(labelAt(C.dOt.cx + C.dOt.s * 0.7, C.dOt.cy - 18, 'Yes', '#86efac'))
edges.push(edge(`M${C.dOt.cx},${C.dOt.cy + C.dOt.s * 0.62} V${C.otNo.y + C.otNo.h / 2} H${C.otNo.x}`))
edges.push(labelAt(C.dOt.cx + 6, C.dOt.cy + C.dOt.s * 0.62 + 12, 'No', '#fca5a5'))

// Converge voicemails → GENERAL_PROCESS (bundled trunk)
const trunkX = 1100
const smartInY = C.smart.y + C.smart.h / 2
const vmExits = [
  { x: C.localVm.x + C.localVm.w, y: C.localVm.y + C.localVm.h / 2 },
  { x: C.pwNo.x + C.pwNo.w, y: C.pwNo.y + C.pwNo.h / 2 },
  { x: C.swNo.x + C.swNo.w, y: C.swNo.y + C.swNo.h / 2 },
  { x: C.otNo.x + C.otNo.w, y: C.otNo.y + C.otNo.h / 2 }
]
for (const v of vmExits) {
  edges.push(edge(`M${v.x},${v.y} H${trunkX} V${smartInY}`, { marker: false }))
}
edges.push(edge(`M${trunkX},${smartInY} H${C.smart.x}`))

// Terminal pipeline vertical
edges.push(edge(`M${C.smart.x + C.smart.w / 2},${C.smart.y + C.smart.h} V${C.ticket.y}`))
edges.push(edge(`M${C.ticket.x + C.ticket.w / 2},${C.ticket.y + C.ticket.h} V${C.follow.y}`))
edges.push(edge(`M${C.follow.x + C.follow.w / 2},${C.follow.y + C.follow.h} V${C.done.y}`))

parts.push(`<g id="edges">${edges.join('\n')}</g>`)

// Nodes
parts.push(capsuleNode({
  id: 'start', n: 1, ...C.start,
  fill: '#0e7490', stroke: '#22d3ee', label: 'Start Call'
}))

parts.push(rectNode({
  id: 'gen-queue', n: 3, ...C.qGen,
  fill: '#1e3a8a', stroke: '#60a5fa', label: 'General Support Queue'
}))
parts.push(diamondNode({
  id: 'tech-avail', n: 4, ...C.dTech,
  fill: '#1e40af', stroke: '#93c5fd', label: 'Technician Available?'
}))
parts.push(capsuleNode({
  id: 'answered', n: 5, ...C.ansTech,
  fill: '#166534', stroke: '#4ade80', label: 'Call Answered by Technician', labelSize: 11
}))
parts.push(rectNode({
  id: 'local-vm', n: 6, ...C.localVm,
  fill: '#78350f', stroke: '#d97706', label: 'Pivoted to Local Voicemail'
}))

parts.push(rectNode({
  id: 'pop-menu', n: 8, ...C.pop,
  fill: '#78350f', stroke: '#f59e0b', label: 'Pop Menu Options'
}))
parts.push(diamondNode({
  id: 'menu-sel', n: 9, ...C.dMenu,
  fill: '#92400e', stroke: '#fbbf24', label: 'Menu Selection'
}))

// Password track (purple)
parts.push(rectNode({
  id: 'pw-q', n: 10, ...C.pwQ,
  fill: '#581c87', stroke: '#c084fc', label: 'Password Reset Queue'
}))
parts.push(diamondNode({
  id: 'pw-avail', n: 11, ...C.dPw,
  fill: '#6b21a8', stroke: '#d8b4fe', label: 'Redirect Agent Available?'
}))
parts.push(capsuleNode({
  id: 'pw-yes', n: 12, ...C.pwYes,
  fill: '#166534', stroke: '#4ade80', label: 'Password Call Answered', labelSize: 11
}))
parts.push(rectNode({
  id: 'pw-no', n: 13, ...C.pwNo,
  fill: '#78350f', stroke: '#d97706', label: 'Password Prompt Voicemail', labelSize: 11
}))

// Software track (cyan)
parts.push(rectNode({
  id: 'sw-q', n: 14, ...C.swQ,
  fill: '#155e75', stroke: '#22d3ee', label: 'Software Issues Queue'
}))
parts.push(diamondNode({
  id: 'sw-avail', n: 15, ...C.dSw,
  fill: '#0e7490', stroke: '#67e8f9', label: 'Software Agent Available?'
}))
parts.push(capsuleNode({
  id: 'sw-yes', n: 16, ...C.swYes,
  fill: '#166534', stroke: '#4ade80', label: 'Software Call Answered', labelSize: 11
}))
parts.push(rectNode({
  id: 'sw-no', n: 17, ...C.swNo,
  fill: '#78350f', stroke: '#d97706', label: 'Software Prompt Voicemail', labelSize: 11
}))

// Other track (grey)
parts.push(rectNode({
  id: 'ot-q', n: 18, ...C.otQ,
  fill: '#3f3f46', stroke: '#a1a1aa', label: 'Other Issues Queue'
}))
parts.push(diamondNode({
  id: 'ot-avail', n: 19, ...C.dOt,
  fill: '#52525b', stroke: '#d4d4d8', label: 'Other Agent Available?'
}))
parts.push(capsuleNode({
  id: 'ot-yes', n: 20, ...C.otYes,
  fill: '#166534', stroke: '#4ade80', label: 'Other Call Answered', labelSize: 11
}))
parts.push(rectNode({
  id: 'ot-no', n: 21, ...C.otNo,
  fill: '#78350f', stroke: '#d97706', label: 'Other Prompt Voicemail', labelSize: 11
}))

// GENERAL_PROCESS
parts.push(rectNode({
  id: 'smart-vm', n: 23, ...C.smart,
  fill: '#881337', stroke: '#fb7185', label: 'SMART Admin Voicemail'
}))
parts.push(rectNode({
  id: 'ticket', n: 24, ...C.ticket,
  fill: '#9f1239', stroke: '#fb7185', label: 'Ticket Auto-Created'
}))
parts.push(rectNode({
  id: 'follow', n: 25, ...C.follow,
  fill: '#9f1239', stroke: '#fda4af', label: 'Technician Follows Up'
}))
parts.push(capsuleNode({
  id: 'resolved', n: 26, ...C.done,
  fill: '#166534', stroke: '#4ade80', label: 'Issue Resolved'
}))

// Legend
parts.push(`<g id="legend" transform="translate(36, 860)">
  <rect width="1080" height="44" rx="6" fill="#111827" stroke="#334155"/>
  <text x="12" y="18" ${FONT} font-size="10" font-weight="700" fill="#94a3b8">SHAPE KEY</text>
  <rect x="12" y="24" width="36" height="12" rx="6" fill="#0e7490"/><text x="52" y="34" ${FONT} font-size="10" fill="#cbd5e1">Start / success capsule</text>
  <rect x="200" y="24" width="36" height="12" rx="2" fill="#1e3a8a"/><text x="242" y="34" ${FONT} font-size="10" fill="#cbd5e1">Process / queue</text>
  <polygon points="370,30 382,24 394,30 382,36" fill="#1e40af"/><text x="402" y="34" ${FONT} font-size="10" fill="#cbd5e1">Decision</text>
  <rect x="470" y="24" width="36" height="12" rx="2" fill="#78350f"/><text x="512" y="34" ${FONT} font-size="10" fill="#cbd5e1">Voicemail path</text>
  <rect x="620" y="24" width="36" height="12" rx="2" fill="#881337"/><text x="662" y="34" ${FONT} font-size="10" fill="#cbd5e1">Terminal pipeline</text>
  <rect x="800" y="22" width="14" height="12" rx="2" fill="#e2e8f0"/><text x="807" y="31" text-anchor="middle" ${FONT} font-size="8" font-weight="700" fill="#0f172a">n</text>
  <text x="820" y="34" ${FONT} font-size="10" fill="#cbd5e1">Node index badge</text>
  <text x="1060" y="34" text-anchor="end" ${FONT} font-size="9" fill="#64748b">SVGEdit · MCP flowchart</text>
</g>`)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Support Call Routing Flowchart</title>
  <desc>Detailed flowchart with containers, numbered nodes, decisions, and terminal pipeline</desc>
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L7,3 L0,6 Z" fill="#94a3b8"/>
    </marker>
  </defs>
  ${parts.join('\n  ')}
</svg>
`

const out = join(outDir, 'callflow-flowchart.svg')
writeFileSync(out, svg, 'utf8')
console.log('Wrote', out)
