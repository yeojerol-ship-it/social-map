import { STICKER_IDS } from '../stickers';

const KEY   = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = 'gemini-1.5-flash';
const URL   = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

// ─── Image helpers ────────────────────────────────────────────────────────────

async function imageUrlToBase64(url) {
  const res  = await fetch(url);
  const blob = await res.blob();
  return {
    mimeType: blob.type || 'image/jpeg',
    data:     await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror   = reject;
      reader.readAsDataURL(blob);
    }),
  };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(text, hasImage) {
  return `You are analyzing a social media moment post to pick cute stickers.

Message: "${text}"
${hasImage ? 'An image is attached — analyze its visual content too.' : 'No image attached.'}

Return ONLY a JSON object matching this schema exactly:
{
  "mood": "<one short word describing the emotional mood>",
  "themes": ["<theme1>", "<theme2>"],
  "stickers": ["<id1>", "<id2>", "<id3>"],
  "placement": "${hasImage ? 'around-image' : 'around-bubble'}"
}

Rules:
- stickers must be 2 or 3 IDs chosen ONLY from this list: ${STICKER_IDS.join(', ')}
- pick stickers that feel emotionally relevant and charming for the moment
- do not repeat the same ID
- placement is fixed as shown above`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Calls Gemini to analyze a moment and return structured sticker suggestions.
 * @param {string} text    — moment message text
 * @param {string|null} imageUrl — URL of the moment's first photo, or null
 * @returns {Promise<{mood, themes, stickers, placement}>}
 */
export async function analyzeMoment(text, imageUrl = null) {
  if (!KEY) throw new Error('VITE_GEMINI_API_KEY not set');

  const parts = [];

  // Attach image first (Gemini multimodal: image before text prompt)
  if (imageUrl) {
    try {
      const img = await imageUrlToBase64(imageUrl);
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
    } catch {
      // Image fetch failed — proceed with text only
    }
  }

  parts.push({ text: buildPrompt(text, !!imageUrl) });

  const res = await fetch(URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents:           [{ parts }],
      generationConfig:   { response_mime_type: 'application/json', temperature: 0.4 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const json   = await res.json();
  const raw    = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = JSON.parse(raw);

  // Validate: keep only known IDs, ensure 2–3 stickers
  parsed.stickers = (parsed.stickers ?? [])
    .filter(id => STICKER_IDS.includes(id))
    .slice(0, 3);

  if (parsed.stickers.length < 2) {
    parsed.stickers = ['sparkle', 'star'];
  }

  return parsed;
}
