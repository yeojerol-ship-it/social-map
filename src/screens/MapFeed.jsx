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
  {
    id: 1,
    dlat:  0.0030, dlng:  0.0020,
    photos: [NP3, NP4], avatar: A2_AVT,
    text: '师傅做的寿司太绝了', time: '45m ago',
  },
  {
    id: 2,
    dlat:  0.0050, dlng:  0.0040,
    photos: [NP7, NP8], avatar: A4_AVT,
    text: '鲷鱼烧排队值了！', time: '3h ago',
  },
  // ── Cluster B: nature / outdoor pair ──
  {
    id: 3,
    dlat: -0.0030, dlng: -0.0020,
    photos: [NP1, NP2], avatar: A1_AVT,
    text: '今天爬山视野绝了', time: '2h ago',
  },
  {
    id: 4,
    dlat: -0.0050, dlng: -0.0040,
    photos: [NP5, NP6], avatar: A3_AVT,
    text: '富士山脚下喝咖啡', time: '1h ago',
  },
  // ── Singles — each >167 px from everything else at z14 ──
  {
    id: 5,
    dlat:  0.0130, dlng:  0.0000,
    photos: [M1_P1, M1_P2], avatar: A5_AVT,
    text: '谁家的狗太可爱了', time: '30m ago',
  },
  {
    id: 6,
    dlat: -0.0130, dlng:  0.0000,
    photos: [M2_P1, M2_P2], avatar: A6_AVT,
    text: '夕阳也太美了吧', time: '1h ago',
  },
  {
    id: 7,
    dlat: -0.0020, dlng:  0.0072,
    photos: [M3_P1, M3_P2], avatar: A7_AVT,
    text: '今天的拉面真的绝了', time: '20m ago',
  },
  {
    id: 8,
    dlat:  0.0020, dlng: -0.0072,
    photos: [M4_P1, M4_P2], avatar: A8_AVT,
    text: '刚跑完步， 应该吃什么呢', time: '4h ago',
  },
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
  mc2.querySelectorAll('.mc2-sticker').forEach(s => s.remove());
  layout.forEach(({ src, x, y, rot, size }) => {
    const div = document.createElement('div');
    div.className = 'mc2-sticker';
    div.style.cssText = `left:${x}px;top:${y}px;transform:rotate(${rot}deg)`;
    const sizeStyle = size ? `width:${size}px;height:${size}px;` : '';
    div.innerHTML = `<img src="${src}" alt="" class="mc2-sticker-img" style="${sizeStyle}"/>`;
    mc2.appendChild(div);
  });
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
    <div class="mc2">
      <div class="mc2-avatar-col">
        <div class="mc2-avatar">
          <img src="${avatar}" alt="" />
          <div class="mc2-dot"></div>
        </div>
      </div>
      <div class="mc2-content">
        ${photosHtml}
        <div class="mc2-bubble">
          <span class="mc2-text">${text}<span class="mc2-time">${time}</span></span>
        </div>
      </div>
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
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        paddingTop: 72, paddingBottom: 28,
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
        paddingBottom: 28,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        opacity: recording ? 0 : 1,
        transition: 'opacity 0.15s ease',
        pointerEvents: recording ? 'none' : 'auto',
      }}>
        {/* 110px spacer so the button sits at the same y as before (FEED_MIC was 104px + 6px gap) */}
        <div style={{ height: 110 }} />
        <button onPointerDown={e => { e.preventDefault(); onRecord(); }} style={{
          width: 350, height: 60, borderRadius: 999,
          background: 'black', border: 'none',
          color: 'white', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', pointerEvents: 'auto',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          touchAction: 'none',
        }}>
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

      // Spring the new card in
      const mc2 = el.querySelector('.mc2');
      mc2.style.opacity   = '0';
      mc2.style.transform = 'scale(0.6) translateY(12px)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        mc2.style.transition = 'opacity 0.4s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
        mc2.style.opacity    = '1';
        mc2.style.transform  = 'scale(1) translateY(0)';
      }));

      // Sticker analysis based on text + image content
      analyzeMoment(text, image ?? null)
        .then(data => injectStickers(el, getStickerLayout(data.stickers, data.placement, photoCount)))
        .catch(() => injectStickers(el, getFallbackLayout(text, photoCount)));

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

    return () => {
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
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <img src={MAP_MAIN} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <Overlay onRecord={onRecord} recording={recording} />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <Overlay onRecord={onRecord} />
    </div>
  );
}
