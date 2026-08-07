import { useT } from '../../i18n'
const MEHMAAN_BANNER = '/figma/mehmaan-banner-bg.svg'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, Georgia, serif'

/** Desktop-style "Invite Mehmaan" banner card — links out to the ITS invite flow.
 *  CTA: "Edit" once at least one guest has been invited (`invited`), else "View" when the quota is
 *  spent (`full`), else "Invite now". */
export function InviteMehmaanCard({ onClick, full = false, invited = false }: { onClick: () => void; full?: boolean; invited?: boolean }) {
  const { t, tx } = useT()
  return (
    <div data-tour="invite-mehmaan" className="relative overflow-hidden rounded-[16px] border border-[#e7dfc9] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.18)]">
      <img src={MEHMAAN_BANNER} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" />
      <div className="relative flex items-center justify-between gap-[16px] px-[20px] py-[18px]">
        <div className="flex min-w-0 flex-col gap-[8px]">
          <p className="text-[22px] leading-[24px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Invite Mehmaan')} />
          <p className="text-[13px] leading-[18px] text-[#3d4b44]" style={{ fontFamily: FONT_SANS, fontWeight: 500 }} {...tx('Invite guests with their ITS ID — they appear once they accept.')} />
        </div>
        <button type="button" onClick={onClick}
          className="h-[42px] w-[108px] shrink-0 rounded-[14px] bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] shadow-[0_6px_18px_-6px_rgba(21,64,47,0.22)] transition-all duration-200 hover:from-[#e7d3a2] hover:to-[#cfab65] hover:shadow-[0_10px_26px_-8px_rgba(21,64,47,0.3)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/30">
          <span className="text-[14px] leading-none tracking-[0.2px] text-[#1f5a44]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>
            {invited ? t('Edit') : full ? t('View') : t('Invite now')}
          </span>
        </button>
      </div>
    </div>
  )
}
