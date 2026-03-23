import StatusBar from '../components/StatusBar';
import { MAP_MAIN, USER_AVATAR_REC, SNAPPED_PHOTO, ICON_BACK, ICON_ARROW_UP2 } from '../assets';

export default function SnappedPhoto({ transcript, onBack, onPost }) {
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

      {/* Back button — left:24 top:72 size:48 */}
      <button
        onClick={onBack}
        className="absolute left-[24px] top-[72px] w-[48px] h-[48px] rounded-full flex items-center justify-center cursor-pointer"
        style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.03)' }}
      >
        <img src={ICON_BACK} alt="back" className="w-[20px] h-[20px]" />
      </button>

      {/* Speech bubble — left:56 top:182 */}
      <div
        className="absolute px-[16px] py-[8px] rounded-[24px]"
        style={{
          left: 56, top: 182,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(4.35px)',
          border: '1px solid rgba(255,255,255,0.4)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          maxWidth: 212,
        }}
      >
        <p className="text-[20px] font-semibold leading-[1.3]" style={{ color: 'rgba(0,0,0,0.65)' }}>
          {transcript}
        </p>
      </div>

      {/* Connector dot — left:53 top:226 */}
      <div className="absolute w-[8px] h-[8px] bg-white rounded-full" style={{ left: 53, top: 226 }} />

      {/* Avatar — left:23 top:225 size:40 */}
      <div
        className="absolute w-[40px] h-[40px] rounded-full overflow-hidden"
        style={{ left: 23, top: 225, border: '2px solid white' }}
      >
        <img src={USER_AVATAR_REC} alt="me" className="w-full h-full object-cover" />
      </div>

      {/* Snapped photo — left:4 top:204 size:382 rounded-40 */}
      <div className="absolute overflow-hidden" style={{ left: 4, top: 204, width: 382, height: 382, borderRadius: 40 }}>
        <img src={SNAPPED_PHOTO} alt="photo" className="w-full h-full object-cover" />
      </div>

      {/* Hint text — centered top:616 */}
      <div className="absolute w-full flex justify-center" style={{ top: 616 }}>
        <span className="text-[15px] font-semibold" style={{ color: 'rgba(0,0,0,0.48)' }}>
          拍一下当下的画面
        </span>
      </div>

      {/* Post button — left:145 top:700 size:100 */}
      <button
        onClick={onPost}
        className="absolute flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        style={{ left: 145, top: 700, width: 100, height: 100, borderRadius: 999, background: 'black', border: 'none' }}
      >
        <img src={ICON_ARROW_UP2} alt="post" className="w-[40px] h-[40px]" />
      </button>
    </div>
  );
}
