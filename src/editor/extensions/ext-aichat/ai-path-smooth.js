/**
 * Smooth jagged AI-generated paths (flowchart connectors, mind-map branches)
 * into editable cubic Bézier curves.
 */

import { pathDToPolyline, pointsToSmoothPathD } from '../ext-dna/dna-math.js'
import { pointsToSmoothPathD as paperSmoothPathD } from '../../../../packages/svgcanvas/core/paper-smooth.js'

/** Paper.js simplify strength for AI connectors (0–100). */
const AI_CONNECTOR_SMOOTHNESS = 78

/** Fallback Catmull–Rom settings when Paper is unavailable. */
const AI_FALLBACK_OPTS = { minDist: 6, maxPts: 56 }

/**
 * @param {string} d
 * @returns {number}
 */
const countPathCommands = (d, letter) => {
  const re = new RegExp(letter, 'gi')
  return (d.match(re) || []).length
}

/**
 * True when a path looks like a jagged polyline disguised as SVG.
 * @param {string} d
 */
export function shouldSmoothAiPath (d) {
  if (!d || typeof d !== 'string' || d.length < 6) return false
  const lCount = countPathCommands(d, 'L')
  const cCount = countPathCommands(d, 'C')
  const qCount = countPathCommands(d, 'Q')
  // Obvious polylines
  if (lCount >= 4 && cCount === 0 && qCount === 0) return true
  // AI often mixes a few C with many L — still jagged
  if (lCount >= 6 && lCount > cCount * 2) return true
  // Dense point chains (stair-step curves)
  const pts = pathDToPolyline(d, 5)
  if (pts.length >= 10 && lCount >= 3) return true
  // Many tiny quadratic segments
  if (qCount >= 6) return true
  return false
}

/**
 * @param {Element} el
 */
export function isAiConnectorCandidate (el) {
  if (!el || el.tagName?.toLowerCase() !== 'path') return true
  const fill = (el.getAttribute('fill') || '').trim().toLowerCase()
  const stroke = (el.getAttribute('stroke') || '').trim()
  // Filled shapes without stroke are usually boxes — do not reshape
  if (fill && fill !== 'none' && !stroke) return false
  return true
}

/**
 * @param {string} d
 * @returns {string|null}
 */
export function smoothPathDForAi (d) {
  const pts = pathDToPolyline(d, 6)
  if (pts.length < 3) return null
  const paperD = paperSmoothPathD(pts, AI_CONNECTOR_SMOOTHNESS)
  if (paperD && /[Cc]/.test(paperD)) return paperD
  return pointsToSmoothPathD(pts, AI_FALLBACK_OPTS)
}
