import { useEffect, useState } from 'react';
import StatusBar from '../components/StatusBar';
import { MAP_MAIN, MIC_IMAGE } from '../assets';

const TRANSCRIPT = '大自然让我感很平静';

export default function RecordingSpeaking({ onRelease }) {
  const [displayed, setDisplayed] = useState('');

  // Simulate live transcription — reveal characters one by one
  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(TRANSCRIPT.slice(0, i));
      if (i >= TRANSCRIPT.length) clearInterval(iv);
    }, 120);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="relative w-[390px] h-[844px] rounded-[44px] overflow-hidden bg-white">
      <img
        src={MAP_MAIN} alt=""
        className="absolute pointer-events-none object-cover"
        style={{ width: 855, height: 855, left: -214, top: -11 }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(246,244,234,0.6)', backdropFilter: 'blur(16.25px)' }}
      />

      <StatusBar />

      {/* Live transcript */}
      <div className="absolute top-[163px] left-0 w-full flex justify-center px-[40px]">
        <span
          className="text-[24px] font-semibold leading-[1.3] text-center"
          style={{ color: 'rgba(0,0,0,0.65)', minHeight: 31 }}
        >
          {displayed}
          {displayed.length < TRANSCRIPT.length && (
            <span className="animate-pulse">|</span>
          )}
        </span>
      </div>

      {/* Bubble */}
      <div
        className="absolute rounded-full border border-[#f0efee]"
        style={{
          width: 800, height: 800,
          left: '50%', transform: 'translateX(-50%)',
          top: 643,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.74), rgba(255,255,255,0.09) 26.5%)',
        }}
      />

      {/* Mic image — slightly pulse when speaking */}
      <div
        className="absolute animate-pulse"
        style={{ left: -1, top: 243, width: 392, height: 475, animationDuration: '1.2s' }}
      >
        <img src={MIC_IMAGE} alt="mic" className="w-full h-full object-contain" />
      </div>

      {/* Release hint */}
      <div className="absolute bottom-[80px] left-0 w-full flex justify-center">
        <span className="text-[14px] font-semibold" style={{ color: 'rgba(0,0,0,0.65)' }}>
          松手停止录制
        </span>
      </div>

      <button
        className="absolute inset-0 w-full h-full bg-transparent cursor-pointer"
        onClick={onRelease}
      />
    </div>
  );
}
