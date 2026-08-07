import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTour } from './TourProvider'
import { useT } from '../i18n'

const FONT_SERIF = 'Marcellus, Georgia, serif'
const FONT_SANS = 'Mulish, system-ui, sans-serif'

/** Plain snapshot of a viewport rect (so React state comparisons are cheap). */
interface Box { top: number; left: number; width: number; height: number; bottom: number; right: number }

const PAD = 6 // spotlight padding around the target
const GAP = 14 // gap between spotlight and tooltip
const MARGIN = 16 // min gap from the viewport edge

function snapshot(el: Element): Box {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
}

function findEl(anchor: string): HTMLElement | undefined {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`))
  // Prefer the first element that is actually laid out and on-screen (handles the mobile/desktop
  // dual-render pattern where only one variant is visible).
  return els.find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 1 && r.height > 1
  })
}

/** Choose where to place the tooltip so it stays fully within the viewport. */
function computePos(
  box: Box,
  tipW: number,
  tipH: number,
  placement: 'top' | 'bottom' | 'left' | 'right' | undefined,
  vw: number,
  vh: number,
): { top: number; left: number } {
  const sp = { top: box.top - PAD, left: box.left - PAD, right: box.right + PAD, bottom: box.bottom + PAD }
  const cx = (sp.left + sp.right) / 2
  const cy = (sp.top + sp.bottom) / 2
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - MARGIN - tipW)
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - MARGIN - tipH)

  const order = (['bottom', 'top', 'right', 'left'] as const)
  const sides = placement ? [placement, ...order.filter((s) => s !== placement)] : [...order]

  for (const side of sides) {
    if (side === 'bottom' && sp.bottom + GAP + tipH <= vh - MARGIN)
      return { top: sp.bottom + GAP, left: clampX(cx - tipW / 2) }
    if (side === 'top' && sp.top - GAP - tipH >= MARGIN)
      return { top: sp.top - GAP - tipH, left: clampX(cx - tipW / 2) }
    if (side === 'right' && sp.right + GAP + tipW <= vw - MARGIN)
      return { top: clampY(cy - tipH / 2), left: sp.right + GAP }
    if (side === 'left' && sp.left - GAP - tipW >= MARGIN)
      return { top: clampY(cy - tipH / 2), left: sp.left - GAP - tipW }
  }

  // Nothing fits beside the target (small viewport) → pin to whichever half has more room.
  const top = cy < vh / 2 ? vh - MARGIN - tipH : MARGIN
  return { top, left: clampX(cx - tipW / 2) }
}

export default function TourOverlay() {
  const { tx, t } = useT()
  const { active, step, stepIndex, stepCount, showProgress, next, prev, skip, finish } = useTour()
  const isLast = stepIndex === stepCount - 1
  const isFirst = stepIndex === 0

  const [box, setBox] = useState<Box | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  // Locate + track the current step's anchor. Polls until it mounts (e.g. City cards after the queue
  // loader clears), scrolls it into view once, then keeps the spotlight aligned. While the anchor is
  // absent, `box` stays null and the overlay renders nothing — so the user can still interact with
  // the page (get through the queue, etc.) until the highlighted element appears.
  useEffect(() => {
    if (!active || !step) {
      setBox(null)
      return
    }
    let cancelled = false
    let scrolled = false
    let settleTimer: number | undefined
    const measure = () => {
      if (cancelled) return
      const el = findEl(step.anchor)
      if (!el) {
        setBox(null)
        return
      }
      if (!scrolled) {
        scrolled = true
        const r = el.getBoundingClientRect()
        if (r.top < 60 || r.bottom > window.innerHeight - 40) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
          settleTimer = window.setTimeout(() => { if (!cancelled) setBox(snapshot(el)) }, 360)
          return
        }
      }
      setBox(snapshot(el))
    }
    measure()
    const iv = window.setInterval(measure, 200)
    let raf = 0
    const onScrollResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      cancelled = true
      window.clearInterval(iv)
      window.clearTimeout(settleTimer)
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
      cancelAnimationFrame(raf)
    }
  }, [active, step])

  // Lock user scrolling only while the overlay is actually visible (a target is spotlit), so the
  // highlighted element can't drift; the tour's own scrollIntoView still works.
  useEffect(() => {
    if (!active || !box) return
    const block = (e: Event) => e.preventDefault()
    window.addEventListener('wheel', block, { passive: false })
    window.addEventListener('touchmove', block, { passive: false })
    return () => {
      window.removeEventListener('wheel', block)
      window.removeEventListener('touchmove', block)
    }
  }, [active, box])

  // Position the tooltip once we know its size and the target box.
  useLayoutEffect(() => {
    if (!active || !box) return
    const tip = tipRef.current
    if (!tip) return
    const tr = tip.getBoundingClientRect()
    setPos(computePos(box, tr.width, tr.height, step?.placement, window.innerWidth, window.innerHeight))
  }, [box, active, stepIndex, step])

  // Keyboard: Esc dismisses, arrows navigate.
  useEffect(() => {
    if (!active || !box) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip()
      else if (e.key === 'ArrowRight') isLast ? finish() : next()
      else if (e.key === 'ArrowLeft' && !isFirst) prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, box, isLast, isFirst, next, prev, skip, finish])

  // Nothing to show until the current step's target is on screen.
  if (!active || !step || !box) return null

  const spotlight = { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }
  const multiStep = stepCount > 1

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label={t('Product walkthrough')}>
      {/* Interaction blocker — swallows clicks so the background can't be used while a tip is shown. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Spotlight — a transparent window punched through the dim via a huge box-shadow spread. */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          borderRadius: 14,
          boxShadow: '0 0 0 3px rgba(201,164,92,0.95), 0 0 0 9999px rgba(14,45,33,0.55)',
          transition: 'top 0.4s cubic-bezier(0.22,0.68,0.24,1), left 0.4s cubic-bezier(0.22,0.68,0.24,1), width 0.4s cubic-bezier(0.22,0.68,0.24,1), height 0.4s cubic-bezier(0.22,0.68,0.24,1)',
        }}
      />

      {/* Tooltip card */}
      <div
        ref={tipRef}
        key={`${stepIndex}-${step.anchor}`}
        className="tour-tip absolute w-[min(340px,calc(100vw-32px))] rounded-[16px] border border-[#e7dfc9] bg-white p-[18px] shadow-[0_18px_48px_-12px_rgba(14,45,33,0.4)]"
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          visibility: pos ? 'visible' : 'hidden',
          transition: 'top 0.32s cubic-bezier(0.22,0.68,0.24,1), left 0.32s cubic-bezier(0.22,0.68,0.24,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress row — only when the screen opts into it (City & Zone) */}
        {showProgress && (
          <div className="mb-[12px] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.8px] text-[#a8843e]" style={{ fontFamily: FONT_SANS }}>
              Step {stepIndex + 1} of {stepCount}
            </span>
            <div className="flex items-center gap-[5px]">
              {Array.from({ length: stepCount }).map((_, i) => (
                <span
                  key={i}
                  className="block rounded-full transition-all duration-300"
                  style={{
                    width: i === stepIndex ? 18 : 6,
                    height: 6,
                    background: i === stepIndex ? '#1f5a44' : i < stepIndex ? '#c9a45c' : '#e2d9c4',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <h3 className="text-[19px] leading-[24px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }} {...tx(step.title)} />
        <p className="mt-[7px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }} {...tx(step.description)} />

        {step.note && (
          <div className="mt-[12px] rounded-[10px] border-s-[3px] border-[#c9a45c] bg-[#f8f4ea] px-[12px] py-[9px]">
            <p className="text-[13px] leading-[18px] text-[#1f5a44]" style={{ fontFamily: FONT_SANS, fontWeight: 600 }} {...tx(step.note)} />
          </div>
        )}

        {/* Controls */}
        <div className="mt-[16px] flex items-center justify-between gap-[10px]">
          {multiStep ? (
            <button
              type="button"
              onClick={skip}
              className="text-[13px] font-semibold text-[#8a938e] transition-colors hover:text-[#5a6660]"
              style={{ fontFamily: FONT_SANS }} {...tx('Skip')} />
          ) : (
            <span />
          )}
          <div className="flex items-center gap-[8px]">
            {!isFirst && (
              <button
                type="button"
                onClick={prev}
                className="flex h-[38px] items-center justify-center rounded-full border border-[#1f5a44] px-[16px] text-[13px] font-bold text-[#1f5a44] transition-colors hover:bg-[#f7f4ec]"
                style={{ fontFamily: FONT_SANS }} {...tx('Previous')} />
            )}
            <button
              type="button"
              onClick={isLast ? finish : next}
              className="flex h-[38px] items-center justify-center rounded-full bg-[#1f5a44] px-[20px] text-[13px] font-bold text-white shadow-[0px_6px_18px_-6px_rgba(21,64,47,0.4)] transition-colors hover:bg-[#0a3325]"
              style={{ fontFamily: FONT_SANS }}
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
