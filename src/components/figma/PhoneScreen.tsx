/**
 * PhoneScreen — responsive app shell.
 *
 * Mobile : fills the full device width (no fixed frame) — adapts to every phone size.
 * Web (≥ 640px) : full-width content up to 1500px, warm #f6f4ef page bg,
 *                 clamp-based side padding — matches the reference web layout.
 *
 * The real OS provides the status bar and home indicator, so this shell renders no fake phone
 * chrome. It used to draw a hard-coded "9:41" clock with signal/wifi/battery glyphs and an
 * iPhone home bar; on a real device those sat directly under the OS's own and read as a rendering
 * fault. `statusTone` and `showHomeIndicator` survived that removal as accepted-but-ignored
 * no-ops so callers would keep compiling, and 21 screens went on passing them for months to
 * nothing at all. Both are gone, along with `StatusBar.tsx` and `HomeIndicator.tsx`.
 */
import type { ReactNode } from "react";

export default function PhoneScreen({
  children,
  footer,
  frameClassName = "bg-white",
}: {
  children: ReactNode;
  footer?: ReactNode;
  frameClassName?: string;
}) {
  return (
    /*
     * Page shell
     * – Mobile : plain white, full viewport width
     * – Web    : warm #f6f4ef fills browser, content centred up to 1500px
     *            with clamp side-padding (matches reference add-people layout)
     */
    <div className="min-h-[100dvh] w-full bg-white sm:bg-[#f6f4ef]">

      {/*
       * Content column
       * – Mobile : full device width, no chrome
       * – Web    : centred, clamp side-padding
       */}
      <div
        className={`relative mx-auto flex min-h-[100dvh] w-full flex-col overflow-x-clip ${frameClassName}`}
        data-name="AppScreen"
      >
        <div className="relative flex-1 sm-content-px">{children}</div>

        {footer && (
          <div className="sticky bottom-0 z-20 w-full">{footer}</div>
        )}
      </div>
    </div>
  );
}
