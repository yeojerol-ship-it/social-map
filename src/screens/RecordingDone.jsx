import { useState, useEffect } from 'react';
import StatusBar from '../components/StatusBar';
import { CAMERA_STICKER } from '../assets';

// Fresh asset URLs from Figma node 230:8286 / 230:8293
const AVATAR_URL   = 'https://www.figma.com/api/mcp/asset/fda8d9fa-513e-4ac4-9e1d-757f47646030';
const X_MARK_URL   = 'https://www.figma.com/api/mcp/asset/55a3cc08-6f30-44be-a965-ae886a856636';
const ARROW_URL    = 'https://www.figma.com/api/mcp/asset/6baed6ae-4017-48b5-849d-984db9f6693a';

export default function RecordingDone({ visible, transcript, onAddPhoto, onPost, onClose }) {
  const [avatarIn, setAvatarIn] = useState(false);
  const [bubbleIn, setBubbleIn] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Reset so animation replays next time
      setAvatarIn(false);
      setBubbleIn(false);
      return;
    }
    // Wait for mic icon scale-out (~180ms) before avatar enters
    const t1 = setTimeout(() => setAvatarIn(true), 180);
    // Bubble pops in 200ms after avatar
    const t2 = setTimeout(() => setBubbleIn(true), 380);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [visible]);

  return (
    // Transparent — FrostLayer in App provides the blur + cream tint
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <StatusBar />

      {/* Close button — 48×48, X icon 24×24 (with 22.87% inset matching Figma) */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', left: 24, top: 72,
          width: 48, height: 48, borderRadius: 100,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.5)',
          border: '1px solid rgba(0,0,0,0.03)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative', width: 24, height: 24 }}>
          <div style={{ position: 'absolute', inset: '22.87%' }}>
            <img src={X_MARK_URL} alt="close" style={{ position: 'absolute', width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      </button>

      {/* Avatar — fixed at left:80, top:371 (bottom of original 96px thought-bubble space) */}
      <div style={{
        position: 'absolute', left: 80, top: 371,
        width: 40, height: 40, borderRadius: '50%', overflow: 'hidden',
        opacity: avatarIn ? 1 : 0,
        transform: avatarIn ? 'translateY(0px) scale(1)' : 'translateY(20px) scale(0.6)',
        transition: 'opacity 0.35s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        zIndex: 1,
      }}>
        <img src={AVATAR_URL} alt="me" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>

      {/* Dot — connector, pinned at avatar top-right corner */}
      <div style={{
        position: 'absolute', left: 122, top: 369,
        width: 8, height: 8, borderRadius: '50%', background: 'white',
        transform: 'rotate(-3.84deg)',
        opacity: bubbleIn ? 1 : 0,
        transition: 'opacity 0.3s ease',
        zIndex: 2,
      }} />

      {/* Bubble — bottom anchored at avatar top (bottom: 844-371=473), grows upward on wrap */}
      <div style={{
        position: 'absolute', left: 126, bottom: 473,
        maxWidth: 220, width: 'fit-content',
        padding: '8px 16px', borderRadius: 24,
        background: 'white',
        backdropFilter: 'blur(4.35px)', WebkitBackdropFilter: 'blur(4.35px)',
        border: '1px solid rgba(255,255,255,0.4)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        transform: bubbleIn ? 'translateX(0px) scale(1) rotate(-3deg)' : 'translateX(-12px) scale(0.85) rotate(-3deg)',
        opacity: bubbleIn ? 1 : 0,
        transition: 'opacity 0.3s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        zIndex: 3,
      }}>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.3, color: 'rgba(0,0,0,0.65)' }}>
          {transcript}
        </p>
      </div>

      {/* Add photo — left:8 top:674 w:122, padding expands hit area */}
      <button
        onClick={onAddPhoto}
        style={{
          position: 'absolute', left: -8, top: 654, width: 148,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '20px 13px 6px',
        }}
      >
        <img
          src={CAMERA_STICKER} alt="camera"
          style={{ width: '100%', aspectRatio: '3/2', objectFit: 'contain', marginBottom: -6 }}
        />
        <div style={{
          width: 81, height: 40, borderRadius: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'white', border: '1px solid #f0efee',
          backdropFilter: 'blur(12.35px)', marginBottom: -6,
          overflow: 'hidden',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'black', whiteSpace: 'nowrap' }}>添加图片</span>
        </div>
      </button>

      {/* Post button — left:268 top:695 size:94 */}
      <button
        onClick={onPost}
        style={{
          position: 'absolute', left: 268, top: 695,
          width: 94, height: 94, borderRadius: 999,
          background: 'black', border: '1px solid rgba(0,0,0,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <div style={{ position: 'relative', width: 35.72, height: 35.72, transform: 'rotate(90deg)', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '6.25%', right: '13.11%', bottom: '8.33%', left: '13.11%' }}>
            <img src={ARROW_URL} alt="post" style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      </button>
    </div>
  );
}
