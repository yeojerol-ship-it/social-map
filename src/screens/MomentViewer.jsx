import { useState, useEffect, useLayoutEffect, useRef } from 'react';

const X_MARK_URL = 'https://www.figma.com/api/mcp/asset/55a3cc08-6f30-44be-a965-ae886a856636';

/** Upper cap — keep the moment card visually smaller on the screen. */
const MAX_SCALE = 1.35;
/** Shrink computed fit slightly so stickers / drop-shadow / long text stay inside the viewport. */
const SCALE_COMFORT = 0.88;

/** Insets so the scaled card (and absolute stickers) fit inside the visual viewport. */
function getViewerMargin() {
  const vv = window.visualViewport;
  const innerH = vv?.height ?? window.innerHeight;
  const innerW = vv?.width ?? window.innerWidth;
  const padX = 48;
  const padTop = (vv?.offsetTop ?? 0) + 112;
  const padBottom = 72;
  return { padX, padTop, padBottom, innerW, innerH };
}

function computeCardScale(cardEl) {
  if (!cardEl || cardEl.offsetWidth <= 0 || cardEl.offsetHeight <= 0) return 1;
  const w = cardEl.offsetWidth;
  const h = cardEl.offsetHeight;
  // Stickers are position:absolute; they don't grow offsetHeight — add slack for overflow + rotation.
  const stickerSlack = 64;
  const effW = w + stickerSlack;
  const effH = h + stickerSlack;
  const { padX, padTop, padBottom, innerW, innerH } = getViewerMargin();
  const availW = Math.max(64, innerW - padX);
  const availH = Math.max(64, innerH - padTop - padBottom);
  const scaleW = availW / effW;
  const scaleH = availH / effH;
  const fitted = Math.min(MAX_SCALE, scaleW, scaleH) * SCALE_COMFORT;
  return Math.max(0.55, fitted);
}

const PHOTO_SLOTS = {
  p1:     { wrapClass: 'mc2-p1-wrap',       innerClass: 'mc2-p1-inner',       imgClass: 'mc2-p1-img',       rot: -12,   nativeSize: 56.963 },
  p2:     { wrapClass: 'mc2-p2-wrap',       innerClass: 'mc2-p2-inner',       imgClass: 'mc2-p2-img',       rot: 10.12, nativeSize: 67.019 },
  single: { wrapClass: 'mc2-p-single-wrap', innerClass: 'mc2-p-single-inner', imgClass: 'mc2-p-single-img', rot: 4,     nativeSize: 67.019 },
};

export default function MomentViewer({ visible, moment, stickers = [], onClose }) {
  const [show, setShow]           = useState(false);
  const [cardScale, setCardScale] = useState(1);
  const [detached, setDetached]   = useState([]);

  const detachedRef  = useRef([]);
  const zRef         = useRef(10);
  const viewerRef    = useRef(null);
  const cardRef      = useRef(null);
  const gestureRef   = useRef({});
  const floatImgRefs = useRef({}); // key → <img> DOM node

  // ── Scale measurement — BEFORE paint; fit both width and height in viewport ──
  useLayoutEffect(() => {
    if (!visible) return;
    if (!cardRef.current) return;
    setCardScale(computeCardScale(cardRef.current));
  }, [visible, moment, stickers]);

  useEffect(() => {
    if (!visible) return;
    const onResize = () => {
      if (cardRef.current) setCardScale(computeCardScale(cardRef.current));
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, [visible, moment, stickers]);

  // ── Open / close animation + state reset ─────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      setShow(false);
      const t = setTimeout(() => {
        setDetached([]);
        detachedRef.current = [];
        zRef.current        = 10;
        gestureRef.current  = {};
        floatImgRefs.current = {};
      }, 300);
      return () => clearTimeout(t);
    }

    setDetached([]);
    detachedRef.current  = [];
    zRef.current         = 10;
    gestureRef.current   = {};
    floatImgRefs.current = {};

    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, [visible, moment]);

  // ── Direct DOM update for a floating photo (no React re-render) ───────────────
  const updateFloatImg = (key) => {
    const p  = detachedRef.current.find(x => x.key === key);
    const el = floatImgRefs.current[key];
    if (!p || !el) return;
    el.style.transform = `translate(${p.cx - p.dispSize / 2}px, ${p.cy - p.dispSize / 2}px) rotate(${p.rot}deg) scale(${p.scale ?? 1})`;
  };

  // ── Global gesture handlers ───────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;

    const vToC = (cx, cy) => {
      const r = viewerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      return { x: cx - r.left, y: cy - r.top };
    };

    const onMove = (e) => {
      const key = Object.keys(gestureRef.current)
        .find(k => gestureRef.current[k].pointers.has(e.pointerId));
      if (!key) return;

      const g = gestureRef.current[key];
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...g.pointers.values()];

      if (pts.length === 1) {
        const dx = e.clientX - g.startPX;
        const dy = e.clientY - g.startPY;
        const next = detachedRef.current.map(p =>
          p.key === key ? { ...p, cx: g.startCX + dx, cy: g.startCY + dy } : p
        );
        detachedRef.current = next;
        updateFloatImg(key); // direct DOM — no setState
      } else if (pts.length >= 2) {
        const dx      = pts[1].x - pts[0].x;
        const dy      = pts[1].y - pts[0].y;
        const newDist  = Math.sqrt(dx * dx + dy * dy);
        const newScale = Math.max(0.3, Math.min(6, g.startScale * (newDist / g.startPinchDist)));

        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        const { x: cmx, y: cmy } = vToC(midX, midY);

        const next = detachedRef.current.map(p =>
          p.key === key
            ? { ...p, scale: newScale, cx: g.startCX + (cmx - g.startMidX), cy: g.startCY + (cmy - g.startMidY) }
            : p
        );
        detachedRef.current = next;
        updateFloatImg(key); // direct DOM — no setState
      }
    };

    const onUp = (e) => {
      const key = Object.keys(gestureRef.current)
        .find(k => gestureRef.current[k].pointers.has(e.pointerId));
      if (!key) return;

      const g = gestureRef.current[key];
      g.pointers.delete(e.pointerId);

      if (g.pointers.size === 1) {
        const photo    = detachedRef.current.find(p => p.key === key);
        const [remain] = g.pointers.values();
        if (photo && remain) {
          g.startCX    = photo.cx;
          g.startCY    = photo.cy;
          g.startPX    = remain.x;
          g.startPY    = remain.y;
          g.startScale = photo.scale ?? 1;
        }
      } else if (g.pointers.size === 0) {
        // All fingers lifted — sync React state once
        setDetached([...detachedRef.current]);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, [visible]);

  // ── Lift a photo out of the card ──────────────────────────────────────────────
  const handlePhotoDragStart = (key, src, e) => {
    e.preventDefault();
    e.stopPropagation();

    const { rot, nativeSize } = PHOTO_SLOTS[key];
    const dispSize = nativeSize * cardScale;
    const z        = ++zRef.current;
    const r        = viewerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const cx0      = e.clientX - r.left;
    const cy0      = e.clientY - r.top;

    const entry = { key, src, cx: cx0, cy: cy0, dispSize, rot, z, scale: 1 };
    const next  = [...detachedRef.current.filter(p => p.key !== key), entry];
    detachedRef.current = next;
    setDetached([...next]); // need React render to mount the img DOM node

    gestureRef.current[key] = {
      pointers:       new Map([[e.pointerId, { x: e.clientX, y: e.clientY }]]),
      startCX:        cx0,
      startCY:        cy0,
      startPX:        e.clientX,
      startPY:        e.clientY,
      startScale:     1,
      startPinchDist: 0,
      startMidX:      0,
      startMidY:      0,
    };
  };

  // ── Pointer down on an already-floating photo ─────────────────────────────────
  const handleFloatPointerDown = (key, e) => {
    e.preventDefault();
    e.stopPropagation();

    const photo = detachedRef.current.find(p => p.key === key);
    if (!photo) return;

    // Bring to front (React render needed to update z-index)
    const z    = ++zRef.current;
    const next = detachedRef.current.map(p => p.key === key ? { ...p, z } : p);
    detachedRef.current = next;
    setDetached([...next]);

    const r = viewerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const g = gestureRef.current[key] ?? {
      pointers: new Map(), startCX: photo.cx, startCY: photo.cy,
      startPX: 0, startPY: 0, startScale: photo.scale ?? 1,
      startPinchDist: 0, startMidX: 0, startMidY: 0,
    };
    gestureRef.current[key] = g;
    g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (g.pointers.size === 1) {
      g.startCX    = photo.cx;
      g.startCY    = photo.cy;
      g.startPX    = e.clientX;
      g.startPY    = e.clientY;
      g.startScale = photo.scale ?? 1;
    } else if (g.pointers.size === 2) {
      const pts = [...g.pointers.values()];
      const dx  = pts[1].x - pts[0].x;
      const dy  = pts[1].y - pts[0].y;
      g.startPinchDist = Math.sqrt(dx * dx + dy * dy);
      g.startScale     = photo.scale ?? 1;
      g.startCX        = photo.cx;
      g.startCY        = photo.cy;
      g.startMidX      = (pts[0].x + pts[1].x) / 2 - r.left;
      g.startMidY      = (pts[0].y + pts[1].y) / 2 - r.top;
    }
  };

  // ── Render a photo slot in the card ──────────────────────────────────────────
  const renderSlot = (key, src) => {
    const cfg        = PHOTO_SLOTS[key];
    const isDetached = detached.some(p => p.key === key);
    return (
      <div className={cfg.wrapClass} key={key}>
        <div
          className={cfg.innerClass}
          onPointerDown={(e) => handlePhotoDragStart(key, src, e)}
          style={{ pointerEvents: 'auto', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
        >
          <img
            className={cfg.imgClass}
            src={src}
            alt=""
            draggable={false}
            style={{ opacity: isDetached ? 0 : 1 }}
          />
        </div>
      </div>
    );
  };

  if (!moment) return null;

  const { photos = [], avatar, text, time } = moment;
  const borderPx = Math.round(2  * cardScale);
  const radiusPx = Math.round(12 * cardScale);

  return (
    <div
      ref={viewerRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        maxHeight: '100dvh',
        zIndex: 50,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Blur + cream tint */}
      <div style={{
        position: 'absolute', inset: 0,
        backdropFilter: 'blur(16.25px)', WebkitBackdropFilter: 'blur(16.25px)',
        background: 'rgba(246,244,234,0.6)',
        opacity: show ? 1 : 0, transition: 'opacity 0.25s ease',
        pointerEvents: 'none',
      }} />

      {/* ── Scaled moment card — flex-centered in the viewport ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 'max(20px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(20px, env(safe-area-inset-right, 0px))',
        paddingTop: 'max(88px, calc(env(safe-area-inset-top, 0px) + 72px))',
        paddingBottom: 'max(32px, env(safe-area-inset-bottom, 0px))',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: 2,
      }}>
        <div style={{
          flexShrink: 0,
          transform: `scale(${show ? cardScale : 0.6})`,
          transformOrigin: 'center center',
          opacity: show ? 1 : 0,
          transition: show
            ? 'opacity 0.25s ease, transform 0.45s cubic-bezier(0.34,1.56,0.64,1)'
            : 'opacity 0.2s ease, transform 0.2s ease',
          overflow: 'visible',
          pointerEvents: 'auto',
        }}>
        <div
          ref={cardRef}
          className="mc2"
          style={{ pointerEvents: 'none', filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.18))' }}
        >
          <div className="mc2-avatar-col">
            <div className="mc2-avatar"><img src={avatar} alt="" /></div>
          </div>
          <div className="mc2-content">
            {photos.length >= 2 && (
              <div className="mc2-photos-2">
                {renderSlot('p1', photos[0])}
                {renderSlot('p2', photos[1])}
              </div>
            )}
            {photos.length === 1 && (
              <div className="mc2-photos-1">{renderSlot('single', photos[0])}</div>
            )}
            {photos.length === 0 && <div className="mc2-photos-0" />}
            <div className="mc2-bubble">
              <span className="mc2-text">{text}<span className="mc2-time">{time}</span></span>
            </div>
          </div>
          {photos.length > 0 && <div className="mc2-dot" />}
          {stickers.map((s, i) => (
            <div key={i} className="mc2-sticker" style={{ left: s.x, top: s.y, transform: `rotate(${s.rot}deg)` }}>
              <img src={s.src} alt="" className="mc2-sticker-img"
                style={s.size ? { width: s.size, height: s.size } : {}} />
            </div>
          ))}
        </div>
        </div>
      </div>

      {/* ── Detached floating photos — positioned via direct DOM, not React state ── */}
      {detached.map(p => (
        <img
          key={p.key}
          src={p.src}
          alt=""
          draggable={false}
          ref={(el) => {
            floatImgRefs.current[p.key] = el;
            if (el) {
              // Set initial position immediately (before any pointermove)
              el.style.transform = `translate(${p.cx - p.dispSize / 2}px, ${p.cy - p.dispSize / 2}px) rotate(${p.rot}deg) scale(${p.scale ?? 1})`;
            }
          }}
          onPointerDown={(e) => handleFloatPointerDown(p.key, e)}
          style={{
            position: 'absolute',
            left: 0, top: 0,              // static origin — transform does all positioning
            width: p.dispSize, height: p.dispSize,
            borderRadius: radiusPx,
            border: `${borderPx}px solid #f6f4ea`,
            objectFit: 'cover',
            boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
            zIndex: p.z,
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none',
          }}
        />
      ))}

      {/* X button — top right */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          right: 'max(24px, env(safe-area-inset-right, 0px))',
          top: 'max(72px, calc(env(safe-area-inset-top, 0px) + 16px))',
          width: 48, height: 48, borderRadius: 100,
          background: 'rgba(255,255,255,0.5)',
          border: '1px solid rgba(0,0,0,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0, zIndex: 60,
          opacity: show ? 1 : 0, transition: 'opacity 0.25s ease',
        }}
      >
        <div style={{ position: 'relative', width: 24, height: 24 }}>
          <div style={{ position: 'absolute', inset: '22.87%' }}>
            <img src={X_MARK_URL} alt="close"
              style={{ position: 'absolute', width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      </button>
    </div>
  );
}
