import { useT } from '../../i18n'
const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, Georgia, serif'

/**
 * Detail-page "Araz" card — shown in place of Invite Mehmaan for events with Araz enabled. Araz is an
 * early preferred-city submission (Host + Relay), a preference only that does NOT confirm or reserve a
 * final allocation. `remainingLabel` shows how many preferences are still available; once submitted,
 * the CTA flips to "View preferences". Self-contained background (CSS gradient — no image asset).
 */
export function ArazCard({ onClick, remainingLabel, submitted = false }: { onClick: () => void; remainingLabel: string; submitted?: boolean }) {
  const { t, tx } = useT()
  return (
    <div className="relative overflow-hidden rounded-[16px] border border-[#e7dfc9] shadow-[0_4px_18px_-10px_rgba(21,64,47,0.18)]" style={{ background: 'linear-gradient(135deg,#f3f7f2 0%,#fbf7ec 60%,#f7efd8 100%)' }}>
      <div className="relative flex flex-col gap-[14px] px-[20px] py-[18px]">
        <div className="flex items-center justify-between gap-[16px]">
          <div className="flex min-w-0 flex-col gap-[8px]">
            <p className="text-[22px] leading-[24px] tracking-[0.2px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx('Araz')} />
            <p className="text-[13px] leading-[18px] text-[#3d4b44]" style={{ fontFamily: FONT_SANS, fontWeight: 500 }} {...tx('Submit your preferred Host and Relay City selections early. This is a preference only — it does not guarantee your final city allocation.')} />
          </div>
          <button type="button" onClick={onClick}
            className="h-[42px] w-[120px] shrink-0 rounded-[14px] bg-gradient-to-b from-[#e3cd96] to-[#c9a45c] shadow-[0_6px_18px_-6px_rgba(21,64,47,0.22)] transition-all duration-200 hover:from-[#e7d3a2] hover:to-[#cfab65] hover:shadow-[0_10px_26px_-8px_rgba(21,64,47,0.3)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f5a44]/30">
            <span className="text-[14px] leading-none tracking-[0.2px] text-[#1f5a44]" style={{ fontFamily: FONT_SANS, fontWeight: 700 }}>
              {submitted ? 'Edit Araz' : t('Araz')}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-[8px] rounded-[10px] border border-[#e7dfc9] bg-white/70 px-[12px] py-[9px]">
          <svg viewBox="0 0 18 18" fill="none" className="size-[16px] shrink-0">
            <path d="M9 2l1.9 3.9 4.3.6-3.1 3 .7 4.3L9 11.8 5.2 13.8l.7-4.3-3.1-3 4.3-.6L9 2Z" stroke="#c2a04e" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span className="text-[12.5px] font-bold text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>{remainingLabel}</span>
        </div>
      </div>
    </div>
  )
}
