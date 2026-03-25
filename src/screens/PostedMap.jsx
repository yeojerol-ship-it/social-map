/**
 * PostedMap — full-screen map with friend moments + new user moment.
 *
 * Map layer: single <img> covering inset:0 with object-fit:cover.
 * Friend clusters and the new moment are absolutely positioned overlays.
 * The new moment card drops in after 600ms.
 */

import { useEffect, useState } from 'react';
import {
  MAP_POSTED, MAP_POSTED_ME, MAP_POSTED_MIC,
  STICKER_EMOJI, STICKER_RAMEN,
  C1_P1, C1_P2, C1_AVT,
  C2_P1, C2_P2, C2_AVT,
  C3_P1, C3_P2, C3_AVT,
  C4_P1, C4_P2, C4_AVT,
  NEW_P1, NEW_AVT,
} from '../assets';

// Friend moment clusters — pixel positions on the 390×844 frame
const MOMENTS = [
  { x: 260, y: 180, p1: C1_P1, p2: C1_P2, avt: C1_AVT, text: '谁家的狗...我可以带回家吗?', time: '2h ago' },
  { x: 290, y: 340, p1: C2_P1, p2: C2_P2, avt: C2_AVT, text: 'i mean 夕阳也太美了吧',       time: '2h ago' },
  { x:  40, y: 490, p1: C3_P1, p2: C3_P2, avt: C3_AVT, text: '幸好没踩雷',                 time: '2h ago' },
  { x: 180, y: 560, p1: C4_P1, p2: C4_P2, avt: C4_AVT, text: '幸好没踩雷',                 time: '2h ago' },
];

function ClusterCard({ p1, p2, avt, text, time, highlight }) {
  return (
    <div className="mc" style={highlight ? { filter: 'drop-shadow(0 4px 16px rgba(89,56,255,0.3))' } : {}}>
      <div className="mc-photos">
        <div className="mc-p1"><img src={p1} alt="" /></div>
        <div className="mc-p2"><img src={p2} alt="" /></div>
        <img className="mc-emoji" src={STICKER_EMOJI} alt="" />
        <img className="mc-ramen" src={STICKER_RAMEN} alt="" />
      </div>
      <div className="mc-footer">
        <div className="mc-avatar"><img src={avt} alt="" /></div>
        <div className="mc-bubble-wrap">
          <div className="mc-dot" />
          <div className="mc-bubble" style={highlight ? { background: 'rgba(255,255,255,0.98)', borderColor: 'rgba(89,56,255,0.15)' } : {}}>
            <span className="mc-text">{text}</span>
            <span className="mc-time" style={highlight ? { color: 'rgba(89,56,255,0.7)' } : {}}>{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PostedMap({ transcript, onRecord }) {
  const [appeared, setAppeared] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAppeared(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>

      {/* ── Layer 1: Map — single image, full-bleed, no grid ── */}
      <img
        src={MAP_POSTED}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />

      {/* ── Layer 2: UI overlay ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        pointerEvents: 'none',
      }}>

        {/* Friend moment clusters */}
        {MOMENTS.map((m, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: m.x, top: m.y,
            pointerEvents: 'none',
          }}>
            <ClusterCard p1={m.p1} p2={m.p2} avt={m.avt} text={m.text} time={m.time} />
          </div>
        ))}

        {/* New user moment — drops in after 600ms */}
        <div style={{
          position: 'absolute',
          left: 30, top: 400,
          transition: 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
          opacity: appeared ? 1 : 0,
          transform: appeared ? 'translateY(0)' : 'translateY(-20px)',
        }}>
          <ClusterCard p1={NEW_P1} p2={NEW_P1} avt={NEW_AVT} text={transcript} time="2s ago" highlight />
        </div>

        {/* Header */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          paddingTop: 48, paddingBottom: 32,
          paddingLeft: 24, paddingRight: 24,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          background: 'linear-gradient(to bottom, #f6f4ea 0%, #f6f4ea 40%, rgba(246,244,234,0) 100%)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: 'black', lineHeight: 1.2, margin: 0 }}>新加坡</p>
            <div style={{ display: 'flex', gap: 8, fontSize: 13, color: 'rgba(0,0,0,0.48)' }}>
              <span>晴天</span><span>24° ～ 31°</span>
            </div>
          </div>
          <div style={{ width: 52, height: 52, borderRadius: 999, border: '3px solid white', overflow: 'hidden', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', pointerEvents: 'auto' }}>
            <img src={MAP_POSTED_ME} alt="me" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          paddingBottom: 'max(32px, env(safe-area-inset-bottom, 0px))', paddingTop: 80,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'linear-gradient(to top, rgba(246,244,234,0.85) 0%, rgba(246,244,234,0.6) 60%, transparent 100%)',
        }}>
          <div style={{ width: 90, height: 108, marginBottom: 8, transform: 'rotate(5.78deg)' }}>
            <img src={MAP_POSTED_MIC} alt="mic" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <button onPointerDown={e => { e.preventDefault(); onRecord(); }} style={{
            width: 350, height: 60, borderRadius: 999,
            background: 'black', border: '1px solid rgba(255,255,255,0.1)', color: 'white',
            fontSize: 15, fontWeight: 600, cursor: 'pointer', pointerEvents: 'auto',
            boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          }}>
            按住说一下 当下的感受
          </button>
        </div>

      </div>
    </div>
  );
}
