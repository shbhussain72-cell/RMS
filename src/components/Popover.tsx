import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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

  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div
        ref={panelRef}
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
    </>
  )
}
