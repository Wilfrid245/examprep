// api/generate.js
import { GoogleAuth } from 'google-auth-library';

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { subject = 'Physics', numQuestions = 10 } = req.body || {};

    // Load service account JSON from env (supports raw JSON or base64)
    let keyJson;
    const raw = process.env.SERVICE_ACCOUNT_KEY || process.env.SERVICE_ACCOUNT_KEY_BASE64;
    if (!raw) throw new Error('Service account key not configured in environment');

    try {
      keyJson = JSON.parse(raw);
    } catch (e) {
      // try base64 decode
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      keyJson = JSON.parse(decoded);
    }

    const auth = new GoogleAuth({
      credentials: keyJson,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse?.token;
    if (!accessToken) throw new Error('Failed to obtain access token');

    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

    const promptText = `You are an expert Rwanda National Examination (REB) examiner.
TASK: Generate a ${numQuestions}-question practice test for Senior 6 PCM ${subject}.
STYLE: Official Competence-Based Curriculum (CBC) format.
OUTPUT: ONLY clean HTML using Tailwind CSS classes.
- Use 'text-slate-900' for text.
- Use 'border-slate-200' for table borders or lines.
- Include sections for "Student Name" and "Index Number".
- DO NOT include markdown code blocks (\`\`\`html).`;

    const body = {
      contents: [{
        parts: [{ text: promptText }]
      }]
    };

    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });

    const apiResp = await r.json();
    if (!r.ok) {
      const message = apiResp.error?.message || JSON.stringify(apiResp);
      return res.status(500).json({ error: message });
    }

    // Extract the model output safely. The exact path may vary; adjust if needed.
    const candidate = apiResp?.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';

    // Basic sanitization: remove triple backticks and trim
    const html = content.replace(/```html|```/gi, '').trim();

    // Return only the HTML string to the client
    return res.status(200).json({ html });

  } catch (err) {
    console.error('generate error', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
