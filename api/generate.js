// /api/generate.js
// Serverless proxy that calls the Anthropic API with your private key.
// Browser sends a prompt here; this function adds the API key server-side
// (where it stays secret) and returns the generated endorsement text.

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: restrict to your own domain so other sites can't burn your credits.
  // Set ALLOWED_ORIGINS in Vercel env vars to a comma-separated list, e.g.:
  //   https://endorse-claire.vercel.app,https://kipsi.com
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allowed.length > 0) {
    const origin = req.headers.origin || req.headers.referer || '';
    const ok = allowed.some(o => origin.startsWith(o));
    if (!ok) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }
  }

  // Validate input
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt' });
  }
  if (prompt.length > 4000) {
    return res.status(400).json({ error: 'Prompt too long' });
  }

  // Check API key is configured
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY env var not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        // Haiku is fast + cheap and plenty smart for ~150-char endorsements.
        // Swap for 'claude-sonnet-4-5-20250929' if you want slightly higher quality.
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error('Anthropic API error:', upstream.status, errText);
      return res.status(502).json({ error: 'Upstream API error' });
    }

    const data = await upstream.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    return res.status(200).json({ text });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
