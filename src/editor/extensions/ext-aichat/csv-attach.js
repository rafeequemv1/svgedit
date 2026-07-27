/**
 * CSV attach helpers for AI chat plotting.
 */

export const MAX_CSV_FILES = 2
export const MAX_CSV_ROWS = 5000
export const MAX_CSV_BYTES = 2_000_000
export const CSV_PREVIEW_ROWS = 12

/**
 * Minimal RFC4180-style CSV parser (quoted fields supported).
 * @param {string} text
 * @returns {{ columns: string[], rows: Record<string, string|number>[] }}
 */
export function parseCsvText (text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
  if (!lines.length) return { columns: [], rows: [] }

  const parseLine = (line) => {
    const out = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (ch === '"') {
          inQ = false
        } else {
          cur += ch
        }
      } else if (ch === '"') {
        inQ = true
      } else if (ch === ',') {
        out.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    out.push(cur.trim())
    return out
  }

  const columns = parseLine(lines[0]).map((c, i) => c || `col_${i + 1}`)
  const rows = []
  for (let li = 1; li < lines.length && rows.length < MAX_CSV_ROWS; li++) {
    const cells = parseLine(lines[li])
    if (!cells.some((c) => c.length)) continue
    const row = {}
    columns.forEach((col, i) => {
      const raw = cells[i] ?? ''
      const num = Number(raw)
      row[col] = raw !== '' && Number.isFinite(num) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw)
        ? num
        : raw
    })
    rows.push(row)
  }
  return { columns, rows }
}

/**
 * @param {File} file
 */
export async function parseCsvFile (file) {
  if (!file) throw new Error('No file')
  if (file.size > MAX_CSV_BYTES) {
    throw new Error(`CSV too large (max ${Math.round(MAX_CSV_BYTES / 1_000_000)} MB)`)
  }
  const text = await file.text()
  const parsed = parseCsvText(text)
  if (!parsed.columns.length || !parsed.rows.length) {
    throw new Error('CSV has no data rows')
  }
  return {
    id: `csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || 'data.csv',
    columns: parsed.columns,
    rows: parsed.rows,
    rowCount: parsed.rows.length
  }
}

/**
 * @param {Array<{name:string,columns:string[],rows:object[],rowCount:number}>} csvFiles
 */
export function formatCsvForPrompt (csvFiles) {
  if (!csvFiles?.length) return ''
  const blocks = csvFiles.map((f) => {
    const preview = f.rows.slice(0, CSV_PREVIEW_ROWS)
    return [
      `File: ${f.name} (${f.rowCount} rows)`,
      `Columns: ${f.columns.join(', ')}`,
      `Preview JSON:`,
      JSON.stringify(preview, null, 0)
    ].join('\n')
  })
  return `\n\n# Attached CSV data (host will inject full rows into your chart spec)\n${blocks.join('\n\n')}\n`
}

/**
 * Primary attached table for plot injection.
 * @param {Array<{rows:object[]}>} csvFiles
 */
export function primaryCsvTable (csvFiles) {
  if (!csvFiles?.length) return null
  return csvFiles[0]
}

/**
 * @param {object} spec
 * @param {{rows:object[]}|null} csv
 */
export function injectCsvIntoVegaSpec (spec, csv) {
  const copy = JSON.parse(JSON.stringify(spec))
  if (!csv?.rows?.length) return copy
  if (!copy.data) copy.data = {}
  if (!copy.data.values || !Array.isArray(copy.data.values) || copy.data.values.length < 2) {
    copy.data.values = csv.rows
  }
  return copy
}

/**
 * @param {DataTransfer|null|undefined} dt
 * @returns {File[]}
 */
export function csvFilesFromDataTransfer (dt) {
  if (!dt?.files?.length) return []
  return [...dt.files].filter((f) => {
    const name = String(f.name || '').toLowerCase()
    return f.type === 'text/csv' || f.type === 'application/vnd.ms-excel' || name.endsWith('.csv')
  })
}
