import { useState, useEffect, useRef, useCallback } from 'react';
import MapFeed from './screens/MapFeed';
import RecordingDone from './screens/RecordingDone';
import AddPhoto from './screens/AddPhoto';
import PostedMap from './screens/PostedMap';
import StatusBar from './components/StatusBar';
import { MIC_IMAGE } from './assets';

const FULL_TRANSCRIPT = '大自然让我感很平静';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// ─── MicHero ──────────────────────────────────────────────────────────────────
const MIC_STYLES = {
  // Map mode: hidden (scale 0 so it springs in from nothing when recording starts)
  map: {
    transform:  'scale(0)',
    opacity:    0,
    transition: 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.3s ease',
  },
  // Recording mode: scale(0.6) keeps visual bottom fixed at 8px above bubble (transformOrigin:center bottom)
  // Visual height = 475 * 0.6 = 285px → mic sits in lower ~33% of screen, not centered
  recording: {
    transform:  'scale(1) rotate(0deg)',
    opacity:    1,
    transition: 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease',
  },
  exit: {
    transform:  'scale(0) rotate(0deg)',
    opacity:    0,
    transition: 'transform 0.18s cubic-bezier(0.4,0,1,1), opacity 0.12s ease',
  },
};

function MicHero({ mode }) {
  if (mode === 'hidden') return null;
  return (
    <div style={{
      position: 'absolute',
      left: 0, bottom: 'calc(201px + 8px)', width: '100%', height: 475,
      zIndex: 34, pointerEvents: 'none',
      transformOrigin: 'center bottom',
      ...MIC_STYLES[mode],
    }}>
      <img src={MIC_IMAGE} alt="mic" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
}

// ─── Recording overlay ────────────────────────────────────────────────────────
// No own background — FrostLayer in App provides the blur + cream tint.
function RecordingOverlay({ liveText }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(r2);
    });
    return () => cancelAnimationFrame(r1);
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 36, overflow: 'hidden', touchAction: 'none' }}>
      <StatusBar />

      {/* Transcript or placeholder */}
      <div style={{
        position: 'absolute', top: 110, left: 0, width: '100%',
        display: 'flex', justifyContent: 'center', padding: '0 40px',
        opacity: entered ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}>
        <span style={{
          fontSize: 24, fontWeight: 600, lineHeight: 1.3,
          color: liveText ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.34)',
          maxWidth: 300, textAlign: 'center',
        }}>
          {liveText || '说一说'}
        </span>
      </div>

      {/* Pulsating white bubble */}
      <div style={{
        position: 'absolute', left: '50%', top: 'calc(100% - 201px)',
        transform: 'translateX(-50%)',
        width: 800, height: 800,
        pointerEvents: 'none',
        opacity: entered ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}>
        <div className="rec-pulse-ring" style={{
          width: '100%', height: '100%',
          borderRadius: '50%',
          border: '1px solid #f0efee',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.74), rgba(255,255,255,0.09) 26.5%)',
        }} />
      </div>

      {/* Release hint */}
      <div style={{
        position: 'absolute', bottom: 'max(100px, calc(66px + env(safe-area-inset-bottom)))', left: 0, width: '100%',
        display: 'flex', justifyContent: 'center',
        opacity: entered ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,0.65)' }}>
          松手停止录制
        </span>
      </div>
    </div>
  );
}

// ─── Overlay screen wrapper ───────────────────────────────────────────────────
function Overlay({ children, visible }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      transition: 'opacity 0.25s ease',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      {children}
    </div>
  );
}

const SCREENS = ['map', 'rec-done', 'add-photo', 'posted'];

export default function App() {
  const [screen, setScreen]         = useState('map');
  const [recording, setRecording]   = useState(false);
  const [micMode, setMicMode]       = useState('map');
  const [liveText, setLiveText]     = useState('');
  const [transcript, setTranscript] = useState(FULL_TRANSCRIPT);
  const [newMoment, setNewMoment]   = useState(null);
  const liveRef        = useRef('');
  const recognitionRef = useRef(null);
  const micTimerRef    = useRef(null);

  // Restore mic when returning to map
  useEffect(() => {
    if (screen === 'map') setMicMode('map');
    if (screen === 'posted') setMicMode('hidden');
  }, [screen]);

  const handlePost = useCallback((image) => {
    setNewMoment({ text: transcript, image });
    go('map');
  }, [transcript]);

  // ── Start recording ────────────────────────────────────────────────────────
  const startRec = useCallback(() => {
    if (recording) return;
    if (micTimerRef.current) clearTimeout(micTimerRef.current);

    // Haptic feedback
    navigator.vibrate?.(10);

    setRecording(true);
    setMicMode('recording');
    setLiveText('');
    liveRef.current = '';

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous     = true;
      recognition.interimResults = true;
      recognition.lang           = 'zh-CN';
      recognition.onresult = (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
        liveRef.current = text;
        setLiveText(text);
      };
      const restartAfter = (ms) => {
        setTimeout(() => {
          if (recognitionRef.current) try { recognition.start(); } catch (_) {}
        }, ms);
      };
      recognition.onerror = (e) => {
        // not-allowed / service-not-allowed → no point restarting (no permission)
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') return;
        // All other errors (no-speech, audio-capture, network, aborted…) → restart
        if (recognitionRef.current) restartAfter(150);
      };
      recognition.onend = () => {
        // Safari stops continuous recognition frequently — always restart if still recording
        if (recognitionRef.current) restartAfter(100);
      };
      // iOS Safari: recognition.start() MUST be called synchronously inside the
      // user-gesture handler — do NOT await anything before this line.
      try { recognition.start(); } catch (_) {}
      recognitionRef.current = recognition;
    }
  }, [recording]);

  // Fallback simulation
  useEffect(() => {
    if (!recording || SpeechRecognition) return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      const t = FULL_TRANSCRIPT.slice(0, i);
      liveRef.current = t;
      setLiveText(t);
      if (i >= FULL_TRANSCRIPT.length) clearInterval(iv);
    }, 150);
    return () => clearInterval(iv);
  }, [recording]);

  // ── Stop on pointer up ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!recording) return;
    let fired = false;
    const stop = () => {
      if (fired) return;
      fired = true;
      if (recognitionRef.current) {
        const r = recognitionRef.current;
        recognitionRef.current = null;
        try { r.stop(); } catch (_) {}
      }
      const captured = liveRef.current.trim();
      setRecording(false);
      setLiveText('');

      if (!captured) {
        setScreen('map');
        setMicMode('map');
        return;
      }

      setTranscript(captured);
      setScreen('rec-done');
      setMicMode('exit');
      micTimerRef.current = setTimeout(() => setMicMode('hidden'), 220);
    };
    window.addEventListener('pointerup',     stop);
    window.addEventListener('touchend',      stop, { passive: true });
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup',     stop);
      window.removeEventListener('touchend',      stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [recording]);

  const go = (s) => setScreen(s);

  // FrostLayer is visible during recording AND rec-done so blur never drops
  // between RecordingOverlay unmounting and RecordingDone appearing.
  // FrostLayer stays up across the full recording→rec-done→add-photo→snapped flow.
  const isBlurred = recording || ['rec-done', 'add-photo'].includes(screen);

  return (
    <div style={{
      position: 'relative',
      width: '100%', height: '100dvh',
      overflow: 'hidden',
      background: '#f6f4ea',
    }}>
        {/* Map — always the base layer */}
        <div style={{
          position: 'absolute', inset: 0,
          opacity: screen === 'posted' ? 0 : 1,
          transition: 'opacity 0.3s ease',
          pointerEvents: screen === 'map' ? 'auto' : 'none',
        }}>
          <MapFeed onRecord={startRec} recording={recording} newMoment={newMoment} />
        </div>

        {/* FrostLayer — persistent blur over the live map.
            Stays at opacity:1 across the recording→rec-done boundary
            so the blur never drops between states. */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 15,
          backdropFilter: 'blur(16.25px)',
          WebkitBackdropFilter: 'blur(16.25px)',
          background: 'rgba(246,244,234,0.6)',
          opacity: isBlurred ? 1 : 0,
          transition: 'opacity 0.25s ease',
          pointerEvents: 'none',
        }} />

        <Overlay visible={screen === 'posted'}>
          <PostedMap transcript={transcript} onRecord={startRec} />
        </Overlay>

        {/* RecordingDone — transparent, sits on FrostLayer */}
        <Overlay visible={screen === 'rec-done'}>
          <RecordingDone
            visible={screen === 'rec-done'}
            transcript={transcript}
            onAddPhoto={() => go('add-photo')}
            onPost={() => go('posted')}
            onClose={() => go('map')}
          />
        </Overlay>

        <Overlay visible={screen === 'add-photo'}>
          <AddPhoto visible={screen === 'add-photo'} transcript={transcript} onBack={() => go('rec-done')} onPost={handlePost} />
        </Overlay>

        {/* RecordingOverlay — content only, no own blur (FrostLayer handles it) */}
        {recording && <RecordingOverlay liveText={liveText} />}

        {/* MicHero — single mic across map + recording states */}
        <MicHero mode={micMode} />
      </div>
  );
}
