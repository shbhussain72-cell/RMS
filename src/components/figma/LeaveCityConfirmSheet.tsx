import BottomSheet from './BottomSheet'

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

/**
 * Confirmation dialog shown before leaving the Host/Relay City allocation page
 * while a queue/reservation attempt is in progress. Built on the shared BottomSheet
 * (centered modal on web / bottom sheet on mobile) — same design system as the
 * logout confirmation: amber caution icon, heading, description, Cancel (secondary)
 * / Confirm (primary) actions.
 */
export default function LeaveCityConfirmSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      footer={
        <div className="flex gap-[10px]">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] border border-[#e7dfc9] bg-white transition-all duration-200 hover:bg-[#faf8f2] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/25"
          >
            <span className="text-[15px] font-bold text-[#15402f]" style={{ fontFamily: FONT }}>Cancel</span>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-[52px] flex-1 items-center justify-center gap-[8px] rounded-[14px] bg-[#d2632b] shadow-[0_6px_22px_-8px_rgba(210,99,43,0.4)] transition-all duration-200 hover:bg-[#bb5523] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d2632b]/35"
          >
            <span className="text-[15px] font-bold text-white" style={{ fontFamily: FONT }}>Confirm</span>
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
        <span className="flex size-[68px] items-center justify-center rounded-full bg-[#fdf0db]">
          <span className="flex size-[50px] items-center justify-center rounded-full bg-[#d2632b]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[26px]">
              <path
                d="M12 9v4.5M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
        <h2 className="mt-[16px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }}>Leave city selection?</h2>
        <p className="mt-[10px] text-[15px] font-semibold leading-[21px] text-[#23302a]" style={{ fontFamily: FONT }}>
          Are you sure you want to leave?
        </p>
        <p className="mt-[8px] max-w-[340px] text-[15px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }}>
          You&apos;ll lose your place in the queue. Rejoining will require waiting again.
        </p>
      </div>
    </BottomSheet>
  )
}
