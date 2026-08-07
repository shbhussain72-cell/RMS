/**
 * Anchoring floating UI to a live DOM node.
 *
 * Lifted from `src/tour/TourOverlay.tsx`, which already solves this problem for the
 * walkthrough: measure the target, try each side in turn, fall back to whichever half of the
 * viewport has more room, and clamp to the margin so the panel can never leave the screen.
 *
 * That last part is why NO POSITIONING LIBRARY is needed here. Floating UI or Popper would
 * add a dependency to re-solve a problem this repo has already solved and shipped, and the
 * tour's version is the one whose behaviour matches the rest of the app.
 *
 * The repositioning loop is also the tour's: a 200ms interval plus rAF-coalesced scroll and
 * resize handlers. An interval looks crude next to a ResizeObserver, but it catches the cases
 * observers miss — a sibling collapsing, an image loading, a route transition animating —
 * without wiring an observer to every ancestor. At 200ms the cost is irrelevant and the pin
 * never visibly lags.
 */
import { useEffect, useState } from 'react'

export interface Box {
  top: number
  left: number
  width: number
  height: number
  bottom: number
  right: number
}

/** Min gap from the viewport edge. Matches the tour so floating UI lines up across tools. */
export const MARGIN = 16
/** Gap between the target and the panel. */
export const GAP = 12

export function snapshot(el: Element): Box {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
}

export type Side = 'top' | 'bottom' | 'left' | 'right'

/**
 * Place a panel of `w` x `h` beside `box`, staying fully inside the viewport.
 *
 * Returns PHYSICAL top/left because that is what absolute positioning needs; direction
 * handling belongs to the caller, which chooses a preferred side based on `dir`. Trying to
 * make this function direction-aware would mean it silently disagreed with the tour's copy.
 */
export function computePos(
  box: Box,
  w: number,
  h: number,
  vw: number,
  vh: number,
  preferred?: Side,
): { top: number; left: number } {
  const cx = (box.left + box.right) / 2
  const cy = (box.top + box.bottom) / 2
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - MARGIN - w))
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - MARGIN - h))

  const order: Side[] = ['bottom', 'top', 'right', 'left']
  const sides = preferred ? [preferred, ...order.filter((s) => s !== preferred)] : order

  for (const side of sides) {
    if (side === 'bottom' && box.bottom + GAP + h <= vh - MARGIN) return { top: box.bottom + GAP, left: clampX(cx - w / 2) }
    if (side === 'top' && box.top - GAP - h >= MARGIN) return { top: box.top - GAP - h, left: clampX(cx - w / 2) }
    if (side === 'right' && box.right + GAP + w <= vw - MARGIN) return { top: clampY(cy - h / 2), left: box.right + GAP }
    if (side === 'left' && box.left - GAP - w >= MARGIN) return { top: clampY(cy - h / 2), left: box.left - GAP - w }
  }

  // Nothing fits beside it — happens at 390px with a tall target. Pin to the roomier half
  // and clamp; the panel stays on screen, which is the only hard requirement.
  return { top: cy < vh / 2 ? Math.max(MARGIN, vh - MARGIN - h) : MARGIN, left: clampX(cx - w / 2) }
}

/**
 * Track an element's viewport box while it exists.
 *
 * Returns null when `el` is null, so a caller can render nothing without a separate branch.
 * Deliberately does NOT lock scrolling the way the tour does — the tour is a modal
 * walkthrough, whereas a reviewer needs to scroll the page while a composer is open.
 */
export function useAnchoredBox(el: HTMLElement | null): Box | null {
  const [box, setBox] = useState<Box | null>(() => (el ? snapshot(el) : null))

  useEffect(() => {
    if (!el) {
      setBox(null)
      return
    }
    let raf = 0
    let cancelled = false

    const measure = () => {
      if (cancelled) return
      // Compare before setting: an unconditional setState every 200ms would re-render the
      // whole layer forever and make the pins the most expensive thing on the page.
      const next = snapshot(el)
      setBox((prev) =>
        prev
        && prev.top === next.top && prev.left === next.left
        && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      )
    }

    measure()
    const iv = window.setInterval(measure, 200)
    const onScrollResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      cancelled = true
      window.clearInterval(iv)
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
      cancelAnimationFrame(raf)
    }
  }, [el])

  return box
}
