import BottomSheet from './BottomSheet'
import { useT } from '../../i18n'

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

/**
 * Shown when the user taps Continue/Confirm while one or more members are still left out. Reused in
 * two places: Add People (members not added to the group) and Zone Selection (members not allocated
 * to a zone). Same amber-caution design as Leave-city / Logout: Cancel (go back) vs Confirm (proceed
 * without them). `context` only swaps the descriptive line; the heading and buttons stay the same.
 */
export default function MissedMemberSheet({
  open,
  onClose,
  onConfirm,
  count,
  context = 'group',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  /** How many members are left out — shown as a count (names are omitted; the list could be long). */
  count: number
  /** Which flow this is warning about: 'group' (Add People) or 'zone' (Zone Selection). */
  context?: 'group' | 'zone'
}) {
     const { tx } = useT()
  const noun = context === 'zone' ? 'allocated to a zone' : 'added to your group'
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
            <span className="text-[15px] font-bold text-[#15402f]" style={{ fontFamily: FONT }} {...tx('Cancel')} />
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-[52px] flex-1 items-center justify-center gap-[8px] rounded-[14px] bg-[#1f5a44] shadow-[0_6px_22px_-8px_rgba(21,64,47,0.4)] transition-all duration-200 hover:bg-[#184a37] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/35"
          >
            <span className="text-[15px] font-bold text-white" style={{ fontFamily: FONT }} {...tx('Yes, confirm')} />
          </button>
        </div>
      }
    >
      <div className="flex flex-col items-center px-[6px] pt-[8px] pb-[4px] text-center">
        <span className="flex size-[68px] items-center justify-center rounded-full bg-[#e4efe7]">
          <span className="flex size-[50px] items-center justify-center rounded-full bg-[#1f5a44]">
            <svg viewBox="0 0 24 24" fill="none" className="size-[26px]">
              <path
                d="M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6"
                stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
        <h2 className="mt-[16px] text-[24px] leading-[30px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('You missed some members')} />
        <p className="mt-[10px] max-w-[340px] text-[15px] leading-[21px] text-[#5a6660]" style={{ fontFamily: FONT }}>
          {count === 1
            ? `1 member is not ${noun} yet. Continue without them?`
            : `${count} members are not ${noun} yet. Continue without them?`}
        </p>
      </div>
    </BottomSheet>
  )
}
