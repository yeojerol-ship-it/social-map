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
// Positions are left/top offsets (px) relative to the .mc2 element.
// mc2 layout: avatar-col ~44px wide (margin-right:-2px) → content starts at x≈42.
// Photos centered in 160px column → stacked pair spans x≈63–x≈181, y≈0–78.
// Stickers (40×40px) are placed at the photo-stack corners where image content
// is sparse (due to rotation), so they frame rather than cover the photos.
const PLACEMENTS = {
  // Two-photo layout: stacked pair spans x≈63–181, y≈0–78.
  'around-image': [
    { x: 148, y:  -8, rot:  16 }, // top-right — right photo's top-right corner
    { x:  60, y:  10, rot: -18 }, // top-left  — left photo's top-left corner
    { x: 155, y:  50, rot:  -8, size: 30 }, // bottom-right — slightly smaller
  ],
  // Single-photo layout: 2 stickers only — top-left and bottom-right.
  'around-image-1': [
    { x:  58, y:  10, rot: -18 }, // top-left
    { x: 130, y:  50, rot:  -8, size: 30 }, // bottom-right
  ],
  'around-bubble': [
    { x: 152, y: 66, rot: -14 }, // right of bubble
    { x:  20, y: 60, rot:  14 }, // left of bubble
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

// ─── Public helpers ───────────────────────────────────────────────────────────

/** Zips sticker IDs with placement positions → [{src, x, y, rot}] */
export function getStickerLayout(stickerIds, placement, photoCount = 2) {
  // Remap around-image to single-photo variant when only 1 photo
  const key = placement === 'around-image' && photoCount === 1
    ? 'around-image-1'
    : placement;
  const positions = PLACEMENTS[key] || PLACEMENTS['around-bubble'];
  return stickerIds
    .filter(id => STICKER_PACK[id])
    .slice(0, positions.length)
    .map((id, i) => ({ src: STICKER_PACK[id], ...positions[i] }));
}

/** Fallback layout when OpenAI is unavailable */
export function getFallbackLayout(text, photoCount = 0) {
  const ids       = THEME_MAP[detectTheme(text)];
  const placement = photoCount > 0 ? 'around-image' : 'around-bubble';
  return getStickerLayout(ids, placement, photoCount);
}
