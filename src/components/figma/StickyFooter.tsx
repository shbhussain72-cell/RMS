import type { ReactNode } from 'react'

const FONT = 'Mulish, system-ui, sans-serif'

/**
 * The single standardized sticky footer CTA used across every flow — Registration,
 * Host/Relay city, Zone selection, Review & Submit, Confirmation, and Modify-reservation.
 * The primary button has FIXED dimensions everywhere (h-52 / min-w-120 / rounded-14 / px-24 /
 * text-15 bold) so it reads identically on web and mobile regardless of screen or state.
 *
 * `children` renders just above the card (e.g. the relay flow's mobile allocated-count row).
 */
export default function StickyFooter({
  caption,
  title,
  button,
  onButton,
  buttonDisabled = false,
  children,
  dataTour,
  secondary,
  back,
}: {
  caption: ReactNode
  title: ReactNode
  /** Primary CTA — omit to render only the secondary action (e.g. an empty-state "Skip"-only footer). */
  button?: ReactNode
  onButton?: () => void
  buttonDisabled?: boolean
  children?: ReactNode
  /** Optional walkthrough anchor (`data-tour`) placed on the footer root — used by the tour. */
  dataTour?: string
  /** Optional secondary action (e.g. "Skip") rendered beside the primary button. */
  secondary?: { label: ReactNode; onClick: () => void }
  /** Optional desktop-only icon+text "Go back" (no button chrome) before the primary CTA — the chevron
   *  slides left on hover, matching the Breadcrumb's "Go back". Hidden on mobile. Defaults label to "Go back". */
  back?: { label?: ReactNode; onClick: () => void }
}) {
  return (
    <div data-tour={dataTour} className="sticky-cta w-full px-[16px] py-2 sm:px-[var(--content-px)] sm:pt-6 sm:pb-4">
      {children}
      <div className="flex items-center justify-between gap-[12px] rounded-[18px] border border-[#e7dfc9] bg-[#fffdf8] px-4 py-[10px] shadow-[0px_22px_50px_-18px_rgba(21,64,47,0.3),0px_8px_20px_-10px_rgba(21,64,47,0.16)]">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase leading-[16px] tracking-[0.5px] text-[#8a938e]" style={{ fontFamily: FONT }}>
            {caption}
          </p>
          <p className="truncate text-[15px] font-extrabold leading-[22px] text-[#15402f]" style={{ fontFamily: FONT }}>
            {title}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-[10px]">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              className="group hidden h-[52px] shrink-0 items-center gap-[5px] ps-[2px] pe-[8px] text-[#5a6660] transition-colors duration-150 hover:text-[#15402f] focus-visible:text-[#15402f] focus-visible:outline-none sm:flex"
            >
              <svg viewBox="0 0 24 24" className="size-[16px] shrink-0 transition-transform duration-200 group-hover:-translate-x-[2px]" fill="none" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="whitespace-nowrap text-[14px] font-bold" style={{ fontFamily: FONT }}>
                {back.label ?? 'Go back'}
              </span>
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="flex h-[52px] shrink-0 items-center justify-center gap-[6px] rounded-[14px] border border-[#e7dfc9] bg-white px-[18px] transition-colors hover:border-[#c2a04e] hover:bg-[#faf8f2]"
            >
              <span className="whitespace-nowrap text-[14px] font-bold text-[#5a6660]" style={{ fontFamily: FONT }}>
                {secondary.label}
              </span>
            </button>
          )}
          {button && (
            <button
              type="button"
              disabled={buttonDisabled}
              onClick={onButton}
              className="flex h-[52px] min-w-[120px] shrink-0 items-center justify-center gap-[8px] rounded-[14px] bg-[#1f5a44] px-[24px] shadow-[0_6px_22px_-8px_rgba(21,64,47,0.18)] transition-colors disabled:opacity-50"
            >
              <span className="whitespace-nowrap text-[15px] font-bold text-white" style={{ fontFamily: FONT }}>
                {button}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
