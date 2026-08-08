import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

/**
 * DevDock — the floating shell every dev-only panel sits in, draggable and remembered.
 *
 * The dev panels are pinned to opposite corners: the LSD coverage panel bottom-start, the
 * Remarks panel top-end. Both are the size of a real dialog, and both cover exactly the part of
 * the app you are trying to read when the thing you are debugging happens to be under them. The
 * only recourse was to close the panel, look, and open it again.
 *
 * ── WHAT IS DRAGGABLE ────────────────────────────────────────────────────────────────
 *
 * The grip, plus any part of an open panel that is not a control — a pointer-down that lands on
 * a `button`, `input`, `select`, `textarea`, `a` or `[contenteditable]` is left alone, so a drag
 * can never steal a click from the controls these panels are made of.
 *
 * The grip is not decoration. Dragging by the panel body alone was tried first and is useless
 * exactly when you need it: COLLAPSED, each dock is nothing but its toggle button, so every
 * pixel of it is on the exclusion list and there is no surface left to grab. The grip is a
 * plain `div` for the same reason — as a `button` it would exclude itself.
 *
 * ── WHY THE POSITION IS NOT APPLIED UNTIL IT IS MOVED ─────────────────────────────────
 *
 * The default corners are set with LOGICAL insets — `start-[16px]`, `end-[16px]` — so they
 * follow the reading direction, and the Remarks panel really does move to the other side of the
 * screen in LSD. A stored position is physical `left`/`top`, because that is what a drag
 * produces. Applying physical coordinates from the start would silently freeze those panels to
 * one side. So an undragged dock keeps its classes and no inline position at all; only once it
 * has been moved does it switch, and the inline style then has to null out the logical insets
 * explicitly or both would apply and fight in RTL.
 *
 * ── CLAMPING ─────────────────────────────────────────────────────────────────────────
 *
 * Every position is clamped into the viewport: on restore, on drag, and on resize. Without the
 * first two, a position saved at 1440 strands the panel off a 390 viewport with no way to reach
 * it — and the recovery is to clear localStorage, which also throws away everything else the
 * dev tools remember.
 *
 * DEV ONLY. Both call sites are behind `import.meta.env.DEV`, and `devtools.pos.v1` is on
 * `check-dev-only.mjs`'s forbidden list so the build fails if this reaches `dist/`.
 */

/** One key for every dock, keyed by dock id inside. Versioned: the shape may need to change. */
const KEY = 'devtools.pos.v1'
/** Minimum gap kept between a dock and the viewport edge, in px. */
const EDGE = 8

type Pos = { x: number; y: number }

function readAll(): Record<string, Pos> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, Pos> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const p = v as Partial<Pos>
      if (typeof p?.x === 'number' && typeof p?.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        out[k] = { x: p.x, y: p.y }
      }
    }
    return out
  } catch {
    return {}
  }
}

function persist(id: string, pos: Pos) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [id]: pos }))
  } catch { /* private mode, quota — a dock that forgets its place is not worth throwing over */ }
}

export default function DevDock({
  id,
  className,
  children,
  ...rest
}: {
  /** Stable per-panel key inside the stored map. */
  id: string
  className: string
  children: ReactNode
} & Record<string, unknown>) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const [dragging, setDragging] = useState(false)
  const grab = useRef<Pos | null>(null)

  const clamp = useCallback((p: Pos): Pos => {
    const el = ref.current
    const w = el?.offsetWidth ?? 0
    const h = el?.offsetHeight ?? 0
    return {
      x: Math.max(EDGE, Math.min(p.x, window.innerWidth - w - EDGE)),
      y: Math.max(EDGE, Math.min(p.y, window.innerHeight - h - EDGE)),
    }
  }, [])

  // Restore after the first layout, not during render: clamping needs a measured size, and on
  // the very first pass the dock has none.
  useLayoutEffect(() => {
    const saved = readAll()[id]
    if (saved) setPos(clamp(saved))
  }, [id, clamp])

  useEffect(() => {
    const reclamp = () => setPos((p) => (p ? clamp(p) : p))
    window.addEventListener('resize', reclamp)
    // The dock's OWN size is observed as well, and that is the case a window listener misses.
    // Narrowing the viewport makes these panels reflow taller and wider; clamping on the resize
    // event alone uses the size from before that reflow, and the dock ends up hanging over the
    // edge it was just clamped away from. Opening or closing a panel changes its size too.
    const ro = new ResizeObserver(reclamp)
    if (ref.current) ro.observe(ref.current)
    return () => { window.removeEventListener('resize', reclamp); ro.disconnect() }
  }, [clamp])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button, input, select, textarea, a, [contenteditable]')) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    grab.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    setDragging(true)
    // Capture on the target, not the wrapper: the wrapper is `pointer-events: none` so that it
    // never swallows a click meant for the app underneath, and an element that does not receive
    // pointer events does not receive captured ones either.
    t.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = grab.current
    if (!g) return
    setPos(clamp({ x: e.clientX - g.x, y: e.clientY - g.y }))
  }

  const endDrag = (e: ReactPointerEvent) => {
    if (!grab.current) return
    grab.current = null
    setDragging(false)
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    setPos((p) => { if (p) persist(id, p); return p })
  }

  return (
    <div
      data-devdock=""
      {...rest}
      ref={ref}
      className={className}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={pos
        // Both logical insets are nulled before the physical ones are set. In LTR
        // `inset-inline-start` and `left` are the same property and the later wins; in RTL they
        // are opposite edges, and leaving the class's `end-[16px]` in place would pin one side
        // while `left` pinned the other.
        ? { insetInlineStart: 'auto', insetInlineEnd: 'auto', bottom: 'auto', right: 'auto', left: pos.x, top: pos.y }
        : undefined}
    >
      {/* Applied to the panels, not the wrapper: the wrapper is `pointer-events: none`, so a
          cursor set on it is never the one the browser shows. */}
      {dragging && <style>{'[data-devdock] *{cursor:grabbing!important;user-select:none!important}'}</style>}
      {children}
      <div
        data-devdock-grip=""
        title="Drag to move"
        aria-hidden="true"
        className="pointer-events-auto select-none rounded-[5px] border border-[#d8cfb8] bg-white/90 px-[7px] text-[11px] leading-[15px] tracking-[2px] text-[#8a938e] shadow-[0_2px_8px_-2px_rgba(21,64,47,0.3)]"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        ⠿
      </div>
    </div>
  )
}
