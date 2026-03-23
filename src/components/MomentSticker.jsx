/**
 * MomentSticker — the map pin cluster component.
 * Layout (matching Figma):
 *   - 2 rotated photo thumbnails (back layer)
 *   - 1 sticker emoji (front, rotated)
 *   - Small circular avatar + frosted speech bubble + white dot connector
 */
export default function MomentSticker({ style, photo1, photo2, emoji, ramen, avatar, text, time }) {
  return (
    <div className="absolute" style={style}>
      {/* Back photos */}
      <div className="relative w-[90px] h-[90px]">
        {/* Photo 1 - tilted left */}
        <div className="absolute top-[15px] left-[20px] -rotate-12">
          <div className="w-[52px] h-[52px] rounded-[10px] border-2 border-[#f6f4ea] overflow-hidden">
            <img src={photo1} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
        {/* Photo 2 - tilted right */}
        <div className="absolute top-[8px] left-[38px] rotate-[10deg]">
          <div className="w-[60px] h-[60px] rounded-[10px] border-2 border-[#f6f4ea] overflow-hidden">
            <img src={photo2} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
        {/* Sticker emoji */}
        <div className="absolute top-[10px] left-[2px] -rotate-[12deg]">
          <img src={emoji} alt="" className="w-[34px] h-[34px] object-contain" />
        </div>
        {/* Ramen/secondary sticker - small rotated */}
        <div className="absolute top-[30px] right-[-4px] rotate-[7deg]">
          <img src={ramen} alt="" className="w-[24px] h-[34px] object-contain" />
        </div>
      </div>

      {/* Avatar + bubble + connector */}
      <div className="relative mt-[2px] flex items-start gap-[4px]">
        {/* Avatar */}
        <div className="shrink-0 w-[30px] h-[30px] rounded-full border-2 border-white overflow-hidden mt-[6px]">
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        </div>
        {/* Connector dot + bubble */}
        <div className="relative">
          <div className="w-[7px] h-[7px] bg-white rounded-full absolute left-[-3px] bottom-[-4px]" />
          <div
            className="backdrop-blur-[4px] bg-white/90 border border-white/40 shadow-[0px_2px_12px_rgba(0,0,0,0.06)] px-[8px] py-[5px] rounded-tl-[10px] rounded-tr-[10px] rounded-br-[10px] rounded-bl-[6px] flex items-center gap-[4px]"
          >
            <span className="text-[12px] font-semibold text-black/65 whitespace-nowrap leading-[1.3]">{text}</span>
            <span className="text-[10px] text-black/40 whitespace-nowrap leading-[1.3]">{time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
