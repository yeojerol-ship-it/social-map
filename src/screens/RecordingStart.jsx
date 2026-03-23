import StatusBar from '../components/StatusBar';
import { MAP_MAIN, MIC_IMAGE } from '../assets';

export default function RecordingStart({ onRelease }) {
  return (
    <div className="relative w-[390px] h-[844px] rounded-[44px] overflow-hidden bg-white">
      {/* Map background */}
      <img
        src={MAP_MAIN} alt=""
        className="absolute pointer-events-none object-cover"
        style={{ width: 855, height: 855, left: -214, top: -11 }}
      />
      {/* Frosted overlay */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(246,244,234,0.6)', backdropFilter: 'blur(16.25px)' }}
      />

      <StatusBar />

      {/* Placeholder "说一说" */}
      <div className="absolute top-[163px] left-0 w-full flex justify-center">
        <span
          className="text-[24px] font-semibold leading-[1.3]"
          style={{ color: 'rgba(0,0,0,0.34)' }}
        >
          说一说
        </span>
      </div>

      {/* White bubble up from bottom */}
      <div
        className="absolute rounded-full border border-[#f0efee]"
        style={{
          width: 800, height: 800,
          left: '50%', transform: 'translateX(-50%)',
          top: 643,
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.74), rgba(255,255,255,0.09) 26.5%)',
        }}
      />

      {/* Mic image */}
      <div
        className="absolute"
        style={{ left: -21, top: 249, width: 431, height: 523 }}
      >
        <img src={MIC_IMAGE} alt="mic" className="w-full h-full object-contain" />
      </div>

      {/* Release hint */}
      <div className="absolute bottom-[80px] left-0 w-full flex justify-center">
        <span className="text-[14px] font-semibold" style={{ color: 'rgba(0,0,0,0.65)' }}>
          松手停止录制
        </span>
      </div>

      {/* Invisible tap target to advance */}
      <button
        className="absolute inset-0 w-full h-full bg-transparent cursor-pointer"
        onClick={onRelease}
      />
    </div>
  );
}
