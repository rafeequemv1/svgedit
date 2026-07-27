/**
 * Freehand polyline → smooth cubic SVG path via Paper.js simplify().
 * Used as a one-shot sidecar (no live Paper scene in the editor).
 */
import paper from 'paper/dist/paper-core.js'

let setupDone = false

const ensurePaper = () => {
  if (setupDone) return paper
  // Headless 1×1 canvas — Paper needs a view; we never display it.
  const canvas = (typeof document !== 'undefined')
    ? document.createElement('canvas')
    : null
  if (canvas) {
    canvas.width = 1
    canvas.height = 1
    paper.setup(canvas)
  } else {
    paper.setup([1, 1])
  }
  setupDone = true
  return paper
}

/**
 * Map UI smoothness 0–100 → Paper simplify tolerance.
 * 0  ≈ follow stroke closely (many segments)
 * 50 ≈ Paper default (~2.5)
 * 100 ≈ very smooth / simplified
 * @param {number} smoothness
 * @returns {number}
 */
export const smoothnessToTolerance = (smoothness) => {
  const s = Math.max(0, Math.min(100, Number(smoothness) || 0))
  // 50 ≈ Paper.js default (~2.5); 100 ≈ stronger simplify (~8)
  return Math.max(0.05, (s / 50) * 2.5 * (1 + (s / 100)))
}

/**
 * @param {Array<{x:number,y:number}>|{numberOfItems:number,getItem:Function}} points
 * @param {number} [smoothness=50]
 * @returns {string|null} SVG path `d`, or null if not enough points / failure
 */
export const pointsToSmoothPathD = (points, smoothness = 50) => {
  const list = []
  if (points && typeof points.getItem === 'function' && Number.isFinite(points.numberOfItems)) {
    for (let i = 0; i < points.numberOfItems; i++) {
      const p = points.getItem(i)
      list.push({ x: p.x, y: p.y })
    }
  } else if (Array.isArray(points)) {
    for (const p of points) {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        list.push({ x: p.x, y: p.y })
      }
    }
  }
  if (list.length < 2) return null

  try {
    const p = ensurePaper()
    p.project.clear()
    const path = new p.Path({ insert: false })
    for (const pt of list) {
      path.add(new p.Point(pt.x, pt.y))
    }
    const s = Math.max(0, Math.min(100, Number(smoothness) || 0))
    if (s <= 0) {
      // No fit — keep polyline as line segments
      let d = `M${list[0].x},${list[0].y}`
      for (let i = 1; i < list.length; i++) {
        d += `L${list[i].x},${list[i].y}`
      }
      path.remove()
      return d
    }
    path.simplify(smoothnessToTolerance(s))
    const d = path.pathData
    path.remove()
    return d || null
  } catch (err) {
    console.warn('[paper-smooth] simplify failed, falling back', err)
    return null
  }
}
