#!/usr/bin/env node
/**
 * Generates 3D sticker PNGs via OpenAI gpt-image-1 (transparent bg).
 * Usage:  VITE_OPENAI_API_KEY=sk-... node scripts/generate-stickers.js
 *   or:   node scripts/generate-stickers.js --sticker star
 *
 * Outputs to src/assets/stickers/<name>.png
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = path.join(__dirname, '../src/assets/stickers');

// ─── Sticker subjects ────────────────────────────────────────────────────────
const STICKERS = {
  sparkle:    'a sparkle / glitter burst shape, multi-pointed star sparkle',
  ramen:      'a bowl of steaming Japanese ramen noodles',
  heart:      'a classic red heart',
  paw:        'a cute animal paw print',
  star:       'a classic five-pointed gold star',
  confetti:   'colorful confetti streamers and dots bursting',
  flower:     'a cute blooming flower with pink petals',
  cloud:      'a fluffy white cloud',
  camera:     'a compact digital camera',
  leaf:       'a green autumn leaf',
  binoculars: 'a pair of binoculars',
  boot:       'a yellow rain boot',
  mountain:   'a snow-capped mountain peak',
  coffee:     'a hot coffee cup with steam rising',
  rainbow:    'a rainbow arc with white clouds at each end',
  burger:     'a juicy cheeseburger with sesame bun',
  fries:      'a red paper carton of golden french fries',
  sneaker:    'a colorful athletic sneaker',
  maple:      'a red maple leaf',
  moon:       'a yellow crescent moon',
  zzz:        'three purple floating Z letters meaning sleep',
};

function buildPrompt(subject) {
  return (
    `A single ${subject} as a cute 3D rendered sticker. ` +
    `Glossy shiny plastic material, vibrant saturated colors, chibi / toy-like proportions. ` +
    `Isolated on a transparent background. ` +
    `Thick white outline around the entire shape like a die-cut sticker. ` +
    `Centered in frame, nothing else in the image.`
  );
}

// ─── API call ─────────────────────────────────────────────────────────────────
async function generateSticker(subject, apiKey) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:         'gpt-image-1',
      prompt:        buildPrompt(subject),
      n:             1,
      size:          '1024x1024',
      quality:       'medium',
      background:    'transparent',
      output_format: 'png',
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const json = await res.json();
  const b64  = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`No image data in response: ${JSON.stringify(json)}`);
  return Buffer.from(b64, 'base64');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: set VITE_OPENAI_API_KEY or OPENAI_API_KEY');
    process.exit(1);
  }

  const stickerArg = process.argv.indexOf('--sticker');
  const only = stickerArg !== -1 ? [process.argv[stickerArg + 1]] : Object.keys(STICKERS);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Generating ${only.length} sticker(s) with gpt-image-1...\n`);

  for (const name of only) {
    const subject = STICKERS[name];
    if (!subject) { console.warn(`Unknown sticker: ${name}`); continue; }

    const outPath = path.join(OUT_DIR, `${name}.png`);
    process.stdout.write(`  ${name.padEnd(12)} → `);

    try {
      const buf = await generateSticker(subject, apiKey);
      fs.writeFileSync(outPath, buf);
      console.log(`saved (${Math.round(buf.length / 1024)} KB)`);
    } catch (err) {
      console.error(`FAILED: ${err.message.slice(0, 120)}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
