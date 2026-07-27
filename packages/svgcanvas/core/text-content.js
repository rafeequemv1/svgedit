/**
 * Helpers for reading/writing multiline + styled SVG <text> via <tspan>.
 * Styles are per-character baseline-shift (super / sub).
 * Newlines are separate line-start tspans (x + dy).
 */
import { NS } from './namespaces.js'

const EMPTY_LINE = '\u00A0'
const LINE_DY = '1.2em'
const RICH_PREFIX = '\uFFF9'
const SCRIPT_FONT_SIZE = '0.65em'

/**
 * @param {string|null|undefined} value
 * @returns {'super'|'sub'|'baseline'}
 */
export const normalizeBaselineShift = (value) => {
  if (!value || value === '0' || value === 'baseline') return 'baseline'
  if (value === 'super' || value === 'sub') return value
  const num = parseFloat(value)
  if (!Number.isNaN(num)) {
    if (num > 0) return 'super'
    if (num < 0) return 'sub'
  }
  return 'baseline'
}

/**
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export const isSerializedText = (value) =>
  typeof value === 'string' && value.length > 0 && value.charAt(0) === RICH_PREFIX

/**
 * @param {string} text
 * @param {Array<'super'|'sub'|'baseline'>} styles
 * @returns {string}
 */
export const serializeTextWithStyles = (text, styles) => {
  const s = styles || []
  if (!s.length || s.every(st => st === 'baseline')) return text
  return RICH_PREFIX + JSON.stringify({
    t: text,
    s: s.map(st => (st === 'super' ? '1' : st === 'sub' ? '2' : '0')).join('')
  })
}

/**
 * @param {string} value
 * @returns {{ text: string, styles: Array<'super'|'sub'|'baseline'> }}
 */
export const parseSerializedText = (value) => {
  if (!isSerializedText(value)) {
    const text = value == null ? '' : String(value)
    return { text, styles: Array.from(text, () => 'baseline') }
  }
  try {
    const parsed = JSON.parse(value.slice(1))
    const text = parsed.t ?? ''
    const codes = parsed.s ?? ''
    const styles = Array.from(text, (_, i) => {
      const c = codes[i]
      return c === '1' ? 'super' : c === '2' ? 'sub' : 'baseline'
    })
    return { text, styles }
  } catch (e) {
    const text = value.slice(1)
    return { text, styles: Array.from(text, () => 'baseline') }
  }
}

/**
 * @param {Element|null|undefined} elem
 * @returns {{ text: string, styles: Array<'super'|'sub'|'baseline'> }}
 */
export const getTextAndStyles = (elem) => {
  if (!elem) return { text: '', styles: [] }

  const tspans = []
  for (const child of elem.childNodes) {
    if (child.nodeType === 1 && child.localName === 'tspan') {
      tspans.push(child)
    }
  }

  if (tspans.length === 0) {
    const text = elem.textContent ?? ''
    return { text, styles: Array.from(text, () => 'baseline') }
  }

  const chars = []
  const styles = []
  tspans.forEach((tspan, idx) => {
    const startsLine = idx > 0 && tspan.hasAttribute('x')
    if (startsLine) {
      chars.push('\n')
      styles.push('baseline')
    }
    const raw = tspan.textContent ?? ''
    const content = raw === EMPTY_LINE ? '' : raw
    const shift = normalizeBaselineShift(tspan.getAttribute('baseline-shift'))
    for (const ch of content) {
      chars.push(ch)
      styles.push(shift)
    }
  })

  return { text: chars.join(''), styles }
}

/**
 * @param {Element|null|undefined} elem
 * @returns {string}
 */
export const getTextElementContent = (elem) => getTextAndStyles(elem).text

/**
 * @param {Element|null|undefined} elem
 * @returns {string} Plain text, or rich payload when scripts are present (for undo)
 */
export const serializeTextElement = (elem) => {
  const { text, styles } = getTextAndStyles(elem)
  return serializeTextWithStyles(text, styles)
}

/**
 * Remap per-char styles after a plain-text edit (prefix/suffix preserve).
 * @param {string} oldText
 * @param {Array<'super'|'sub'|'baseline'>} oldStyles
 * @param {string} newText
 * @returns {Array<'super'|'sub'|'baseline'>}
 */
export const remapStyles = (oldText, oldStyles, newText) => {
  if (oldText === newText) {
    return oldStyles.slice(0, newText.length)
  }
  let prefix = 0
  const maxPrefix = Math.min(oldText.length, newText.length)
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) prefix++

  let suffix = 0
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++
  }

  const styles = []
  for (let i = 0; i < newText.length; i++) {
    if (i < prefix) {
      styles[i] = oldStyles[i] || 'baseline'
    } else if (i >= newText.length - suffix) {
      const oldIndex = oldText.length - suffix + (i - (newText.length - suffix))
      styles[i] = oldStyles[oldIndex] || 'baseline'
    } else {
      styles[i] = 'baseline'
    }
  }
  return styles
}

/**
 * @param {string} text
 * @param {'super'|'sub'|'baseline'} style
 * @returns {Element}
 */
const createStyleTspan = (text, style) => {
  const tspan = document.createElementNS(NS.SVG, 'tspan')
  tspan.textContent = text
  if (style === 'super' || style === 'sub') {
    tspan.setAttribute('baseline-shift', style)
    tspan.setAttribute('font-size', SCRIPT_FONT_SIZE)
  }
  return tspan
}

/**
 * @param {Array<{ ch: string, style: 'super'|'sub'|'baseline' }>} lineChars
 * @returns {Array<{ text: string, style: 'super'|'sub'|'baseline' }>}
 */
const groupRuns = (lineChars) => {
  const runs = []
  for (const { ch, style } of lineChars) {
    const last = runs[runs.length - 1]
    if (last && last.style === style) {
      last.text += ch
    } else {
      runs.push({ text: ch, style })
    }
  }
  return runs
}

/**
 * @param {Element} elem
 * @param {string} text
 * @param {Array<'super'|'sub'|'baseline'>} styles
 * @returns {void}
 */
export const setTextWithStyles = (elem, text, styles) => {
  const str = text ?? ''
  const styleArr = styles || Array.from(str, () => 'baseline')

  while (elem.firstChild) {
    elem.removeChild(elem.firstChild)
  }
  // Never shift the whole text element — only per-tspan scripts
  elem.removeAttribute('baseline-shift')

  const lines = []
  let current = []
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '\n') {
      lines.push(current)
      current = []
    } else {
      current.push({ ch: str[i], style: styleArr[i] || 'baseline' })
    }
  }
  lines.push(current)

  const x = elem.getAttribute('x') ?? '0'
  const multi = lines.length > 1
  const hasScript = styleArr.some(s => s === 'super' || s === 'sub')

  if (!multi && !hasScript) {
    elem.textContent = str
    return
  }

  lines.forEach((lineChars, li) => {
    if (lineChars.length === 0) {
      const tspan = createStyleTspan(EMPTY_LINE, 'baseline')
      if (multi) {
        tspan.setAttribute('x', x)
        tspan.setAttribute('dy', li === 0 ? '0' : LINE_DY)
      }
      elem.appendChild(tspan)
      return
    }

    const runs = groupRuns(lineChars)
    runs.forEach((run, ri) => {
      const tspan = createStyleTspan(run.text, run.style)
      if (multi && ri === 0) {
        tspan.setAttribute('x', x)
        tspan.setAttribute('dy', li === 0 ? '0' : LINE_DY)
      }
      elem.appendChild(tspan)
    })
  })
}

/**
 * @param {Element} elem
 * @param {string|null|undefined} value plain or serialized rich text
 * @returns {void}
 */
export const setTextElementContent = (elem, value) => {
  if (isSerializedText(value)) {
    const { text, styles } = parseSerializedText(value)
    setTextWithStyles(elem, text, styles)
    return
  }

  const plain = value == null ? '' : String(value)
  const { text: oldText, styles: oldStyles } = getTextAndStyles(elem)
  const styles = remapStyles(oldText, oldStyles, plain)
  setTextWithStyles(elem, plain, styles)
}

/**
 * Toggle baseline shift on a character range (skips newline slots).
 * @param {Element} elem
 * @param {number} start
 * @param {number} end
 * @param {'super'|'sub'|'baseline'} shift
 * @returns {{ text: string, styles: Array<'super'|'sub'|'baseline'> }}
 */
export const applyBaselineShiftToRange = (elem, start, end, shift) => {
  const { text, styles } = getTextAndStyles(elem)
  const next = styles.slice()
  const normalized = normalizeBaselineShift(shift)
  const from = Math.max(0, Math.min(start, end))
  const to = Math.min(text.length, Math.max(start, end))

  if (normalized === 'baseline') {
    for (let i = from; i < to; i++) {
      if (text[i] !== '\n') next[i] = 'baseline'
    }
  } else {
    let allAlready = true
    for (let i = from; i < to; i++) {
      if (text[i] === '\n') continue
      if (next[i] !== normalized) {
        allAlready = false
        break
      }
    }
    for (let i = from; i < to; i++) {
      if (text[i] === '\n') continue
      next[i] = allAlready ? 'baseline' : normalized
    }
  }

  setTextWithStyles(elem, text, next)
  return { text, styles: next }
}
