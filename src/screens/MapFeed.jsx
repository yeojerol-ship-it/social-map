/**
 * MapFeed — Mapbox GL JS map with atomic moment markers and screen-space clustering.
 *
 * Architecture:
 *   A Moment is a single data object with one geographic anchor (lngLat).
 *   It is rendered as one DOM element containing all its sub-elements
 *   (photos, stickers, avatar, bubble). That element is attached to one
 *   mapboxgl.Marker. The marker moves as one unit when the map pans/zooms.
 *   Sub-elements are NEVER separate markers — they are children of the moment's
 *   root element and are positioned relative to it, not to the map.
 *
 * Clustering:
 *   screenSpaceCluster() receives one entry per moment and groups them by
 *   pixel proximity on the current viewport. It never sees sub-elements.
 *   Groups of 1 → show full moment card.
 *   Groups of 2+ → show compact cluster (overlapping avatars + count).
 */

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAP_MAIN,
  FEED_ME,
  USER_AVATAR_REC,
  M1_P1, M1_P2,
  M2_P1, M2_P2,
  M3_P1, M3_P2,
  M4_P1, M4_P2,
  A1_AVT, A2_AVT, A3_AVT, A4_AVT,
  A5_AVT, A6_AVT, A7_AVT, A8_AVT,
  NP1, NP2, NP3, NP4, NP5, NP6, NP7, NP8,
} from '../assets';
import { analyzeMoment }              from '../services/openai';
import { getStickerLayout, getFallbackLayout } from '../stickers';

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN          = import.meta.env.VITE_MAPBOX_TOKEN;
const DEFAULT_CENTER = [103.8198, 1.3521]; // Singapore [lng, lat]
const DEFAULT_ZOOM   = 14;
const CLUSTER_RADIUS = 150; // px — must be > card width (~160px anchor-to-edge)
                             // so overlapping cards always cluster before they visually collide

// ─── Moment definitions ───────────────────────────────────────────────────────
// Each entry is one complete moment. lngLat is computed from user position +
// offset when the map initialises. All visual parts belong to this one object.
// Coordinate math — zoom 14, CLUSTER_RADIUS 150px ≈ 0.0065° at zoom 14
//   (1° ≈ 23 268 px at z14 for Singapore lat ≈ 1.35°)
//
// Cluster pairs:  ~0.0028° apart  → ~65 px at z14  → cluster  ✓
//                                  → ~260 px at z16 → separate ✓  (fitBounds zooms to ~z17)
// Singles:        >0.0072° from every other moment  → >167 px  → never cluster at z14 ✓
//                  card width 160px, singles 167 px+ apart      → no card overlap ✓
const MOMENT_TEMPLATES = [
  // ── Cluster A: food / restaurant pair ──
  { id: 1, dlat:  0.0030, dlng:  0.0020, photos: [NP3, NP4],       avatar: A2_AVT, text: '师傅做的寿司太绝了',     time: '45m ago' },
  { id: 2, dlat:  0.0050, dlng:  0.0040, photos: [NP7, NP8],       avatar: A4_AVT, text: '鲷鱼烧排队值了！',       time: '3h ago'  },
  // ── Cluster B: nature / outdoor pair ──
  { id: 3, dlat: -0.0030, dlng: -0.0020, photos: [NP1, NP2],       avatar: A1_AVT, text: '今天爬山视野绝了',       time: '2h ago'  },
  { id: 4, dlat: -0.0050, dlng: -0.0040, photos: [NP5, NP6],       avatar: A3_AVT, text: '富士山脚下喝咖啡',       time: '1h ago'  },
  // ── Near-centre singles ──
  { id: 5, dlat:  0.0130, dlng:  0.0000, photos: [M1_P1, M1_P2],   avatar: A5_AVT, text: '谁家的狗太可爱了',       time: '30m ago' },
  { id: 7, dlat: -0.0020, dlng:  0.0072, photos: [M3_P1, M3_P2],   avatar: A7_AVT, text: '今天的拉面真的绝了',     time: '20m ago' },
  { id: 8, dlat:  0.0020, dlng: -0.0072, photos: [M4_P1, M4_P2],   avatar: A8_AVT, text: '刚跑完步，应该吃什么呢', time: '4h ago'  },
  // ── Singapore-wide moments ──
  { id:  9, dlat: -0.047, dlng:  0.012, photos: [NP3, NP4],         avatar: A1_AVT, text: '乌节路今天好多人啊',     time: '8m ago'  },
  { id: 10, dlat: -0.068, dlng:  0.041, photos: [M2_P1, M2_P2],     avatar: A2_AVT, text: '滨海湾夜景绝了',         time: '18m ago' },
  { id: 11, dlat: -0.063, dlng:  0.026, photos: [NP7, NP8],         avatar: A3_AVT, text: '克拉码头今晚超热闹',     time: '33m ago' },
  { id: 12, dlat: -0.103, dlng:  0.011, photos: [NP5, NP6],         avatar: A4_AVT, text: '圣淘沙阳光正好',         time: '1h ago'  },
  { id: 13, dlat: -0.038, dlng: -0.004, photos: [NP1, NP2],         avatar: A5_AVT, text: '植物园散步好治愈',       time: '1h ago'  },
  { id: 14, dlat: -0.019, dlng: -0.078, photos: [M4_P1, M4_P2],     avatar: A6_AVT, text: '裕廊湖边慢跑中',         time: '2h ago'  },
  { id: 15, dlat:  0.002, dlng:  0.122, photos: [NP3, NP4],         avatar: A7_AVT, text: '淡滨尼咖啡好喝',         time: '40m ago' },
  { id: 16, dlat:  0.079, dlng: -0.033, photos: [M3_P1, M3_P2],     avatar: A8_AVT, text: '兀兰今天好清静',         time: '3h ago'  },
  { id: 17, dlat:  0.007, dlng:  0.170, photos: [NP1],               avatar: A1_AVT, text: '樟宜海边风很大',         time: '12m ago' },
  { id: 18, dlat: -0.042, dlng: -0.012, photos: [NP5, NP6],         avatar: A2_AVT, text: '登普西周末市集',         time: '4h ago'  },
  { id: 19, dlat: -0.052, dlng:  0.089, photos: [M1_P1, M1_P2],     avatar: A3_AVT, text: '东海岸骑行回来了',       time: '50m ago' },
  { id: 20, dlat: -0.046, dlng:  0.032, photos: [NP7, NP8],         avatar: A4_AVT, text: '小印度颜色好鲜艳',       time: '1h ago'  },
  { id: 21, dlat: -0.020, dlng:  0.031, photos: [NP1, NP2],         avatar: A5_AVT, text: '大巴窑茶餐厅早餐',       time: '25m ago' },
  { id: 22, dlat: -0.058, dlng: -0.034, photos: [M2_P1, M2_P2],     avatar: A6_AVT, text: '女皇镇老派咖啡店',       time: '2h ago'  },
  { id: 23, dlat: -0.041, dlng: -0.024, photos: [NP3, NP4],         avatar: A7_AVT, text: '荷兰村逛街真舒服',       time: '35m ago' },
  { id: 24, dlat:  0.021, dlng:  0.130, photos: [NP5, NP6],         avatar: A8_AVT, text: '白沙公园放风筝！',       time: '6h ago'  },
  { id: 25, dlat:  0.046, dlng:  0.078, photos: [NP7],               avatar: A1_AVT, text: '榜鹅水边傍晚散步',       time: '1h ago'  },
  { id: 26, dlat:  0.017, dlng:  0.030, photos: [M4_P1, M4_P2],     avatar: A2_AVT, text: '宏茂桥公园的清晨',       time: '8h ago'  },
  { id: 27, dlat: -0.055, dlng:  0.008, photos: [NP1, NP2],         avatar: A3_AVT, text: '牛车水米其林小吃',       time: '1h ago'  },
  { id: 28, dlat: -0.034, dlng:  0.027, photos: [M3_P1],             avatar: A4_AVT, text: '武吉士街头随拍',         time: '45m ago' },
];

// ─── Map style layers to hide ─────────────────────────────────────────────────
const HIDDEN_LAYERS = [
  'poi-label', 'road-label', 'road-number-shield', 'road-exit-shield',
  'transit-label', 'airport-label', 'waterway-label', 'natural-point-label',
  'settlement-label', 'settlement-subdivision-label', 'state-label', 'country-label',
];

// ─── Screen-space clustering ──────────────────────────────────────────────────
// Input: array of { lngLat } (one entry per whole moment).
// Output: groups of indices, e.g. [[0,1],[2],[3]].
// Only lngLat is used — sub-elements are invisible to this function.
function screenSpaceCluster(map, moments, radius) {
  const px      = moments.map(({ lngLat }) => map.project(lngLat));
  const visited = new Set();
  const groups  = [];

  moments.forEach((_, i) => {
    if (visited.has(i)) return;
    visited.add(i);
    const group = [i];

    moments.forEach((_, j) => {
      if (visited.has(j)) return;
      const dx = px[i].x - px[j].x;
      const dy = px[i].y - px[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < radius) {
        group.push(j);
        visited.add(j);
      }
    });

    groups.push(group);
  });

  return groups;
}

// ─── Sticker injection ────────────────────────────────────────────────────────
// Stickers are injected into an existing .mc2 element after Gemini responds.
// They are absolutely positioned children of .mc2 (position:relative) so they
// travel with the moment as one atomic marker — never separate map items.
function injectStickers(el, layout) {
  const mc2 = el.querySelector('.mc2');
  if (!mc2) return;
  mc2.querySelectorAll('.mc2-sticker--ai').forEach(s => s.remove());
  layout.forEach(({ src, x, y, rot, size }) => {
    const div = document.createElement('div');
    div.className = 'mc2-sticker mc2-sticker--ai';
    div.style.cssText = `left:${x}px;top:${y}px;transform:rotate(${rot}deg)`;
    const sizeStyle = size ? `width:${size}px;height:${size}px;` : '';
    div.innerHTML = `<img src="${src}" alt="" class="mc2-sticker-img" style="${sizeStyle}"/>`;
    mc2.appendChild(div);
  });
}

// ─── Tap-to-like: sporadic stickers around the card (accumulates with repeat taps) ───
const REACTION_HOLD_MS   = 2000;
const REACTION_FADE_MS   = 450;

function settleReactionSticker(mc2, { src, x, y, size, rot }) {
  const div = document.createElement('div');
  div.className = 'mc2-sticker mc2-sticker--reaction';
  div.style.cssText = [
    `left:${x}px`,
    `top:${y}px`,
    `transform:rotate(${rot}deg) scale(0.78)`,
    'z-index:5',
    'opacity:0',
    'transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1), opacity 0.16s ease-out',
    'will-change:transform,opacity',
  ].join(';');

  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.className = 'mc2-sticker-img';
  img.style.width = `${size}px`;
  img.style.height = `${size}px`;
  img.draggable = false;
  div.appendChild(img);
  mc2.appendChild(div);

  requestAnimationFrame(() => {
    div.style.opacity = '1';
    div.style.transform = `rotate(${rot}deg) scale(1)`;
  });

  window.setTimeout(() => {
    div.style.willChange = 'opacity';
    div.style.transition = `opacity ${REACTION_FADE_MS}ms ease-out`;
    requestAnimationFrame(() => { div.style.opacity = '0'; });
    const remove = () => { div.remove(); };
    div.addEventListener('transitionend', remove, { once: true });
    window.setTimeout(remove, REACTION_FADE_MS + 80);
  }, REACTION_HOLD_MS);
}

function spawnReactionBurst(mc2) {
  const now = performance.now();
  const lastTapAt = mc2._lastReactionTapAt || 0;
  const isDoubleTap = now - lastTapAt < 280;
  mc2._lastReactionTapAt = now;

  const momentStickerSources = Array.from(
    mc2.querySelectorAll('.mc2-sticker--ai .mc2-sticker-img')
  )
    .map((img) => img.getAttribute('src'))
    .filter(Boolean);

  // Use only the stickers currently shown on this moment.
  if (momentStickerSources.length === 0) return;

  const w = mc2.offsetWidth || 200;
  const h = mc2.offsetHeight || 169;
  const cx = w / 2;
  const cy = h / 2;
  mc2._reactionClicks = (mc2._reactionClicks || 0) + 1;
  const count = isDoubleTap ? 2 : 2 + Math.min(mc2._reactionClicks, 10);
  const rMax = Math.min(w, h) * 0.42;
  const screenStartX = window.innerWidth / 2;
  const screenStartY = window.innerHeight + 30;
  const mc2Rect = mc2.getBoundingClientRect();
  const flyMs = 560;

  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 28 + Math.random() * rMax;
    const x = cx + Math.cos(ang) * r - 15;
    const y = cy + Math.sin(ang) * r - 15;
    const rot = (Math.random() - 0.5) * 56;
    const size = Math.round(22 + Math.random() * 14);
    const src = momentStickerSources[(Math.random() * momentStickerSources.length) | 0];
    const delay = i * 140 + ((Math.random() * 40) | 0); // one-by-one

    const targetX = mc2Rect.left + x + size / 2;
    const targetY = mc2Rect.top + y + size / 2;
    const apexX = (screenStartX + targetX) / 2 + (Math.random() - 0.5) * 70;
    const apexY = Math.min(screenStartY, targetY) - (170 + Math.random() * 120);

    window.setTimeout(() => {
      const fly = document.createElement('img');
      fly.src = src;
      fly.alt = '';
      fly.draggable = false;
      fly.className = 'mc2-sticker-img';
      fly.style.cssText = [
        'position:fixed',
        'left:0',
        'top:0',
        `width:${size}px`,
        `height:${size}px`,
        'z-index:10020',
        'pointer-events:none',
        'opacity:0',
        'will-change:transform,opacity',
      ].join(';');
      document.body.appendChild(fly);

      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / flyMs);
        const u = 1 - t;
        const px = u * u * screenStartX + 2 * u * t * apexX + t * t * targetX;
        const py = u * u * screenStartY + 2 * u * t * apexY + t * t * targetY;
        // Start larger at launch, then shrink down as it reaches the moment.
        const sc = 1.42 - 0.42 * t;
        const rNow = rot * t;
        fly.style.opacity = t < 0.05 ? `${t / 0.05}` : '1';
        fly.style.transform = `translate(${px - size / 2}px, ${py - size / 2}px) rotate(${rNow}deg) scale(${sc})`;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          fly.remove();
          settleReactionSticker(mc2, { src, x, y, size, rot });
        }
      };
      requestAnimationFrame(step);
    }, delay);
  }
}

/** Disable map pan/zoom while peeling a photo so the gesture does not fight the marker. */
function suppressMapPanForPhotoGesture(map) {
  if (!map) return () => {};
  try { map.dragPan.disable(); } catch (_) {}
  try { map.scrollZoom.disable(); } catch (_) {}
  try { map.touchZoomRotate.disable(); } catch (_) {}
  try { map.doubleClickZoom.disable(); } catch (_) {}
  return () => {
    try { map.dragPan.enable(); } catch (_) {}
    try { map.scrollZoom.enable(); } catch (_) {}
    try { map.touchZoomRotate.enable(); } catch (_) {}
    try { map.doubleClickZoom.enable(); } catch (_) {}
  };
}

// ─── Photo peel: drag like MomentViewer; release snaps back into the card ───
// Require a more intentional movement before peeling a photo out.
// This keeps simple taps on an image as "like/projectile" interactions.
const PHOTO_DRAG_THRESHOLD = 18;

function setupMapPhotoDrag(mc2, map) {
  const slots = [
    { innerSel: '.mc2-p1-inner', imgSel: '.mc2-p1-img', rot: -12 },
    { innerSel: '.mc2-p2-inner', imgSel: '.mc2-p2-img', rot: 10.12 },
    { innerSel: '.mc2-p-single-inner', imgSel: '.mc2-p-single-img', rot: 4 },
  ];

  for (const { innerSel, imgSel, rot } of slots) {
    const inner = mc2.querySelector(innerSel);
    const img = mc2.querySelector(imgSel);
    if (!inner || !img || inner._mapPhotoDragBound) continue;
    inner._mapPhotoDragBound = true;
    inner.style.touchAction = 'none';
    inner.style.cursor = 'grab';

    inner.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      const restoreMap = suppressMapPanForPhotoGesture(map);

      const startX = e.clientX;
      const startY = e.clientY;
      let floatEl = null;
      let rw = 0;
      let rh = 0;
      let ended = false;

      const onMove = (ev) => {
        if (!floatEl) {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (dx * dx + dy * dy < PHOTO_DRAG_THRESHOLD * PHOTO_DRAG_THRESHOLD) return;
          const br = img.getBoundingClientRect();
          rw = br.width;
          rh = br.height;
          floatEl = document.createElement('img');
          floatEl.src = img.src;
          floatEl.draggable = false;
          floatEl.style.cssText = [
            'position:fixed',
            `left:${ev.clientX - rw / 2}px`,
            `top:${ev.clientY - rh / 2}px`,
            `width:${rw}px`,
            `height:${rh}px`,
            'object-fit:cover',
            'border-radius:12px',
            'border:2px solid #f6f4ea',
            'box-shadow:0 8px 28px rgba(0,0,0,0.28)',
            'z-index:10000',
            'pointer-events:none',
            `transform:rotate(${rot}deg)`,
            'transition:none',
          ].join(';');
          document.body.appendChild(floatEl);
        } else {
          floatEl.style.left = `${ev.clientX - rw / 2}px`;
          floatEl.style.top = `${ev.clientY - rh / 2}px`;
        }
      };

      const cleanUp = (ev) => {
        if (ended) return;
        ended = true;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        restoreMap();
        try { inner.releasePointerCapture(ev.pointerId); } catch (_) {}

        if (floatEl) {
          const target = img.getBoundingClientRect();
          floatEl.style.transition = 'left 0.34s cubic-bezier(0.34,1.56,0.64,1), top 0.34s cubic-bezier(0.34,1.56,0.64,1)';
          floatEl.style.left = `${target.left}px`;
          floatEl.style.top = `${target.top}px`;

          let finished = false;
          const finish = () => {
            if (finished) return;
            finished = true;
            floatEl.remove();
          };
          floatEl.addEventListener('transitionend', finish, { once: true });
          setTimeout(finish, 420);
        } else {
          spawnReactionBurst(mc2);
        }
      };

      const onUp = (ev) => cleanUp(ev);

      inner.setPointerCapture(e.pointerId);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  }
}

function bindMomentTapAndDrag(el, map) {
  const mc2 = el.querySelector('.mc2');
  if (!mc2 || mc2._momentTapBound) return;
  mc2._momentTapBound = true;
  mc2.style.pointerEvents = 'auto';
  mc2.style.cursor = 'pointer';
  // Allow native map drag/pan when the user is actually moving.
  // We still handle clicks / photo peel separately.
  mc2.style.touchAction = 'auto';

  let tapRestoreMap = null;
  const releaseTapLock = () => {
    if (tapRestoreMap) {
      tapRestoreMap();
      tapRestoreMap = null;
    }
  };

  mc2.addEventListener('pointerdown', (e) => {
    // Prevent the underlying map canvas from treating a moment tap
    // as a pan / zoom gesture.
    e.preventDefault();
    e.stopPropagation();

    // Only suppress map gestures if this turns out to be a tap (small movement).
    releaseTapLock();
    tapRestoreMap = suppressMapPanForPhotoGesture(map);

    const startX = e.clientX;
    const startY = e.clientY;
    const pointerId = e.pointerId;
    const MOVE_THRESHOLD = 12; // px

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
        // User is dragging, not tapping: restore map gestures immediately.
        if (tapRestoreMap) tapRestoreMap();
        tapRestoreMap = null;
        window.removeEventListener('pointermove', onMove);
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    const onAnyUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onAnyUp);
      window.removeEventListener('pointercancel', onAnyUp);
      // Let the normal restoration logic run.
    };
    window.addEventListener('pointerup', onAnyUp, { passive: true });
    window.addEventListener('pointercancel', onAnyUp, { passive: true });
  });

  mc2.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.setTimeout(releaseTapLock, 30);
  });

  mc2.addEventListener('pointercancel', () => {
    window.setTimeout(releaseTapLock, 30);
  });

  mc2.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  mc2.addEventListener('click', (e) => {
    e.preventDefault();
    if (e.target.closest('.mc2-p1-inner, .mc2-p2-inner, .mc2-p-single-inner')) return;
    e.stopPropagation();
    spawnReactionBurst(mc2);
    window.setTimeout(releaseTapLock, 80);
  });

  setupMapPhotoDrag(mc2, map);
}

// ─── Moment card element ──────────────────────────────────────────────────────
// Creates ONE DOM element containing avatar, photos, and bubble.
// Stickers are injected separately (async) after Gemini responds.
// Everything is a child of a single .mc2 root — moves as one Mapbox marker.
function createMomentEl(moment) {
  const { photos, avatar, text, time } = moment;

  let photosHtml;
  if (photos.length >= 2) {
    photosHtml = `
      <div class="mc2-photos-2">
        <div class="mc2-p1-wrap"><div class="mc2-p1-inner"><img class="mc2-p1-img" src="${photos[0]}" /></div></div>
        <div class="mc2-p2-wrap"><div class="mc2-p2-inner"><img class="mc2-p2-img" src="${photos[1]}" /></div></div>
      </div>`;
  } else if (photos.length === 1) {
    photosHtml = `
      <div class="mc2-photos-1">
        <div class="mc2-p-single-wrap"><div class="mc2-p-single-inner"><img class="mc2-p-single-img" src="${photos[0]}" /></div></div>
      </div>`;
  } else {
    photosHtml = `<div class="mc2-photos-0"></div>`;
  }

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="mc2${photos.length === 0 ? ' mc2--no-photo' : ''}">
      <div class="mc2-avatar-col">
        <div class="mc2-avatar">
          <img src="${avatar}" alt="" />
        </div>
      </div>
      <div class="mc2-content">
        ${photosHtml}
        <div class="mc2-bubble">
          <span class="mc2-text">${text}<span class="mc2-time">${time}</span></span>
        </div>
      </div>
      ${photos.length > 0 ? '<div class="mc2-dot"></div>' : ''}
    </div>`;
  // Outer el is Mapbox's positioning anchor — never animate it, never block clicks.
  // All visual animation happens on the inner .mc2 child.
  el.style.pointerEvents = 'none';
  return el;
}

// ─── Location dot element ──────────────────────────────────────────────────────
function createLocationEl() {
  const el = document.createElement('div');
  el.innerHTML = `<div class="loc-marker"><div class="loc-marker-dot"></div></div>`;
  return el;
}

// ─── Cluster element ──────────────────────────────────────────────────────────
// ONE object that replaces a group of clustered moments on the map.
// Shows 2–3 overlapping avatar circles + a count pill.
// Individual moment markers are removed (marker.remove()) while this is shown.
function createClusterEl(avatars, count) {
  // Show at most 3 avatar circles; remaining folded into count pill
  const shown = avatars.slice(0, Math.min(3, count));

  const avatarsHtml = shown.map((src, i) =>
    `<div class="sc-av" style="z-index:${shown.length - i}">
       <img src="${src}" alt="" />
     </div>`
  ).join('');

  const countHtml = count > 2
    ? `<div class="sc-count">+${count}</div>`
    : '';

  const el = document.createElement('div');
  el.innerHTML = `
    <div class="sc">
      <div class="sc-avatars">${avatarsHtml}</div>
      ${countHtml}
    </div>`;
  return el;
}


// ─── Overlay UI ───────────────────────────────────────────────────────────────
function Overlay({ onRecord, recording }) {
  const pressTimerRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const onMoveRef = useRef(null);

  const clearPress = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (onMoveRef.current) {
      window.removeEventListener('pointermove', onMoveRef.current);
      onMoveRef.current = null;
    }
    activePointerIdRef.current = null;
  };

  // Long-press duration before recording starts.
  // Kept long enough that a normal tap won't trigger recording,
  // but short enough to feel responsive on mobile web.
  const LONGPRESS_MS = 260;

  const startLongPress = (e) => {
    if (recording) return;
    // Ensure the long-press only activates from within the button.
    e.preventDefault();
    e.stopPropagation();

    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();

    clearPress();
    activePointerIdRef.current = e.pointerId;
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}

    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      activePointerIdRef.current = null;
      onRecord();
    }, LONGPRESS_MS);

    // Cancel if the pointer leaves the button bounds during the hold.
    const onMove = (ev) => {
      if (activePointerIdRef.current !== ev.pointerId) return;
      const inside =
        ev.clientX >= rect.left &&
        ev.clientX <= rect.right &&
        ev.clientY >= rect.top &&
        ev.clientY <= rect.bottom;
      if (!inside) {
        window.removeEventListener('pointermove', onMove);
        onMoveRef.current = null;
        clearPress();
      }
    };
    onMoveRef.current = onMove;
    window.addEventListener('pointermove', onMove, { passive: true });
  };

  const endLongPress = (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearPress();
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 'max(52px, calc(28px + env(safe-area-inset-top)))',
        paddingBottom: 28,
        paddingLeft: 24, paddingRight: 24,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        background: 'linear-gradient(180deg, #F6F4EA -44.26%, rgba(246,244,234,0.00) 100%)',
        backdropFilter: 'blur(0px)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <p style={{ fontSize: 28, fontWeight: 900, fontFamily: '"Noto Sans SC", -apple-system, sans-serif', color: 'black', lineHeight: 1.2, margin: 0 }}>新加坡</p>
          <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'rgba(0,0,0,0.48)' }}>
            <span>晴天</span><span>24° ～ 31°</span>
          </div>
        </div>
        <div style={{
          width: 52, height: 52, borderRadius: 999,
          border: '3px solid white', overflow: 'hidden', flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', pointerEvents: 'auto',
        }}>
          <img src={FEED_ME} alt="me" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>

      {/* Bottom section — fades out when recording; MicHero replaces the mic visually */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingBottom: 'max(48px, env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        opacity: recording ? 0 : 1,
        transition: 'opacity 0.15s ease',
        pointerEvents: recording ? 'none' : 'auto',
      }}>
        {/* 110px spacer so the button sits at the same y as before (FEED_MIC was 104px + 6px gap) */}
        <div style={{ height: 110 }} />
        <button
          onPointerDown={startLongPress}
          onPointerUp={endLongPress}
          onPointerCancel={endLongPress}
          onPointerLeave={endLongPress}
          style={{
            width: 350, height: 60, borderRadius: 999,
            background: 'black', border: 'none',
            color: 'white', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', pointerEvents: 'auto',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            touchAction: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          说一下当下的感受
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MapFeed({ onRecord, recording, newMoment }) {
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const addMomentRef    = useRef(null); // set inside map init, called from newMoment effect
  const locMarkerRef    = useRef(null); // tracks user's current lngLat

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container:          containerRef.current,
      style:              'mapbox://styles/mapbox/streets-v12',
      center:             DEFAULT_CENTER,
      zoom:               DEFAULT_ZOOM,
      interactive:        true,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('style.load', () => {
      HIDDEN_LAYERS.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      });
      ['landuse', 'landcover', 'national-park'].forEach((id) => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'fill-color', '#C5ECAA');
      });
      // Replace orange motorway/trunk colour with muted blue
      ['road-motorway-trunk', 'road-motorway-trunk-link'].forEach((id) => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', '#83A5C2');
      });
      ['road-motorway-trunk-case', 'road-motorway-trunk-link-case'].forEach((id) => {
        if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', '#6a8fad');
      });
    });

    // ── Marker state ──────────────────────────────────────────────────────────
    // Moment markers are added once and NEVER removed — only their .mc2 content
    // is hidden (visibility:hidden) when clustered. This keeps <img> elements in
    // the DOM so images are never re-fetched. inCluster tracks the hidden state.
    const state = {
      moments:  [], // [{ moment, marker, inCluster:bool, clusterLngLat }]
      clusters: [], // [{ marker, el }]  — one per clustered group, rebuilt on membership change
    };

    // Cluster element cache — keyed by sorted moment IDs.
    // Reusing the same DOM element (and its <img> tags) means avatar images are
    // never re-fetched when a cluster re-forms after the user zooms out again.
    const clusterElCache = new Map(); // "id1,id2,…" → { outerEl, scEl }

    // ── Cluster update (animated, visibility-based) ────────────────────────────
    // Moment markers NEVER leave the Mapbox map — only their .mc2 is hidden.
    // This keeps <img> elements in the DOM so images are never re-fetched.
    //
    // Animation origin/destination (positional):
    //   goingIn  → .mc2 slides from its own screen position toward cluster centroid
    //   comingOut → .mc2 starts at remembered cluster centroid, springs to own position
    //   Offsets computed via map.project() so cards fly to/from the avatar stack.
    function updateClusters() {
      if (state.moments.length === 0) return;

      const FADE_MS   = 260;
      const SPRING_MS = 420;
      const FADE_TR   = `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`;
      const SPRING_TR = `opacity ${SPRING_MS}ms cubic-bezier(0.22,1,0.36,1), transform ${SPRING_MS}ms cubic-bezier(0.22,1,0.36,1)`;

      // 1 — compute new groups
      const lngLats = state.moments.map(s => ({ lngLat: s.moment.lngLat }));
      const groups  = screenSpaceCluster(map, lngLats, CLUSTER_RADIUS);

      // 2 — build willCluster set + centroid per group
      const willCluster        = new Set();
      const idxToClusterLngLat = new Map();
      groups.forEach(group => {
        if (group.length <= 1) return;
        const avgLng = group.reduce((s, i) => s + state.moments[i].moment.lngLat[0], 0) / group.length;
        const avgLat = group.reduce((s, i) => s + state.moments[i].moment.lngLat[1], 0) / group.length;
        group.forEach(i => { willCluster.add(i); idxToClusterLngLat.set(i, [avgLng, avgLat]); });
      });

      // 3 — diff
      const goingIn  = []; // [{ index, clusterLngLat }]
      const comingOut = []; // [index]
      state.moments.forEach((s, i) => {
        if (!s.inCluster &&  willCluster.has(i)) goingIn.push({ index: i, clusterLngLat: idxToClusterLngLat.get(i) });
        if ( s.inCluster && !willCluster.has(i)) comingOut.push(i);
      });

      if (goingIn.length === 0 && comingOut.length === 0) return;

      // 4 — animate OUT: old cluster markers + goingIn cards sliding toward centroid
      const oldClusters = state.clusters.slice();
      state.clusters = [];

      oldClusters.forEach(({ el: scEl }) => {
        scEl.style.transition = FADE_TR;
        scEl.style.opacity    = '0';
        scEl.style.transform  = 'scale(0.7)';
      });

      goingIn.forEach(({ index, clusterLngLat }) => {
        const s         = state.moments[index];
        const mc2       = s.marker.getElement().querySelector('.mc2');
        const momentPx  = map.project(s.moment.lngLat);
        const clusterPx = map.project(clusterLngLat);
        const dx = clusterPx.x - momentPx.x;
        const dy = clusterPx.y - momentPx.y;
        mc2.style.transition = FADE_TR;
        mc2.style.opacity    = '0';
        mc2.style.transform  = `translate(${dx}px,${dy}px) scale(0.65)`;
      });

      // 5 — after fade: hide goingIn, spring IN comingOut from cluster origin, new clusters
      setTimeout(() => {
        oldClusters.forEach(({ marker }) => marker.remove());

        // Hide goingIn; record centroid so comingOut can reverse from it
        goingIn.forEach(({ index, clusterLngLat }) => {
          const s   = state.moments[index];
          const mc2 = s.marker.getElement().querySelector('.mc2');
          mc2.style.transition = 'none';
          mc2.style.visibility = 'hidden';
          mc2.style.opacity    = '1';
          mc2.style.transform  = 'none';
          s.inCluster     = true;
          s.clusterLngLat = clusterLngLat;
        });

        // Spring IN comingOut — cards fly OUT from the cluster centroid
        comingOut.forEach(i => {
          const s         = state.moments[i];
          const mc2       = s.marker.getElement().querySelector('.mc2');
          const momentPx  = map.project(s.moment.lngLat);
          const clusterPx = map.project(s.clusterLngLat || s.moment.lngLat);
          const dx = clusterPx.x - momentPx.x;
          const dy = clusterPx.y - momentPx.y;

          mc2.style.transition = 'none';
          mc2.style.visibility = '';
          mc2.style.opacity    = '0';
          mc2.style.transform  = `translate(${dx}px,${dy}px) scale(0.65)`;
          s.inCluster = false;

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              mc2.style.transition = SPRING_TR;
              mc2.style.opacity    = '1';
              mc2.style.transform  = 'translate(0,0) scale(1)';
            });
          });
        });

        // Build new cluster markers and spring IN.
        // Cluster elements are cached by member IDs so the same <img> tags are
        // reused — avatar images are never re-fetched on re-cluster.
        groups.forEach(group => {
          if (group.length === 1) return;

          const members = group.map(i => state.moments[i]);
          const avatars = members.map(s => s.moment.avatar);
          const avgLng  = members.reduce((sum, s) => sum + s.moment.lngLat[0], 0) / members.length;
          const avgLat  = members.reduce((sum, s) => sum + s.moment.lngLat[1], 0) / members.length;

          // Reuse cached element to avoid re-creating <img> tags (and re-fetching images)
          const cacheKey = members.map(s => s.moment.id).sort((a, b) => a - b).join(',');
          let outerEl, scEl;
          if (clusterElCache.has(cacheKey)) {
            ({ outerEl, scEl } = clusterElCache.get(cacheKey));
          } else {
            outerEl = createClusterEl(avatars, members.length);
            scEl    = outerEl.querySelector('.sc');
            clusterElCache.set(cacheKey, { outerEl, scEl });
          }

          // Reset animation state (element may have been previously animated)
          scEl.style.transition = 'none';
          scEl.style.opacity    = '0';
          scEl.style.transform  = 'scale(0.7)';

          // Refresh click handler (remove any stale one, add fresh)
          if (outerEl._clusterClickHandler) {
            outerEl.removeEventListener('click', outerEl._clusterClickHandler);
          }
          const clickHandler = () => {
            const bounds = new mapboxgl.LngLatBounds();
            members.forEach(s => bounds.extend(s.moment.lngLat));
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            if (ne.lat === sw.lat && ne.lng === sw.lng) {
              map.flyTo({ center: [avgLng, avgLat], zoom: Math.min(map.getZoom() + 2.5, 18), duration: 500, essential: true });
            } else {
              map.fitBounds(bounds, { padding: 60, maxZoom: 18, duration: 500, essential: true });
            }
          };
          outerEl.addEventListener('click', clickHandler);
          outerEl._clusterClickHandler = clickHandler;

          const clusterMarker = new mapboxgl.Marker({ element: outerEl, anchor: 'center' })
            .setLngLat([avgLng, avgLat])
            .addTo(map);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scEl.style.transition = SPRING_TR;
              scEl.style.opacity    = '1';
              scEl.style.transform  = 'scale(1)';
            });
          });

          state.clusters.push({ marker: clusterMarker, el: scEl });
        });
      }, FADE_MS);
    }

    // ── Initialise moment markers ─────────────────────────────────────────────
    function initMoments(userLngLat) {
      MOMENT_TEMPLATES.forEach((template) => {
        const lngLat = [
          userLngLat[0] + template.dlng,
          userLngLat[1] + template.dlat,
        ];
        const moment = { ...template, lngLat };

        // Create marker without stickers — renders immediately
        const el     = createMomentEl(moment);
        bindMomentTapAndDrag(el, map);
        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom-left' })
          .setLngLat(lngLat)
          .addTo(map);

        state.moments.push({ moment, marker, inCluster: false, clusterLngLat: null });

        // Fire Gemini async — inject stickers into the live element when ready.
        // Stickers are absolutely positioned children of .mc2 (position:relative)
        // so they always move with the marker as one atomic unit.
        const imageUrl   = moment.photos[0] ?? null;
        const photoCount = moment.photos.length;
        analyzeMoment(moment.text, imageUrl)
          .then(data => {
            const layout = getStickerLayout(data.stickers, data.placement, photoCount);
            injectStickers(el, layout);
          })
          .catch(() => {
            const layout = getFallbackLayout(moment.text, photoCount);
            injectStickers(el, layout);
          });
      });

      // Initial cluster pass — defer so Mapbox finishes projecting the markers
      setTimeout(updateClusters, 100);
    }

    // ── Location marker ────────────────────────────────────────────────────────
    const locEl     = createLocationEl();
    const locMarker = new mapboxgl.Marker({ element: locEl, anchor: 'center' })
      .setLngLat(DEFAULT_CENTER)
      .addTo(map);
    locMarkerRef.current = locMarker;

    // ── Add user-posted moment ─────────────────────────────────────────────────
    // Haversine distance in metres between two [lng, lat] points
    function distMetres(a, b) {
      const R  = 6371000;
      const φ1 = a[1] * Math.PI / 180, φ2 = b[1] * Math.PI / 180;
      const Δφ = (b[1] - a[1]) * Math.PI / 180;
      const Δλ = (b[0] - a[0]) * Math.PI / 180;
      const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    addMomentRef.current = ({ text, image }) => {
      const lngLat     = locMarkerRef.current
        ? locMarkerRef.current.getLngLat().toArray()
        : DEFAULT_CENTER;
      const photoCount = image ? 1 : 0;

      // Remove any previously user-posted moment within 500 m
      for (let i = state.moments.length - 1; i >= 0; i--) {
        const s = state.moments[i];
        if (s.moment.avatar === USER_AVATAR_REC && distMetres(s.moment.lngLat, lngLat) < 500) {
          s.marker.remove();
          state.moments.splice(i, 1);
        }
      }

      const moment = {
        id: Date.now(),
        text,
        photos: image ? [image] : [],
        avatar: USER_AVATAR_REC,
        time:   '刚刚',
        lngLat,
      };

      const el     = createMomentEl(moment);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom-left' })
        .setLngLat(lngLat)
        .addTo(map);

      state.moments.push({ moment, marker, inCluster: false, clusterLngLat: null });

      bindMomentTapAndDrag(el, map);

      // Spring the new card in, then pulse a purple glow for 4s
      const mc2 = el.querySelector('.mc2');
      mc2.style.opacity   = '0';
      mc2.style.transform = 'scale(0.6) translateY(12px)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        mc2.style.transition = 'opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
        mc2.style.opacity    = '1';
        mc2.style.transform  = 'scale(1) translateY(0)';
        mc2.classList.add('mc2--glow');
        mc2.addEventListener('animationend', () => mc2.classList.remove('mc2--glow'), { once: true });
      }));

      // Sticker analysis — skip entirely when no photo
      if (image) {
        analyzeMoment(text, image)
          .then(data => injectStickers(el, getStickerLayout(data.stickers, data.placement, photoCount)))
          .catch(() => injectStickers(el, getFallbackLayout(text, photoCount)));
      }

      // Fly to the new moment and re-cluster
      map.flyTo({ center: lngLat, zoom: 16, duration: 900, essential: true });
      setTimeout(updateClusters, 1000);
    };

    // ── Geolocation ────────────────────────────────────────────────────────────
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const pos = [coords.longitude, coords.latitude];
          locMarker.setLngLat(pos);
          locMarkerRef.current = locMarker;
          map.flyTo({ center: pos, zoom: DEFAULT_ZOOM, essential: true, duration: 1200 });
          initMoments(pos);
        },
        () => { initMoments(DEFAULT_CENTER); },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    } else {
      initMoments(DEFAULT_CENTER);
    }

    // Re-cluster on every pan/zoom end
    map.on('moveend', updateClusters);

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fired when App posts a new moment (after snap → arrow-up tap)
  useEffect(() => {
    if (!newMoment) return;
    // Map may still be initialising — poll until addMomentRef is ready
    const tryAdd = () => {
      if (addMomentRef.current) {
        addMomentRef.current(newMoment);
      } else {
        setTimeout(tryAdd, 200);
      }
    };
    tryAdd();
  }, [newMoment]);

  if (!TOKEN) {
    return (
      <div className="viewport-fill-min" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
        <img src={MAP_MAIN} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <Overlay onRecord={onRecord} recording={recording} />
      </div>
    );
  }

  return (
    <div className="viewport-fill-min" style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <Overlay onRecord={onRecord} />
    </div>
  );
}
