/**
 * PhoneScreen — responsive app shell.
 *
 * Mobile : fills the full device width (no fixed frame) — adapts to every phone size.
 * Web (≥ 640px) : full-width content up to 1500px, warm #f6f4ef page bg,
 *                 clamp-based side padding — matches the reference web layout.
 *
 * The real OS provides the status bar / home indicator, so this shell renders no
 * fake phone chrome. `statusTone` / `showHomeIndicator` are accepted for backward
 * compatibility with existing callers but no longer render anything.
 */
import type { ReactNode } from "react";

export default function PhoneScreen({
  children,
  footer,
  frameClassName = "bg-white",
}: {
  children: ReactNode;
  statusTone?: "light" | "dark";
  footer?: ReactNode;
  showHomeIndicator?: boolean;
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
