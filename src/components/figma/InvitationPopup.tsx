import { createPortal } from 'react-dom'
import { miqaats } from '../../data/seed'
import { useT } from '../../i18n'
import { DateLine } from '../DateLine'

const FM: React.CSSProperties = { fontFamily: 'Marcellus, serif' }
const FMU: React.CSSProperties = { fontFamily: 'Mulish, system-ui, sans-serif' }

const CARD_BG = '/figma/miqaat-card-bg.png'
/** The one scenario this popup currently models — who invited the user, and which event. */
const INVITER_NAME = 'Mufaddal bhai'
const MIQAAT_ID = 'eg-cityopen'

/** "Invitation received" popup — event image/name/date/time, who invited the user, and
 *  Accept/Decline. Replaces the old dedicated full-page "Join group" screen for this notification. */
export function InvitationPopup({
  onClose,
  onAccept,
  onDecline,
}: {
  onClose: () => void
  onAccept: () => void
  onDecline: () => void
}) {
  // Above the early return below — a hook after a conditional `return` breaks the rules of hooks.
  const { tx, t, td, tdAuthored } = useT()
  const m = miqaats.find((x) => x.id === MIQAAT_ID)
  if (!m) return null

  // Portalled straight to <body> — the header this can be triggered from applies an inline
  // `transform` for its scroll-hide animation, which makes it a containing block for any
  // `position: fixed` descendant, squashing an in-place popup into that header's own box.
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="max-h-[90dvh] w-full max-w-[400px] overflow-y-auto overscroll-contain rounded-t-[24px] bg-white px-[20px] pb-[24px] pt-[10px] shadow-[0_-8px_40px_rgba(0,0,0,0.2)] sm:max-h-[85vh] sm:rounded-[20px] sm:px-[24px] sm:py-[24px] sm:shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        {/* drag handle — mobile only */}
        <div className="mb-[14px] flex justify-center sm:hidden">
          <div className="h-[4px] w-[36px] rounded-full bg-[#d9d2c2]" />
        </div>

        {/* Event image, name, date & time */}
        <div className="relative h-[140px] w-full overflow-hidden rounded-[14px]">
          <img src={m.image ?? CARD_BG} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[rgba(10,45,33,0.15)] to-[rgba(10,45,33,0.8)]" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="absolute end-[10px] top-[10px] flex size-[28px] items-center justify-center rounded-full bg-black/35 transition-colors hover:bg-black/50"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-[14px]">
              <path d="M5 5l10 10M15 5L5 15" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div className="absolute inset-x-0 bottom-0 p-[16px]">
            <h2 className="text-[19px] leading-[24px] text-white" style={FM} {...tdAuthored(m.title)} />
            <div className="mt-[6px] flex flex-wrap items-center gap-x-[14px] gap-y-[3px]">
              <span className="text-[12px] text-[rgba(255,255,255,0.9)]" style={FMU}><DateLine value={m.dateLabel} /></span>
              <span className="text-[12px] text-[rgba(255,255,255,0.9)]" style={FMU} {...td(m.timeLabel)} />
            </div>
          </div>
        </div>

        {/* Who invited the user */}
        <div className="mt-[16px] flex items-start gap-[12px] rounded-[12px] border border-[#e7dabd] bg-[#fef9f0] p-[14px]">
          <div className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-[#d4a857]">
            <svg viewBox="0 0 22 22" fill="none" className="size-[18px] text-white">
              <path d="M14.667 19.25v-1.833A3.667 3.667 0 0011 13.75H4.583a3.667 3.667 0 00-3.666 3.667v1.833" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7.792 10.083a3.667 3.667 0 100-7.333 3.667 3.667 0 000 7.333z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18.333 7.333v5.5M15.583 10.083h5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold leading-[19px] text-[#1a2a23]" style={FMU}>Invited by {INVITER_NAME}</p>
            <p className="mt-[3px] text-[13px] leading-[18px] text-[#5a6660]" style={FMU}>
              {INVITER_NAME} has invited you to join their group for {m.title}.
            </p>
          </div>
        </div>

        {/* Accept / Decline */}
        <div className="mt-[18px] flex items-center gap-[10px]">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-[12px] border border-[#b23b3b] py-[13px] text-[14px] font-semibold text-[#b23b3b] transition-colors hover:bg-[#fdf3f3]"
            style={FMU} {...tx('Decline')} />
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-[12px] bg-[#1f5a44] py-[13px] text-[14px] font-semibold text-white transition-colors hover:bg-[#17472f]"
            style={FMU} {...tx('Accept invitation')} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
