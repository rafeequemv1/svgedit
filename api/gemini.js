/**
 * Vercel serverless: proxy Gemini generateContent (CORS + keep key client-side hop only).
 */
export default async function handler (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const apiKey = String(body.apiKey || '').trim()
    const model = String(body.model || 'gemini-2.5-flash').trim()
    if (!apiKey) {
      res.status(400).json({ error: 'Missing API key' })
      return
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
      res.status(400).json({ error: 'Invalid model id' })
      return
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
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json')
    res.send(text)
  } catch (err) {
    res.status(502).json({ error: err?.message || 'Gemini proxy failed' })
  }
}
