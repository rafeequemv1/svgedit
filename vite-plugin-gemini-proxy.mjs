/**
 * Vite middleware: proxy Gemini generateContent / listModels (avoids browser CORS).
 */
async function readJsonBody (req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function sendJson (res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(payload))
}

function corsPreflight (res) {
  res.statusCode = 204
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end()
}

async function listModelsHandler (req, res) {
  if (req.method === 'OPTIONS') return corsPreflight(res)
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
  try {
    const body = await readJsonBody(req)
    const apiKey = String(body.apiKey || '').trim()
    if (!apiKey) return sendJson(res, 400, { error: 'Missing API key' })

    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
      { headers: { 'x-goog-api-key': apiKey } }
    )
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(text)
  } catch (err) {
    sendJson(res, 502, { error: err?.message || 'List models failed' })
  }
}

async function generateHandler (req, res) {
  if (req.method === 'OPTIONS') return corsPreflight(res)
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  try {
    const body = await readJsonBody(req)
    const apiKey = String(body.apiKey || '').trim()
    const model = String(body.model || 'gemini-3.6-flash').trim()
    if (!apiKey) return sendJson(res, 400, { error: 'Missing API key' })
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
      return sendJson(res, 400, { error: 'Invalid model id' })
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: body.contents || [],
        systemInstruction: body.systemInstruction,
        generationConfig: body.generationConfig || {
          temperature: 0.4,
          maxOutputTokens: 8192
        }
      })
    })

    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(text)
  } catch (err) {
    sendJson(res, 502, { error: err?.message || 'Gemini proxy failed' })
  }
}

export function geminiProxyPlugin () {
  const attach = (middlewares) => {
    middlewares.use('/api/gemini/models', listModelsHandler)
    middlewares.use('/api/gemini', generateHandler)
  }

  return {
    name: 'svgedit-gemini-proxy',
    configureServer (server) {
      attach(server.middlewares)
    },
    configurePreviewServer (server) {
      attach(server.middlewares)
    }
  }
}
