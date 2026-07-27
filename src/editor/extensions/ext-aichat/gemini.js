/**
 * Gemini client — calls local Vite proxy (/api/gemini) with a user-pasted API key.
 */

/** Curated active Gemini models (generateContent). Latest / powerful first. */
export const GEMINI_MODELS = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', tier: 'latest', powerful: true },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', tier: 'latest', powerful: true },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', tier: 'latest', powerful: true },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', tier: 'latest', powerful: true },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'stable', powerful: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'stable', powerful: true },
  { id: 'gemini-pro-latest', label: 'Gemini Pro (latest alias)', tier: 'alias', powerful: true },
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest alias)', tier: 'alias', powerful: false },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'stable', powerful: false },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', tier: 'stable', powerful: false }
]

/** Default models selected for side-by-side compare */
export const DEFAULT_COMPARE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview'
]

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array<{role:string,parts:Array<{text:string}>}>} opts.contents
 * @param {string} [opts.systemInstruction]
 * @returns {Promise<string>} assistant text
 */
export async function generateGeminiText ({
  apiKey,
  model,
  contents,
  systemInstruction
}) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model,
      contents,
      systemInstruction: systemInstruction
        ? { parts: [{ text: systemInstruction }] }
        : undefined,
      generationConfig: {
        temperature: 0.45,
        maxOutputTokens: 8192
      }
    })
  })

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error(`Gemini returned non-JSON (HTTP ${res.status})`)
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }

  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts) || !parts.length) {
    const block = data?.promptFeedback?.blockReason
    throw new Error(block ? `Blocked: ${block}` : 'Empty model response')
  }
  return parts.map((p) => p.text || '').join('')
}

/**
 * List models that support generateContent (via proxy).
 * @param {string} apiKey
 * @returns {Promise<Array<{id:string, displayName?:string}>>}
 */
export async function listGeminiModels (apiKey) {
  const res = await fetch('/api/gemini/models', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey })
  })
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error(`Could not list models (HTTP ${res.status})`)
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  const models = Array.isArray(data.models) ? data.models : []
  return models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({
      id: String(m.name || '').replace(/^models\//, ''),
      displayName: m.displayName || m.name
    }))
    .filter((m) => m.id && !m.id.includes('embedding') && !m.id.includes('image'))
}

/**
 * Pull the first SVG document out of a model reply.
 * @param {string} text
 * @returns {string|null}
 */
export function extractSvgFromText (text) {
  if (!text || typeof text !== 'string') return null
  const fenced = text.match(/```(?:svg|xml)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.search(/<svg\b/i)
  if (start < 0) return null
  const end = candidate.toLowerCase().lastIndexOf('</svg>')
  if (end < 0) return null
  return candidate.slice(start, end + 6).trim()
}

/**
 * Run the same prompt against several models in parallel.
 * @returns {Promise<Array<{model:string, label:string, ok:boolean, text?:string, svg?:string|null, error?:string, ms:number}>>}
 */
export async function compareGeminiModels ({
  apiKey,
  modelIds,
  contents,
  systemInstruction,
  labelsById = {}
}) {
  const jobs = modelIds.map(async (model) => {
    const t0 = performance.now()
    try {
      const text = await generateGeminiText({
        apiKey,
        model,
        contents,
        systemInstruction
      })
      return {
        model,
        label: labelsById[model] || model,
        ok: true,
        text,
        svg: extractSvgFromText(text),
        ms: Math.round(performance.now() - t0)
      }
    } catch (err) {
      return {
        model,
        label: labelsById[model] || model,
        ok: false,
        error: err?.message || String(err),
        ms: Math.round(performance.now() - t0)
      }
    }
  })
  return Promise.all(jobs)
}
