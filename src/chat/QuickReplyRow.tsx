import { ChevronGlyph } from './icons'
import type { ChatOption } from './types'

const FONT_SANS = 'Mulish, system-ui, sans-serif'

/** Pastel card fills for the `grid` variant — a soft diagonal gradient from a *pale* tint into pure
 *  white, so the colour reads as a gentle wash rather than a solid block (white-dominant, subtle).
 *  The icon itself stays the brand deep green across every card (background varies, icon colour doesn't). */
const GRID_PALETTE: Record<NonNullable<ChatOption['color']>, string> = {
  blue: 'linear-gradient(135deg, #eaf1fe 0%, #ffffff 78%)',
  pink: 'linear-gradient(135deg, #fdeef6 0%, #ffffff 78%)',
  green: 'linear-gradient(135deg, #e8f9f0 0%, #ffffff 78%)',
  amber: 'linear-gradient(135deg, #fdf7e2 0%, #ffffff 78%)',
  purple: 'linear-gradient(135deg, #f1ecfd 0%, #ffffff 78%)',
}

/** The chat's quick-reply control. `list` = full-width rows with a leading icon tile + chevron
 *  (events — the ClickUp-Brain suggestion-row look); `grid` = 2-column colourful cards (the
 *  category picker); `chip` = wrapped compact pills (destination cities/zones, where there are
 *  many). Nothing reusable for this existed in the codebase (the closest precedent,
 *  ZoneMoveDropdown, is a floating anchored dropdown). */
export default function QuickReplyRow({
  options,
  onPick,
  variant = 'chip',
}: {
  options: ChatOption[]
  onPick: (value: string) => void
  variant?: 'chip' | 'list' | 'grid'
}) {
  if (!options.length) {
    return (
      <p className="text-[13px] text-[#8a938e]" style={{ fontFamily: FONT_SANS }}>
        Nothing available right now.
      </p>
    )
  }

  if (variant === 'list') {
    return (
      <div className="flex flex-col gap-[8px]">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => onPick(o.value)}
            className="group flex items-center gap-[12px] rounded-[14px] border border-solid border-[#e7dfc9] bg-white px-[14px] py-[12px] text-left transition-all hover:border-[#1f5a44] hover:bg-[#f4faf6] hover:shadow-[0_4px_14px_-8px_rgba(21,64,47,0.35)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: FONT_SANS }}
          >
            <span className="flex size-[36px] shrink-0 items-center justify-center rounded-[10px] bg-[#eaf3ed] text-[#1f5a44]">
              {o.icon ?? <span className="text-[15px] font-bold">{o.label.charAt(0)}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-[#23302a]">{o.label}</span>
              {o.sublabel && (
                <span className={`block truncate text-[12px] ${o.sublabelTone === 'closed' ? 'text-[#c0392b]' : o.sublabelTone === 'open' ? 'text-[#2e7d5b]' : 'text-[#8a938e]'}`}>{o.sublabel}</span>
              )}
            </span>
            <ChevronGlyph className="size-[16px] shrink-0 text-[#c3ccc6] transition-colors group-hover:text-[#1f5a44]" />
          </button>
        ))}
      </div>
    )
  }

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-[12px]">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={o.disabled}
            onClick={() => onPick(o.value)}
            className="group flex flex-col items-start gap-[11px] rounded-[18px] p-[15px] text-left shadow-[0_6px_16px_-8px_rgba(43,37,82,0.22)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-[3px] hover:shadow-[0_16px_30px_-10px_rgba(43,37,82,0.32)] active:-translate-y-[1px] active:duration-75 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[0_6px_16px_-8px_rgba(43,37,82,0.22)]"
            style={{ backgroundImage: GRID_PALETTE[o.color ?? 'blue'], fontFamily: FONT_SANS }}
          >
            <span className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-white/75 text-[#1f5a44] shadow-[0_2px_6px_-2px_rgba(43,37,82,0.25)] transition-transform duration-200 ease-out group-hover:scale-[1.08] group-hover:-rotate-3">
              {o.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-bold leading-[17px] text-[#23302a]">{o.label}</span>
              {o.sublabel && <span className="block text-[11px] leading-[14px] text-[#565f5a]">{o.sublabel}</span>}
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-[8px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onPick(o.value)}
          className="flex flex-col items-start rounded-[14px] border border-solid border-[#e7dfc9] bg-white px-[14px] py-[9px] text-left transition-colors hover:border-[#1f5a44] hover:bg-[#f4faf6] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ fontFamily: FONT_SANS }}
        >
          <span className="text-[13.5px] font-bold text-[#23302a]">{o.label}</span>
          {o.sublabel && <span className="text-[11px] text-[#8a938e]">{o.sublabel}</span>}
        </button>
      ))}
    </div>
  )
}
