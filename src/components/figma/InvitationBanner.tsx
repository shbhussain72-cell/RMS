import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'

const SERIF = 'Marcellus, Georgia, serif'
const SANS = 'Mulish, system-ui, sans-serif'

/**
 * In-app notification banner shown once on the Home screen after a non-local member registers for an
 * event that supports invitations. Slides down from below the header, fades in, lingers, then leaves
 * — a subtle ~350ms ease. Tapping the card (or "View invitation") opens the Invitation Received UI;
 * the ✕ dismisses it. Portalled to <body> so the sticky header's inline `transform` (its scroll-hide
 * animation) can't trap this fixed element inside the header's box.
 *
 * Design mirrors the app's info/success notifications: cream card, Marcellus title + Mulish body,
 * the Invitation-blue accent used across the notification list, brand-green "View invitation" link.
 */
export function InvitationBanner({
  open,
  onView,
  onClose,
}: {
  open: boolean
  onView: () => void
  onClose: () => void
}) {
     const { tx, t } = useT()
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const reduceMotion = useRef(false)

  useEffect(() => {
    reduceMotion.current =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    if (open) {
      setMounted(true)
      // next frame → transition from the off-screen/faded state to visible
      const r = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    if (reduceMotion.current) { setMounted(false); return }
    const t = setTimeout(() => setMounted(false), 340)
    return () => clearTimeout(t)
  }, [open])

  if (!mounted) return null

  const ease = reduceMotion.current
    ? undefined
    : 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease'

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-[72px] z-[60] flex justify-center px-[16px] sm:top-[84px] sm:justify-end sm:px-[24px]"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto w-full max-w-[440px]"
        style={{
          transform: shown ? 'translateY(0)' : 'translateY(-14px)',
          opacity: shown ? 1 : 0,
          transition: ease,
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onView}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView() } }}
          className="relative flex cursor-pointer items-start gap-[12px] rounded-[16px] border border-[#e7dfc9] bg-[#fffdf8] px-[16px] py-[14px] pe-[42px] shadow-[0_18px_44px_-16px_rgba(21,64,47,0.34),0_4px_14px_-8px_rgba(21,64,47,0.2)] transition-shadow hover:shadow-[0_22px_50px_-16px_rgba(21,64,47,0.4)]"
        >
          {/* Invitation icon — same blue accent as the notification list's Invitation category */}
          <span className="mt-[1px] flex size-[40px] shrink-0 items-center justify-center rounded-[12px] bg-[#ebf2fc]">
            <svg viewBox="0 0 20 20" fill="none" className="size-[19px] text-[#3b82f6]">
              <path d="M2.5 5.833A1.667 1.667 0 014.167 4.167h11.666A1.667 1.667 0 0117.5 5.833v8.334a1.667 1.667 0 01-1.667 1.666H4.167A1.667 1.667 0 012.5 14.167V5.833z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 5.833L10 10.833l7.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[16px] leading-[21px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Invitation request received')} />
            <p className="mt-[4px] text-[13px] leading-[18px] text-[#5a6660]" style={{ fontFamily: SANS, fontWeight: 400 }} {...tx('You have received an invitation to join this Miqaat. Review and respond to continue your reservation.')} />
            <span className="mt-[10px] inline-flex items-center gap-[6px] text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: SANS }}>
              <span {...tx('View invitation')} />
              <svg viewBox="0 0 16 16" fill="none" className="size-[13px]">
                <path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>

          {/* Dismiss */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose() }}
            aria-label={t('Dismiss notification')}
            className="absolute end-[10px] top-[10px] flex size-[26px] items-center justify-center rounded-full text-[#8a938e] transition-colors hover:bg-[#f0ece1] hover:text-[#5a6660]"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-[15px]">
              <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
