import { SIGNAL, CONNECTION, BATTERY } from '../assets';

export default function StatusBar() {
  return (
    <div className="absolute left-0 top-0 w-[390px] h-[47px] z-50 overflow-clip pointer-events-none">
      <span className="absolute left-[32px] top-[14px] text-[17px] font-semibold tracking-[-0.4px] text-black">
        8:00
      </span>
      <img src={SIGNAL}     alt="" className="absolute right-[84px] top-[17px] h-[12px] w-[20px]" />
      <img src={CONNECTION} alt="" className="absolute right-[60px] top-[17px] h-[12px] w-[17px]" />
      <img src={BATTERY}    alt="" className="absolute right-[24px] top-[16px] h-[13px] w-[27px]" />
    </div>
  );
}
