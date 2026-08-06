/**
 * Event Timeline triggers — the calendar + milestone schedule now lives on its own
 * full page (screens/EventJourney.tsx). These are just the entry points:
 *
 *   • EventTimelineButton — desktop: an outlined "Event timeline" CTA that sits in the
 *     Miqaat Detail right card, below the primary action. Navigates to the journey page.
 *   • EventTimelineFab    — mobile: the floating gold pill (unchanged look), navigates
 *     to the same full page.
 */

const MUL = 'Mulish, system-ui, sans-serif'

function CalendarIcon({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" className="shrink-0">
      <rect x="2" y="3.5" width="14" height="12" rx="2.5" stroke={color} strokeWidth="1.5" />
      <path d="M2 7.5h14M6 1.5v4M12 1.5v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Desktop — outlined "Event timeline" CTA placed in the Miqaat Detail right card. */
export function EventTimelineButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour="event-timeline"
      className="flex h-[48px] w-full items-center justify-center gap-[10px] rounded-[12px] border border-[#1f5a44] bg-white text-[#1f5a44] transition-colors hover:bg-[#f3f7f4]"
      style={{ fontFamily: MUL, fontWeight: 700 }}
    >
      <span className="text-[15px]">Event timeline</span>
      <CalendarIcon size={18} color="#1f5a44" />
    </button>
  )
}

/** Mobile — full-width gold Event-timeline CTA that lives INSIDE the sticky footer (replaces the
 *  floating pill so the detail page has a single floating element — Ask Help — not two). */
export function EventTimelineFooter({ onClick }: { onClick: () => void }) {
  return (
    <div className="sticky-cta w-full px-[16px] py-2">
      <button
        type="button"
        onClick={onClick}
        data-tour="event-timeline"
        className="flex h-[52px] w-full items-center justify-center gap-[10px] rounded-[16px] bg-[#c6a44a] shadow-[0px_16px_36px_-14px_rgba(21,64,47,0.4)] transition-transform active:scale-[0.99]"
        style={{ fontFamily: MUL }}
      >
        <span className="text-[15px] font-bold text-[#1a3326]">Event timeline</span>
        <CalendarIcon size={18} color="#1a3326" />
      </button>
    </div>
  )
}

/** Mobile — floating gold pill (look unchanged); navigates to the full Event Journey page. */
export function EventTimelineFab({ onClick }: { onClick: () => void }) {
  return (
    <div className="fixed right-[16px] bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-[60] sm:hidden">
      <button
        type="button"
        onClick={onClick}
        data-tour="event-timeline"
        className="flex items-center gap-[8px] rounded-full bg-[#c6a44a] px-[18px] py-[11px] shadow-[0_10px_28px_-8px_rgba(21,64,47,0.45)] transition-transform hover:-translate-y-[1px] active:translate-y-0"
        style={{ fontFamily: MUL }}
      >
        <span className="text-[15px] font-bold text-[#1a3326]">Event timeline</span>
        <CalendarIcon size={18} color="#1a3326" />
      </button>
    </div>
  )
}
