/**
 * Gemini client — calls local Vite proxy (/api/gemini) with a user-pasted API key.
 */

/**
 * Curated generateContent models for SVG chat.
 * Text multimodal only — skips image/video/audio/live/TTS/music/agent specialties.
 * Sources: Gemini API model guide (stable + preview text models).
 */
export const GEMINI_MODELS = [
  // Gemini 3 — stable
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', tier: 'stable', powerful: true },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', tier: 'stable', powerful: true },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', tier: 'stable', powerful: false },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', tier: 'stable', powerful: false },
  // Gemini 3 — preview
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', tier: 'preview', powerful: true },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', tier: 'preview', powerful: true },
  // Gemini 2.5 — stable (still active)
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'stable', powerful: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'stable', powerful: true },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', tier: 'stable', powerful: false },
  // Aliases
  { id: 'gemini-pro-latest', label: 'Gemini Pro (latest alias)', tier: 'alias', powerful: true },
  { id: 'gemini-flash-latest', label: 'Gemini Flash (latest alias)', tier: 'alias', powerful: false }
]

/** Native image generation / editing models (Nano Banana family) */
export const GEMINI_IMAGE_MODELS = [
  { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2', tier: 'stable', powerful: true },
  { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite', tier: 'stable', powerful: false },
  { id: 'gemini-3-pro-image', label: 'Nano Banana Pro', tier: 'stable', powerful: true },
  { id: 'gemini-2.5-flash-image', label: 'Nano Banana', tier: 'stable', powerful: true }
]

/** Shut-down / deprecated ids — migrate saved prefs away from these */
export const RETIRED_GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-image-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-pro-preview',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-pro',
  'gemini-pro-vision'
])

export const DEFAULT_MODEL = GEMINI_MODELS[0].id
export const DEFAULT_IMAGE_MODEL = GEMINI_IMAGE_MODELS[0].id

/** Default models selected for side-by-side compare */
export const DEFAULT_COMPARE_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash'
]

/**
 * Map a saved / requested model id to one that is still offered (text/SVG).
 * @param {string|null|undefined} modelId
 * @returns {string}
 */
export function resolveActiveModel (modelId) {
  const id = String(modelId || '').trim()
  if (id && !RETIRED_GEMINI_MODELS.has(id) && GEMINI_MODELS.some((m) => m.id === id)) {
    return id
  }
  // Allow refresh-listed extras that aren't retired (3.x / 2.5 text models)
  if (id && !RETIRED_GEMINI_MODELS.has(id) && /^gemini-(3|2\.5)/i.test(id) && !/image/i.test(id)) {
    return id
  }
  return DEFAULT_MODEL
}

/**
 * @param {string|null|undefined} modelId
 * @returns {string}
 */
export function resolveImageModel (modelId) {
  const id = String(modelId || '').trim()
  if (id && !RETIRED_GEMINI_MODELS.has(id) && GEMINI_IMAGE_MODELS.some((m) => m.id === id)) {
    return id
  }
  if (id && !RETIRED_GEMINI_MODELS.has(id) && /image/i.test(id) && /^gemini-/i.test(id)) {
    return id
  }
  return DEFAULT_IMAGE_MODEL
}

async function postGemini ({ apiKey, model, contents, systemInstruction, generationConfig, signal }) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      apiKey,
      model,
      contents,
      systemInstruction: systemInstruction
        ? { parts: [{ text: systemInstruction }] }
        : undefined,
      generationConfig
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
  return data
}

/**
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array<{role:string,parts:Array<{text:string}|{inlineData:object}>}>} opts.contents
 * @param {string} [opts.systemInstruction]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>} assistant text
 */
export async function generateGeminiText ({
  apiKey,
  model,
  contents,
  systemInstruction,
  signal
}) {
  const safeModel = resolveActiveModel(model)
  const data = await postGemini({
    apiKey,
    model: safeModel,
    contents,
    systemInstruction,
    signal,
    generationConfig: {
      temperature: 0.45,
      maxOutputTokens: 8192
    }
  })

  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts) || !parts.length) {
    const block = data?.promptFeedback?.blockReason
    throw new Error(block ? `Blocked: ${block}` : 'Empty model response')
  }
  return parts.map((p) => p.text || '').join('')
}

/**
 * Generate a raster image via Nano Banana / Gemini image models.
 * @returns {Promise<{mimeType:string, data:string, dataUrl:string, text:string}>}
 */
export async function generateGeminiImage ({
  apiKey,
  model,
  contents,
  systemInstruction,
  signal,
  aspectRatio = '1:1'
}) {
  const safeModel = resolveImageModel(model)
  const data = await postGemini({
    apiKey,
    model: safeModel,
    contents,
    systemInstruction,
    signal,
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio }
    }
  })

  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts) || !parts.length) {
    const block = data?.promptFeedback?.blockReason
    throw new Error(block ? `Blocked: ${block}` : 'Empty image response')
  }

  let text = ''
  let mimeType = ''
  let b64 = ''
  for (const p of parts) {
    if (p.text) text += p.text
    const inline = p.inlineData || p.inline_data
    if (inline?.data) {
      mimeType = inline.mimeType || inline.mime_type || 'image/png'
      b64 = inline.data
    }
  }
  if (!b64) {
    throw new Error(text
      ? `Model returned text but no image: ${text.slice(0, 200)}`
      : 'No image in model response')
  }
  return {
    mimeType,
    data: b64,
    dataUrl: `data:${mimeType};base64,${b64}`,
    text: text.trim()
  }
}

/**
 * List models that support generateContent (via proxy).
 * @param {string} apiKey
 * @param {{ includeImage?: boolean }} [opts]
 * @returns {Promise<Array<{id:string, displayName?:string}>>}
 */
export async function listGeminiModels (apiKey, opts = {}) {
  const { includeImage = false } = opts
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
    .filter((m) => m.id && !m.id.includes('embedding'))
    .filter((m) => includeImage ? /image/i.test(m.id) : !/image/i.test(m.id))
    .filter((m) => !RETIRED_GEMINI_MODELS.has(m.id))
}

/**
 * Extract first SVG document from model text (fenced or raw).
 * @param {string} text
 * @returns {string|null}
 */
export function extractSvgFromText (text) {
  if (!text) return null
  const fenced = text.match(/```(?:svg)?\s*([\s\S]*?<svg[\s\S]*?<\/svg>)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const raw = text.match(/<svg\b[\s\S]*?<\/svg>/i)
  return raw ? raw[0].trim() : null
}

/**
 * @returns {Promise<Array<{model:string, label:string, ok:boolean, text?:string, svg?:string|null, error?:string, ms:number}>>}
 */
export async function compareGeminiModels ({
  apiKey,
  modelIds,
  contents,
  systemInstruction,
  labelsById = {},
  signal
}) {
  const jobs = modelIds.map(async (model) => {
    const safeModel = resolveActiveModel(model)
    const t0 = performance.now()
    try {
      const text = await generateGeminiText({
        apiKey,
        model: safeModel,
        contents,
        systemInstruction,
        signal
      })
      return {
        model: safeModel,
        label: labelsById[safeModel] || labelsById[model] || safeModel,
        ok: true,
        text,
        svg: extractSvgFromText(text),
        ms: Math.round(performance.now() - t0)
      }
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) {
        return {
          model: safeModel,
          label: labelsById[safeModel] || labelsById[model] || safeModel,
          ok: false,
          error: 'Stopped',
          ms: Math.round(performance.now() - t0)
        }
      }
      return {
        model: safeModel,
        label: labelsById[safeModel] || labelsById[model] || safeModel,
        ok: false,
        error: err?.message || String(err),
        ms: Math.round(performance.now() - t0)
      }
    }
  })
  return Promise.all(jobs)
}
