import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Popover — the app's one anchored overlay.
 *
 * Every dropdown here used to do the same four things wrong, in four copies of the same eleven
 * lines. `scripts/repro-anchor.mjs` measures the two that are visible from outside; the other two
 * are plain to read:
 *
 * 1. THE RECT WENT STALE. Each call site captured `e.currentTarget.getBoundingClientRect()` in its
 *    click handler and kept that DOMRect in state. A DOMRect is a viewport-relative snapshot, so
 *    the moment anything scrolled, the trigger moved and the panel did not — measured at 150px of
 *    scroll, the trigger moved -150px and the panel moved 0. This takes the ELEMENT instead and
 *    re-reads it, which is why `anchor` is an `HTMLElement`, not a rect.
 *
 * 2. IT ANCHORED BY PHYSICAL `left`. `Math.min(anchor.left, …)` aligns the panel's LEFT edge to the
 *    trigger's LEFT edge, which is the inline START edge only in a left-to-right document. In LSD
 *    the panel hung off the trigger's END edge, 141px adrift. Alignment is now on the inline-start
 *    edge in both directions, read from the anchor's own computed `direction`.
 *
 * 3. IT NEVER FLIPPED. `top: Math.min(anchor.bottom + 6, innerHeight - 320)` clamps but does not
 *    flip: near the bottom of the viewport the panel slid UP over the trigger that opened it, so
 *    the control you were aiming at was underneath the list. It now flips above when it does not
 *    fit below, and only clamps if neither side fits.
 *
 * 4. IT LISTENED TO NOTHING. No scroll handler, no resize handler. Both are here, and scroll is
 *    bound in the CAPTURE phase because scroll does not bubble — the triggers sit inside
 *    `overflow-y: auto` panels on /araz and /city, and a listener on `window` alone never sees
 *    those.
 *
 * The panel is measured before it is shown rather than assumed: flipping needs a real height, and
 * these lists vary from three rows to a scrolling twenty. It renders hidden for one layout pass,
 * `useLayoutEffect` places it, and the browser paints it once — placed. Hence `visibility`, not a
 * conditional render: a panel that is not in the DOM has no height to measure.
 *
 * ── 5. IT IS PORTALLED TO <body>, AND THAT IS LOAD-BEARING ───────────────────────
 *
 * `position: fixed` resolves against the viewport ONLY while no ancestor establishes a
 * containing block for it. A `transform` other than `none` does establish one (CSS Transforms
 * §3, "any value other than none"), and so do `filter`, `backdrop-filter`, `will-change` naming
 * either, `contain: paint/layout`, and `perspective`.
 *
 * THE TRAP: an IDENTITY transform counts. `MiqaatList` wraps the header in
 * `sticky top-0 z-50 transition-transform`, which computes to `matrix(1, 0, 0, 1, 0, 0)` —
 * visually nothing, semantically "transformed". Reading the computed style and seeing an
 * identity matrix is not evidence of absence; the only value that is `none` is `none`. With the
 * panel rendered inside that header, every `fixed` coordinate was measured from the header's box
 * instead of the viewport: the account dropdown landed 137px out and the notification panel 40px
 * out, in BOTH languages, while `getBoundingClientRect` on the trigger read correctly and the
 * arithmetic here was right.
 *
 * Portalling to `document.body` puts the panel outside every such ancestor, which is the only
 * fix that does not depend on knowing what wrappers a consumer happens to have. It also means a
 * consumer may freely add a sticky, filtered or animated wrapper without silently breaking
 * placement — and the next person to add one WILL, because the wrapper is the obvious thing and
 * this consequence of it is not.
 *
 * Same class as the `-translate-x-1/2` finding in docs/centring-exceptions.md: a transform is
 * never only a transform. There it created a stacking context and changed paint order while
 * every box stayed pixel-identical; here it created a containing block and moved a fixed box
 * while every rect that fed into it was correct. `scripts/check-anchor.mjs` is what fails if
 * either is reintroduced.
 */

/** Gap between the trigger and the panel, and the minimum breathing room at a viewport edge. */
const GAP = 6
const MARGIN = 12

export default function Popover({
  anchor,
  width,
  onClose,
  children,
}: {
  /** The trigger element itself. Not its rect — see note 1 above. */
  anchor: HTMLElement | null
  width: number
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const place = useCallback(() => {
    const panel = panelRef.current
    if (!anchor || !panel) return
    const a = anchor.getBoundingClientRect()
    const h = panel.offsetHeight
    const rtl = getComputedStyle(anchor).direction === 'rtl'

    // Inline-start alignment: the panel's start edge meets the trigger's start edge. In RTL that
    // is the right edge of both, so the panel is positioned by where its right edge must land.
    const startAligned = rtl ? a.right - width : a.left
    const left = Math.max(MARGIN, Math.min(startAligned, window.innerWidth - width - MARGIN))

    // Below by preference. Above when it does not fit below AND does fit above — checking both
    // stops a tall panel on a short viewport from flipping into an even worse position.
    const below = a.bottom + GAP
    const above = a.top - GAP - h
    const fitsBelow = below + h <= window.innerHeight - MARGIN
    const fitsAbove = above >= MARGIN
    const top = fitsBelow || !fitsAbove
      ? Math.min(below, Math.max(MARGIN, window.innerHeight - MARGIN - h))
      : above

    setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }))
  }, [anchor, width])

  // Before paint, so the panel is never seen at its unplaced position.
  useLayoutEffect(place, [place])

  useEffect(() => {
    if (!anchor) return
    // Capture phase: scroll does not bubble, and these triggers live inside scrolling panels.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    // The trigger can resize under us (a label changing from a placeholder to a long city name),
    // and so can the panel (typing in the search box shortens the list, which changes the flip).
    const ro = new ResizeObserver(place)
    ro.observe(anchor)
    if (panelRef.current) ro.observe(panelRef.current)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      ro.disconnect()
    }
  }, [anchor, place])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // PORTALED TO <body>, because `position: fixed` is not always fixed.
  //
  // Any ancestor with a `transform`, `filter`, `perspective`, `contain` or `backdrop-filter`
  // becomes the containing block for its fixed-position descendants, and the panel's
  // viewport coordinates are then read in that ancestor's coordinate space instead.
  //
  // This is not hypothetical here. `MiqaatList` renders the app bar inside
  // `sticky top-0 z-50 transition-transform` for its hide-on-scroll behaviour, and the
  // computed transform is `matrix(1, 0, 0, 1, 0, 0)` — an IDENTITY transform, which still
  // creates the containing block. So the AppBar's account dropdown and notification bell,
  // once routed through this component, were placed correctly relative to the header and
  // therefore wrongly relative to the screen: measured 137px and 40px out at 1440.
  //
  // `place()` computes viewport coordinates, so the panel has to live somewhere those
  // coordinates mean what they say. The backdrop moves with it, or it would cover the wrong
  // box and clicks outside the panel would not close it.
  return createPortal(
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div
        ref={panelRef}
        // A stable hook for the suites. Without it `check-anchor` had to find the panel by
        // guessing at its width, and matched the Ask Help dock instead — also `fixed`, also
        // ~180px, also below the trigger. The assertion then measured the wrong element and
        // reported a placement failure that did not exist.
        data-popover=""
        className="fixed z-[100] overflow-hidden rounded-[14px] border border-[#e7dfc9] bg-white shadow-[0_22px_60px_-14px_rgba(21,64,47,0.32)]"
        style={{
          left: pos?.left ?? 0,
          top: pos?.top ?? 0,
          width,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
