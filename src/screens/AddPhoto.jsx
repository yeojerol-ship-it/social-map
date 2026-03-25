import { useState, useEffect, useRef } from 'react';
import StatusBar from '../components/StatusBar';
import { USER_AVATAR_REC } from '../assets';
import CAMERA_FLIP_PNG from '../assets/Icon/Camera_Flip_Camera.png';
import ARROW_UP_PNG from '../assets/Icon/Arrow_Up_Bold.png';
import { analyzeMoment } from '../services/openai';
import { STICKER_PACK, getFallbackLayout } from '../stickers';

// Figma MCP assets — node 230:8307
const IMG_ARROW_LEFT  = 'https://www.figma.com/api/mcp/asset/32fc7fff-3f5b-4141-bd23-0ed6eb0c09c1';
const IMG_IMAGE_STACK = 'https://www.figma.com/api/mcp/asset/803f2585-1a3f-4866-befb-25621431e4ed';

const VIEWPORT_WIDTH = 'calc(100vw - 8px)';

export default function AddPhoto({ visible, transcript, onBack, onPost }) {
  const [avatarIn, setAvatarIn]       = useState(false);
  const [bubbleIn, setBubbleIn]       = useState(false);
  const [facingMode, setFacingMode]   = useState('user');
  const [frozenFrame, setFrozenFrame] = useState(null); // dataURL of captured frame
  const [snapStickers, setSnapStickers] = useState([]); // [{ src, corner }]
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const snapReqIdRef = useRef(0);

  const snapped = frozenFrame !== null;

  const setSnapStickersFromIds = (ids) => {
    const valid = (ids ?? []).filter((id) => STICKER_PACK[id]).slice(0, 2);
    if (valid.length < 2) return false;
    setSnapStickers([
      { src: STICKER_PACK[valid[0]], corner: 'top-right' },
      { src: STICKER_PACK[valid[1]], corner: 'bottom-left' },
    ]);
    return true;
  };

  // Entrance animation — reset state on BOTH enter and exit so a leftover
  // frozenFrame from a previous session can never bleed into the next one.
  useEffect(() => {
    if (!visible) {
      setAvatarIn(false);
      setBubbleIn(false);
      setFrozenFrame(null);
      setSnapStickers([]);
      setFacingMode('user');
      return;
    }
    // Always start fresh when the screen opens
    setFrozenFrame(null);
    setSnapStickers([]);
    setFacingMode('user');
    setAvatarIn(false);
    setBubbleIn(false);
    const t1 = setTimeout(() => setAvatarIn(true), 80);
    const t2 = setTimeout(() => setBubbleIn(true), 260);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [visible]);

  // Camera stream
  useEffect(() => {
    if (!visible) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      return;
    }
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode }, audio: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [visible, facingMode]);

  const flipCamera = () => {
    if (snapped) return;
    setFacingMode(f => f === 'environment' ? 'user' : 'environment');
  };

  const handleSnap = () => {
    if (snapped) return;
    const video = videoRef.current;
    const w = video?.videoWidth  || 382;
    const h = video?.videoHeight || 382;

    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (video && video.readyState >= 2) {
      const mirror = facingMode === 'user';

      if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
      if (ctx.filter !== undefined) ctx.filter = 'brightness(1.04) contrast(0.92) saturate(1.10)';
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = 'none';
      if (mirror) ctx.setTransform(1, 0, 0, 1, 0, 0);

      const softCanvas = document.createElement('canvas');
      softCanvas.width  = w;
      softCanvas.height = h;
      const sCtx = softCanvas.getContext('2d');
      if (mirror) { sCtx.translate(w, 0); sCtx.scale(-1, 1); }
      if (sCtx.filter !== undefined) sCtx.filter = 'blur(2.5px) brightness(1.04) saturate(1.10)';
      sCtx.drawImage(video, 0, 0, w, h);
      ctx.globalAlpha = 0.20;
      ctx.drawImage(softCanvas, 0, 0);
      ctx.globalAlpha = 1.0;
    }

    const snapDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setFrozenFrame(snapDataUrl);
    // Show deterministic fallback immediately so snapped UI always has stickers.
    const fallbackIds = getFallbackLayout(transcript, 1)
      .map((s) => Object.keys(STICKER_PACK).find((id) => STICKER_PACK[id] === s.src))
      .filter(Boolean);
    if (!setSnapStickersFromIds(fallbackIds)) {
      setSnapStickers([
        { src: STICKER_PACK.sparkle, corner: 'top-right' },
        { src: STICKER_PACK.star, corner: 'bottom-left' },
      ]);
    }
    const reqId = ++snapReqIdRef.current;
    analyzeMoment(transcript, snapDataUrl)
      .then((data) => {
        if (snapReqIdRef.current !== reqId) return;
        setSnapStickersFromIds(data?.stickers ?? []);
      })
      .catch(() => {});
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  return (
    <div
      className="viewport-fill-min"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      <StatusBar />

      {/* Back — X=24 Y=72 per layout spec (extra horizontal inset on devices with curved corners). */}
      <button
        type="button"
        onClick={onBack}
        style={{
          position: 'absolute',
          left: 24,
          top: 72,
          width: 48,
          height: 48,
          borderRadius: 100,
          background: 'rgba(255,255,255,0.5)',
          border: '1px solid rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          zIndex: 5,
        }}
      >
        <div style={{ position: 'relative', width: 20, height: 20, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '13.11%', right: '8.33%', bottom: '13.11%', left: '6.25%' }}>
            <img src={IMG_ARROW_LEFT} alt="back" style={{ position: 'absolute', width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      </button>

      {/* 1:1 viewfinder (device width − 8px), centered; transcript + avatar overlay inside */}
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        top: 'calc(72px + 48px + 16px + 40px)',
        width: VIEWPORT_WIDTH,
        maxWidth: 'calc(100% - 8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        boxSizing: 'border-box',
      }}>
        <div style={{
          width: '100%',
          aspectRatio: '1',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 40,
            overflow: 'hidden',
            background: '#000',
          }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                filter: 'brightness(1.04) contrast(0.92) saturate(1.10)',
                opacity: snapped ? 0 : 1,
                transition: 'opacity 0.15s ease',
              }}
            />
            {frozenFrame && (
              <img
                src={frozenFrame}
                alt=""
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
          </div>

          {/* Snapped stickers float above camera mask so they're never clipped. */}
          {snapped && snapStickers.map((s, i) => (
            <img
              key={`${s.corner}-${i}`}
              src={s.src}
              alt=""
              style={{
                position: 'absolute',
                width: 100,
                height: 100,
                objectFit: 'contain',
                zIndex: 4,
                pointerEvents: 'none',
                ...(s.corner === 'top-right'
                  ? { right: -14, top: -14, transform: 'rotate(10deg)' }
                  : { left: -14, bottom: -14, transform: 'rotate(-8deg)' }),
              }}
            />
          ))}

          {/* Avatar cluster: 20px inset from viewfinder; bubble + dot in avatar coords (30, -40), overflow visible. */}
          <div
            style={{
              position: 'absolute',
              left: 20,
              top: 20,
              zIndex: 2,
              overflow: 'visible',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: 40,
                height: 40,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 999,
                  overflow: 'hidden',
                  opacity: avatarIn ? 1 : 0,
                  transform: avatarIn ? 'translateY(0px) scale(1)' : 'translateY(14px) scale(0.7)',
                  transition: 'opacity 0.3s ease, transform 0.45s cubic-bezier(0.34,1.56,0.64,1)',
                }}
              >
                <img
                  src={USER_AVATAR_REC} alt="me"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
              {/* Speech bubble cluster — top-right of avatar; x=30 y=-40 in avatar container */}
              <div
                style={{
                  position: 'absolute',
                  // Anchor bubble cluster to avatar top-right.
                  left: 40,
                  top: -40,
                  display: 'inline-block',
                  boxSizing: 'border-box',
                  width: 'max-content',
                  maxWidth: 220,
                  zIndex: 3,
                  opacity: bubbleIn ? 1 : 0,
                  transform: bubbleIn ? 'translateX(0px) scale(1)' : 'translateX(-10px) scale(0.88)',
                  transition: 'opacity 0.3s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                  verticalAlign: 'top',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    boxSizing: 'border-box',
                    width: 'max-content',
                    maxWidth: 220,
                  }}
                >
                  <div
                    style={{
                      display: 'inline-block',
                      boxSizing: 'border-box',
                      width: '100%',
                      maxWidth: 220,
                      backdropFilter: 'blur(4.35px)',
                      WebkitBackdropFilter: 'blur(4.35px)',
                      background: 'white',
                      border: '1px solid rgba(255,255,255,0.4)',
                      padding: '8px 16px',
                      borderRadius: 24,
                      boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    }}
                  >
                    <p style={{
                      margin: 0,
                      fontSize: 20,
                      fontWeight: 600,
                      lineHeight: 1.3,
                      color: 'rgba(0,0,0,0.65)',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                    }}
                    >
                      {transcript}
                    </p>
                  </div>
                  {/* 8×8 connector — same box as bubble; (x,y)=(-2,-2) from bottom-left for diagonal tail toward avatar */}
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: -2,
                      bottom: -2,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom controls — 40px spacing between flip / shutter / gallery */}
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(max(12px, env(safe-area-inset-bottom, 0px)) + 12px)',
        width: VIEWPORT_WIDTH,
        maxWidth: 'calc(100% - 8px)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        boxSizing: 'border-box',
        zIndex: 5,
      }}>
        <div
          onClick={flipCamera}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && flipCamera()}
          style={{
            width: 67,
            height: 64,
            borderRadius: 20,
            background: '#FBFBFB',
            border: '1px solid rgba(0,0,0,0.01)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: snapped ? 'default' : 'pointer',
            opacity: snapped ? 0 : 1,
            transition: 'opacity 0.2s ease',
            pointerEvents: snapped ? 'none' : 'auto',
            flexShrink: 0,
          }}
        >
          <img src={CAMERA_FLIP_PNG} alt="flip" style={{ width: 32, height: 32, display: 'block' }} />
        </div>

        <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
          <div
            onClick={handleSnap}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleSnap()}
            style={{
              position: 'absolute', inset: 0,
              borderRadius: 100,
              background: 'rgba(214,214,214,0.21)',
              border: '1px solid rgba(0,0,0,0.02)',
              cursor: snapped ? 'default' : 'pointer',
              opacity: snapped ? 0 : 1,
              transition: 'opacity 0.2s ease',
              pointerEvents: snapped ? 'none' : 'auto',
            }}
          >
            <div style={{
              position: 'absolute',
              left: 21.6, top: 21.6,
              width: 56.8, height: 56.8,
              borderRadius: 100, background: '#fbfbfb',
            }} />
          </div>
          <div
            onClick={snapped ? () => onPost(frozenFrame) : undefined}
            role="button"
            tabIndex={0}
            style={{
              position: 'absolute', inset: 0,
              borderRadius: 100,
              background: 'black',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: snapped ? 'pointer' : 'default',
              transform: snapped ? 'scale(1)' : 'scale(0)',
              opacity: snapped ? 1 : 0,
              pointerEvents: snapped ? 'auto' : 'none',
              transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s ease',
            }}
          >
            <img src={ARROW_UP_PNG} alt="post" style={{ width: 40, height: 40, display: 'block' }} />
          </div>
        </div>

        <div style={{
          width: 67,
          height: 64,
          borderRadius: 20,
          background: '#FBFBFB',
          border: '1px solid rgba(0,0,0,0.01)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: snapped ? 0 : 1,
          transition: 'opacity 0.2s ease',
          pointerEvents: snapped ? 'none' : 'auto',
          flexShrink: 0,
        }}
        >
          <div style={{ position: 'relative', width: 32, height: 32, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '6.25%', right: '4.16%', bottom: '4.16%', left: '6.25%' }}>
              <img src={IMG_IMAGE_STACK} alt="gallery" style={{ position: 'absolute', width: '100%', height: '100%', display: 'block' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
