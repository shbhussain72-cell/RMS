const FONT = 'Mulish, system-ui, sans-serif'

/** Raza letter thumbnail — a preview crop of the actual letter image. */
function RazaThumbnail() {
  return (
    <div className="h-[76px] w-[60px] shrink-0 overflow-hidden rounded-[10px] border border-[#e3cd96] bg-[#fdf8ee] shadow-[0_2px_8px_-4px_rgba(21,64,47,0.3)]">
      <img src="/figma/raza-letter.jpg" alt="Raza letter" className="size-full object-cover" />
    </div>
  )
}

/**
 * "Raza status" — while pending there's nothing to show/view yet, so it's just the plain compact
 * status pill (no thumbnail, no button). Once issued, it becomes the wide card — thumbnail + status +
 * a "View" pill that navigates to the in-app Raza page (never a download/new tab).
 */
export function RazaStatusCard({ issued, onView, className = '' }: { issued: boolean; onView?: () => void; className?: string }) {
  if (!issued) {
    return (
      <div className={`flex h-[48px] items-center justify-between rounded-[12px] px-[16px] ${className}`} style={{ background: '#fff6e5' }}>
        <span className="text-[15px] text-[#3d3d3a]" style={{ fontFamily: FONT, fontWeight: 500 }}>Raza status</span>
        <span className="flex items-center gap-[7px]">
          <span className="size-[7px] shrink-0 rounded-full bg-[#b8821e]" />
          <span className="text-[15px] font-extrabold tracking-[0.2px] text-[#b8821e]" style={{ fontFamily: FONT }}>Pending</span>
        </span>
      </div>
    )
  }

  // The whole card is clickable (not just the "View" pill) — but stops propagation so a card that's
  // itself nested inside another clickable card (e.g. the Home banner) doesn't also trigger that.
  const clickable = !!onView
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? (e) => { e.stopPropagation(); onView!() } : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onView!() } } : undefined}
      className={`flex items-center gap-[14px] rounded-[16px] px-[16px] py-[12px] ${clickable ? 'cursor-pointer' : ''} ${className}`}
      style={{ background: '#e7f1ea' }}
    >
      <RazaThumbnail />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-[10px] gap-y-[2px]">
        <span className="text-[17px] text-[#23302a]" style={{ fontFamily: 'Marcellus, Georgia, serif' }}>Raza status</span>
        <span className="flex items-center gap-[6px]">
          <span className="size-[7px] shrink-0 rounded-full bg-[#1f7a4d]" />
          <span className="text-[17px] font-extrabold tracking-[0.2px] text-[#1f7a4d]" style={{ fontFamily: FONT }}>Issued</span>
        </span>
      </div>
      {onView && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onView() }}
          className="inline-flex h-[42px] shrink-0 items-center gap-[6px] rounded-full border border-[#e0d7bc] bg-white px-[20px] text-[15px] font-bold text-[#15402f] transition-colors hover:bg-[#faf6ec]"
          style={{ fontFamily: FONT }}
        >
          View
          <svg viewBox="0 0 16 16" fill="none" className="size-[13px]">
            <path d="M3 8h9M9 5l3 3-3 3" stroke="#15402f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
