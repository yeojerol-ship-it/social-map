import { STICKER_IDS } from '../stickers';

const KEY     = import.meta.env.VITE_OPENAI_API_KEY;
const MODEL   = 'gpt-4o';
const API_URL = 'https://api.openai.com/v1/chat/completions';

// ─── Image helper ─────────────────────────────────────────────────────────────
// GPT-4o vision accepts full data URLs in image_url.url
async function imageUrlToDataUrl(url) {
  const res  = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader    = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
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
export async function analyzeMoment(text, imageUrl = null) {
  if (!KEY) throw new Error('VITE_OPENAI_API_KEY not set');

  const content = [];

  if (imageUrl) {
    try {
      const dataUrl = await imageUrlToDataUrl(imageUrl);
      content.push({ type: 'image_url', image_url: { url: dataUrl, detail: 'low' } });
    } catch {
      // Image fetch failed — proceed text-only
    }
  }

  content.push({ type: 'text', text: buildPrompt(text, !!imageUrl) });

  const res = await fetch(API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model:           MODEL,
      messages:        [{ role: 'user', content }],
      response_format: { type: 'json_object' },
      temperature:     0.4,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);

  const json   = await res.json();
  const raw    = json.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);

  parsed.stickers = (parsed.stickers ?? [])
    .filter(id => STICKER_IDS.includes(id))
    .slice(0, 3);

  if (parsed.stickers.length < 2) parsed.stickers = ['sparkle', 'star'];

  return parsed;
}
