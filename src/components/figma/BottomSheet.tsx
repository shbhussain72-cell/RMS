/**
 * BottomSheet — faithful bottom-sheet modal, docked to the bottom of the 390px frame.
 *
 * Behaviour standard (applied consistently across every popup):
 *   - Height is content-driven and only *capped* (90dvh mobile / 85vh web). Short content
 *     never shows a scrollbar — the sheet hugs its content.
 *   - The header (drag handle, title, close button) and the optional footer (primary CTA)
 *     stay fixed. Only the body scrolls, and only once content exceeds the cap.
 *
 * Slots:
 *   - `title`  — simple string title (Marcellus 18px), rendered in the fixed header.
 *   - `header` — rich ReactNode header (overrides `title`), also fixed.
 *   - `footer` — fixed footer area (e.g. a primary action button).
 *   - children — the scrollable body.
 *
 * - Dimmed backdrop over the whole frame; click to dismiss.
 * - Bottom-docked on mobile, centered modal on web.
 * - Surface white, shadow matches the Figma elevated card.
 */
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from '../../i18n'

export default function BottomSheet({
  open,
  onClose,
  title,
  header,
  footer,
  children,
  backdropStyle,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Optional override for the backdrop behind the sheet (e.g. a themed full-screen overlay
   *  that replaces the page rather than dimming it). Defaults to the standard translucent dim. */
  backdropStyle?: React.CSSProperties;
  /** Wider desktop modal — for content that needs more horizontal room (e.g. a filter-chip row). */
  wide?: boolean;
}) {
     const { t } = useT()
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-center sm:items-center sm:p-[24px]" data-name="BottomSheet">
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t('Close')}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(14,45,33,0.45)]"
        style={backdropStyle}
      />

      {/* Positioning wrapper: bottom-docked on mobile, centered on web */}
      <div className={`relative flex w-full max-w-[480px] flex-col justify-end sm:justify-center ${wide ? "sm:max-w-[600px]" : "sm:max-w-[440px]"}`}>
        {/* Sheet surface — content-driven, capped; header & footer fixed, body scrolls */}
        <div className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-tl-[16px] rounded-tr-[16px] bg-white shadow-[0px_22px_50px_-18px_rgba(21,64,47,0.3),0px_8px_20px_-10px_rgba(21,64,47,0.16)] sm:max-h-[85vh] sm:rounded-[20px]">
          {/* ── Fixed header ── */}
          <div className="relative shrink-0">
            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-[10px] pb-[6px] sm:hidden">
              <div className="h-[4px] w-[36px] rounded-[9999px] bg-[#d9d2c2]" />
            </div>

            {/* Close button */}
            <button
              type="button"
              aria-label={t('Close')}
              onClick={onClose}
              className="absolute end-[14px] top-[14px] z-10 flex size-[28px] items-center justify-center rounded-full bg-[#f0ece1] text-[#5a6660] transition-colors hover:bg-[#e7e1d2]"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-[16px]">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {header ? (
              <div className="px-[16px] pt-[6px] pb-[10px] sm:pt-[14px]">{header}</div>
            ) : title ? (
              <div
                className="px-[16px] pe-[52px] pb-[8px] pt-[4px] text-[18px] leading-[24px] text-[#15402f] sm:pt-[14px]"
                style={{ fontFamily: "Marcellus, Georgia, serif" }}
              >
                {title}
              </div>
            ) : null}
          </div>

          {/* ── Scrollable body — scrolls only when content exceeds the cap ── */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[16px] pb-[16px] pt-[4px]">
            {children}
          </div>

          {/* ── Fixed footer ── */}
          {footer && (
            <div className="shrink-0 border-t border-[#f0ece1] bg-white px-[16px] pt-[12px] pb-[max(env(safe-area-inset-bottom),16px)]">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
