import BottomSheet from './BottomSheet'
import { useT } from '../../i18n'

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

/**
 * Compact, centered confirmation dialog shown before signing the user out.
 * Built on the shared BottomSheet (same design system as every other popup):
 * red logout icon, "Log Out?" heading, description, then Cancel (secondary) /
 * Log Out (primary, red) actions.
 */
export default function LogoutConfirmSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}) {
     const { tx } = useT()
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      footer={
        <div className="flex gap-[10px]">
          <button
            type="button"
            onClick={onClose}
            className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] border border-[#e7dfc9] bg-white transition-colors hover:bg-[#faf8f2]"
          >
            <span className="text-[15px] font-bold text-[#15402f]" style={{ fontFamily: FONT }} {...tx('Cancel')} />
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-[52px] flex-1 items-center justify-center gap-[8px] rounded-[14px] bg-[#c0392b] shadow-[0_6px_22px_-8px_rgba(192,57,43,0.4)] transition-colors hover:bg-[#a93226]"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17l5-5-5-5M21 12H9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[15px] font-bold text-white" style={{ fontFamily: FONT }} {...tx('Log Out')} />
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
        <span className="flex size-[68px] items-center justify-center rounded-full bg-[#fdecea]">
          <span className="flex size-[50px] items-center justify-center rounded-full bg-[#c0392b]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[26px]">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17l5-5-5-5M21 12H9" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
        <h2 className="mt-[16px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Log Out?')} />
        <p className="mt-[10px] max-w-[320px] text-[15px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }} {...tx('Are you sure you want to log out of your Miqaat Registration account?')} />
      </div>
    </BottomSheet>
  )
}
