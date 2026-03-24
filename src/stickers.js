import sparkle     from './assets/stickers/sparkle.png';
import ramen       from './assets/stickers/ramen.png';
import heart       from './assets/stickers/heart.png';
import paw         from './assets/stickers/paw.png';
import star        from './assets/stickers/star.png';
import confetti    from './assets/stickers/confetti.png';
import flower      from './assets/stickers/flower.png';
import cloud       from './assets/stickers/cloud.png';
import camera      from './assets/stickers/camera.png';
import leaf        from './assets/stickers/leaf.png';
import binoculars  from './assets/stickers/binoculars.png';
import boot        from './assets/stickers/boot.png';
import mountain    from './assets/stickers/mountain.png';
import coffee      from './assets/stickers/coffee.png';
import rainbow     from './assets/stickers/rainbow.png';
import burger      from './assets/stickers/burger.png';
import fries       from './assets/stickers/fries.png';
import sneaker     from './assets/stickers/sneaker.png';
import maple       from './assets/stickers/maple.png';
import moon        from './assets/stickers/moon.png';
import zzz         from './assets/stickers/zzz.png';

// ─── Sticker pack ─────────────────────────────────────────────────────────────
export const STICKER_PACK = {
  sparkle, ramen, heart, paw, star,
  confetti, flower, cloud, camera, leaf,
  binoculars, boot, mountain, coffee,
  rainbow, burger, fries, sneaker, maple,
  moon, zzz,
};

export const STICKER_IDS = Object.keys(STICKER_PACK);

// ─── Placement configs ────────────────────────────────────────────────────────
// Positions are left/top px offsets relative to .mc2 (position:relative).
//
// mc2 layout (horizontal flex, 169px tall):
//   avatar-col: 36px wide, margin-right:-2px → content starts at x=34
//   mc2-content: padding-left:6px, centred vertically → content top ≈ y=33
//   Photos frame (2-photo): x≈66–183, y≈33–110  (width≈117, height≈78)
//
// Stickers are centred on each corner: left = corner_x − size/2
const PLACEMENTS = {
  // Two-photo: positions pixel-exact from Figma node 242:7011.
  // Coordinates are relative to .mc2 (position:relative, 169px tall).
  // Slot 2 uses echoOf:0 — same sticker asset as slot 0, rendered smaller.
  'around-image': [
    { x: 162, y:  23, rot:  21.31, size: 40 },             // top-right large
    { x:  46, y:  36, rot:   0,    size: 40 },             // left side
    { x: 169, y:  75, rot:  -3.55, size: 24 },              // bottom-right small
  ],
  // Single-photo: pixel-exact from Figma node 242:7029.
  'around-image-1': [
    { x:  38, y: 19, rot:   0,    size: 40 },  // left side
    { x: 121, y: 68, rot:  -3.55, size: 24 },  // small top-right
  ],
  // No photo: stickers above the bubble (bubble ≈ y:74–108 in 149px-tall card).
  'around-bubble': [
    { x: 136, y: 34, rot: -14 },
    { x:  38, y: 34, rot:  14 },
  ],
};

// ─── Deterministic fallback ───────────────────────────────────────────────────
const THEME_MAP = {
  dog:     ['paw',        'heart',      'sparkle'],
  food:    ['burger',     'fries',      'sparkle'],
  ramen:   ['ramen',      'sparkle',    'star'],
  cafe:    ['coffee',     'heart',      'sparkle'],
  sunset:  ['rainbow',    'cloud',      'sparkle'],
  view:    ['binoculars', 'mountain',   'sparkle'],
  hiking:  ['sneaker',    'mountain',   'maple'],
  nature:  ['maple',      'leaf',       'rainbow'],
  outdoor: ['sneaker',    'maple',      'leaf'],
  lucky:   ['star',       'confetti',   'sparkle'],
  photo:   ['camera',     'sparkle',    'star'],
  sleep:   ['moon',       'zzz',        'star'],
  night:   ['moon',       'star',       'cloud'],
  default: ['sparkle',    'star',       'heart'],
};

function detectTheme(text) {
  const t = text.toLowerCase();
  if (/睡|困|累|晚安|好梦|做梦|zzz|sleepy|tired|goodnight|night|nite/.test(t)) return 'sleep';
  if (/夜|星空|深夜|夜晚|月亮|moon|star.*night|night.*star/.test(t))           return 'night';
  if (/狗|dog|pet|paw|woof/.test(t))                   return 'dog';
  if (/咖啡|cafe|coffee|拿铁|latte/.test(t))           return 'cafe';
  if (/面|ramen|拉面|noodle/.test(t))                  return 'ramen';
  if (/饭|burger|汉堡|fries|薯条|food|eat|吃|寿司|sushi/.test(t)) return 'food';
  if (/夕阳|sunset|rainbow|彩虹|sky|日落/.test(t))     return 'sunset';
  if (/风景|view|panorama|俯瞰|看/.test(t))            return 'view';
  if (/爬山|hiking|hike|trail|徒步/.test(t))           return 'hiking';
  if (/鞋|shoe|sneaker|运动|跑/.test(t))               return 'outdoor';
  if (/自然|nature|forest|树|山|富士/.test(t))         return 'nature';
  if (/踩雷|lucky|幸运|发现/.test(t))                  return 'lucky';
  if (/拍|camera|photo|照片/.test(t))                  return 'photo';
  return 'default';
}

// ─── Per-sticker size overrides ───────────────────────────────────────────────
// Some sticker PNGs have extra whitespace, making them look smaller at 34px.
// Override their rendered size so they appear visually consistent with others.
const STICKER_SIZE_OVERRIDES = {
  flower: 37,
  paw:    37,
};

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Zips sticker IDs with placement positions → [{src, x, y, rot, size?}] */
export function getStickerLayout(stickerIds, placement, photoCount = 2) {
  // Remap around-image to single-photo variant when only 1 photo
  const key = placement === 'around-image' && photoCount === 1
    ? 'around-image-1'
    : placement;
  const positions = PLACEMENTS[key] || PLACEMENTS['around-bubble'];
  const filtered = [...new Set(stickerIds)].filter(id => STICKER_PACK[id]);
  return positions
    .map((pos, i) => {
      // echoOf: reuse the same sticker asset as another slot (echo/shadow effect)
      const id = pos.echoOf !== undefined ? filtered[pos.echoOf] : filtered[i];
      if (!id || !STICKER_PACK[id]) return null;
      // Position-level size takes priority; STICKER_SIZE_OVERRIDES only applies
      // when the placement has no explicit size (e.g. around-bubble at 30px default).
      const sizeOverride = pos.size ? {} : STICKER_SIZE_OVERRIDES[id] ? { size: STICKER_SIZE_OVERRIDES[id] } : {};
      return { src: STICKER_PACK[id], ...pos, ...sizeOverride };
    })
    .filter(Boolean);
}

/** Fallback layout when OpenAI is unavailable */
export function getFallbackLayout(text, photoCount = 0) {
  const ids       = THEME_MAP[detectTheme(text)];
  const placement = photoCount > 0 ? 'around-image' : 'around-bubble';
  return getStickerLayout(ids, placement, photoCount);
}
