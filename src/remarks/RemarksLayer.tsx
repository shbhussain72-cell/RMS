/**
 * Remarks — the on-page layer: hover highlight, composer, pins, hover preview.
 *
 * Portaled to <body> and marked with both `data-remark-chrome` (so remarks can never be
 * attached to remarks UI) and `data-lsd-scanner-ignore` (so the LSD coverage scanner does not
 * report this tool's English chrome as untranslated app copy — the scan totals are a baseline
 * other work depends on).
 *
 * ── HOW "DOES NOT INTERCEPT" IS ACHIEVED ─────────────────────────────────────────────
 *
 * There is no full-screen capture div. Remark mode works by attaching window listeners in the
 * CAPTURE phase and reading `e.target`, which leaves `elementFromPoint` semantics intact and,
 * more importantly, means that when remark mode is off there is nothing over the page at all.
 *
 * Pins are `pointer-events: none` at ALL times, including when they are being hovered. A pin
 * sits at the corner of the element it annotates, which on a dense screen is over a real
 * control; making it clickable would mean the tool eats a button the reviewer is trying to
 * test. Preview hover is therefore done by hit-testing the cursor against the pin rectangles
 * from a passive `mousemove`, which observes without intercepting.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Iso } from '../components/Bidi'
import { SCANNER_IGNORE_ATTR } from '../i18n/domScan'
import { useAnchoredBox, computePos, snapshot, type Box } from './anchor'
import { CHROME_ATTR, isChrome } from './selector'
import { useRemarks } from './RemarksProvider'
import type { Remark } from './types'
import { REVIEW_TOOLS } from '../reviewTools'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const PIN = 20

/** Marks the layer root. Both attributes are needed and they mean different things. */
const chromeProps = { [CHROME_ATTR]: '', [SCANNER_IGNORE_ATTR]: '' }

export default function RemarksLayer() {
  if (!REVIEW_TOOLS) return null
  return <RemarksLayerInner />
}

function RemarksLayerInner() {
  const { enabled, remarks, resolutions, addRemark, route } = useRemarks()
  const [hover, setHover] = useState<HTMLElement | null>(null)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [draft, setDraft] = useState('')
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  const dir = (document.documentElement.getAttribute('dir') as 'ltr' | 'rtl') || 'ltr'
  const rtl = dir === 'rtl'

  /**
   * Remark-mode input capture.
   *
   * mousedown/mouseup are blocked as well as click: blocking only `click` still lets the app
   * see the press, so a button would show its active state and any `onMouseDown` handler
   * would fire before the composer opened.
   */
  useEffect(() => {
    if (!enabled) return
    const onMove = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      setHover(t && !isChrome(t) ? t : null)
    }
    const swallow = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || isChrome(t)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.type === 'click') {
        setTarget(t)
        setDraft('')
      }
    }
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('mousedown', swallow, true)
    window.addEventListener('mouseup', swallow, true)
    window.addEventListener('click', swallow, true)
    return () => {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('mousedown', swallow, true)
      window.removeEventListener('mouseup', swallow, true)
      window.removeEventListener('click', swallow, true)
      setHover(null)
    }
  }, [enabled])

  // Leaving remark mode must also close a half-written composer, or it floats unanchored.
  useEffect(() => { if (!enabled) { setTarget(null); setHover(null) } }, [enabled])

  /** Pins for remarks that currently resolve on this route. */
  const pinned = useMemo(
    () => remarks
      .map((r) => ({ r, el: resolutions.get(r.id)?.el ?? null }))
      .filter((x): x is { r: Remark; el: HTMLElement } => !!x.el && x.r.route === route),
    [remarks, resolutions, route],
  )

  /**
   * Passive cursor tracking for pin preview. Attached only when there is something to
   * preview, and rAF-coalesced so a fast mouse cannot flood React with state updates.
   */
  useEffect(() => {
    if (!pinned.length || enabled) { setCursor(null); return }
    let raf = 0
    let last = { x: 0, y: 0 }
    const onMove = (e: MouseEvent) => {
      last = { x: e.clientX, y: e.clientY }
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; setCursor(last) })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf) }
  }, [pinned.length, enabled])

  const hoverBox = useAnchoredBox(enabled ? hover : null)

  return createPortal(
    <div
      {...chromeProps}
      className="pointer-events-none fixed inset-0 z-[110]"
      style={{ contain: 'layout size' }}
    >
      {enabled && hoverBox && <Highlight box={hoverBox} />}

      {pinned.map(({ r, el }) => (
        <Pin key={r.id} remark={r} el={el} rtl={rtl} cursor={cursor} />
      ))}

      {target && (
        <Composer
          el={target}
          draft={draft}
          setDraft={setDraft}
          rtl={rtl}
          onCancel={() => setTarget(null)}
          onSave={async () => {
            const text = draft.trim()
            if (!text) return
            await addRemark(target, text)
            setTarget(null)
            setDraft('')
          }}
        />
      )}

      {enabled && (
        <div
          // Centred with `start-0 end-0 mx-auto w-fit`, NOT `left-1/2 -translate-x-1/2`.
          // Both centre correctly, but the inset pair is direction-neutral and needs no
          // entry on the centring exception list — the parent is ours, so the physical
          // property is eliminated rather than excepted.
          className="fixed bottom-[16px] start-0 end-0 mx-auto w-fit rounded-full bg-[#1f5a44] px-[14px] py-[6px] text-[12px] font-bold text-white shadow-[0_10px_30px_-8px_rgba(21,64,47,0.5)]"
          style={{ fontFamily: FONT_SANS }}
          dir="ltr"
        >
          Remark mode — click any element · Esc to exit
        </div>
      )}
    </div>,
    document.body,
  )
}

/** Outline of the element under the cursor. Outline, not a filled box, so the target stays readable. */
function Highlight({ box }: { box: Box }) {
  return (
    <div
      className="pointer-events-none absolute rounded-[4px]"
      style={{
        top: box.top - 2, left: box.left - 2, width: box.width + 4, height: box.height + 4,
        outline: '2px solid #1f5a44', outlineOffset: 0, background: 'rgba(31,90,68,0.08)',
      }}
    />
  )
}

/**
 * A pin, at the element's top INLINE-END corner.
 *
 * Mirrored: inline-end is the right corner in LTR and the left corner in RTL. Anchoring to a
 * physical corner would put every pin on the opposite side of its element in LSD, which reads
 * as the pin belonging to the neighbouring control.
 */
function Pin({
  remark, el, rtl, cursor,
}: { remark: Remark; el: HTMLElement; rtl: boolean; cursor: { x: number; y: number } | null }) {
  const box = useAnchoredBox(el)
  if (!box) return null

  const left = rtl ? box.left - PIN / 2 : box.right - PIN / 2
  const top = box.top - PIN / 2
  const hovered = !!cursor
    && cursor.x >= left && cursor.x <= left + PIN
    && cursor.y >= top && cursor.y <= top + PIN
  const resolved = remark.status === 'resolved'

  return (
    <>
      <div
        data-rmk="pin"
        data-rmk-id={remark.id}
        className="pointer-events-none absolute flex items-center justify-center rounded-full text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
        style={{
          top, left, width: PIN, height: PIN,
          background: resolved ? '#8a938e' : '#b23b3b',
          fontFamily: FONT_SANS,
        }}
        dir="ltr"
      >
        {resolved ? '✓' : '!'}
      </div>
      {hovered && <PinPreview remark={remark} top={top} left={left} rtl={rtl} />}
    </>
  )
}

function PinPreview({ remark, top, left, rtl }: { remark: Remark; top: number; left: number; rtl: boolean }) {
  const W = 240
  // Clamp so a pin near the viewport edge does not push its preview off-screen.
  const x = Math.min(Math.max(8, rtl ? left - W + PIN : left), window.innerWidth - W - 8)
  return (
    <div
      className="pointer-events-none absolute rounded-[8px] bg-[#23302a] px-[10px] py-[7px] text-[12px] leading-[16px] text-white shadow-[0_8px_22px_-6px_rgba(0,0,0,0.45)]"
      style={{ top: top + PIN + 6, left: x, width: W, fontFamily: FONT_SANS }}
    >
      {/* <bdi>: reviewers mix Arabic-script and Latin in one remark, and without isolation a
          trailing Latin word or punctuation mark reorders across the Arabic run. */}
      <Iso>{remark.remark}</Iso>
      <div className="mt-[4px] text-[10px] text-[#a9b5ae]" dir="ltr">
        {remark.author} · {remark.lang} · {remark.viewportWidth}px
      </div>
    </div>
  )
}

/** The composer, anchored beside the clicked element and clamped inside the viewport. */
function Composer({
  el, draft, setDraft, rtl, onSave, onCancel,
}: {
  el: HTMLElement
  draft: string
  setDraft: (v: string) => void
  rtl: boolean
  onSave: () => void
  onCancel: () => void
}) {
  const box = useAnchoredBox(el)
  const ref = useRef<HTMLDivElement | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const [size, setSize] = useState({ w: 300, h: 180 })

  useLayoutEffect(() => {
    if (ref.current) {
      const r = snapshot(ref.current)
      if (r.width && r.height) setSize({ w: r.width, h: r.height })
    }
  }, [draft])

  useEffect(() => { taRef.current?.focus() }, [])

  const onKey = useCallback((e: React.KeyboardEvent) => {
    // Escape closes the composer without leaving remark mode; the provider's Escape handler
    // would otherwise exit the mode entirely on the first keypress.
    if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave() }
  }, [onCancel, onSave])

  if (!box) return null
  const pos = computePos(box, size.w, size.h, window.innerWidth, window.innerHeight, rtl ? 'left' : 'right')

  return (
    <div
      ref={ref}
      // pointer-events-auto ONLY here: the composer is the one part of the layer that must
      // receive input, and it is present only while a remark is being written.
      data-rmk="composer"
      className="pointer-events-auto absolute w-[300px] max-w-[calc(100vw-32px)] rounded-[12px] border border-[#d8cfb8] bg-white p-[10px] shadow-[0_16px_44px_-12px_rgba(21,64,47,0.45)]"
      style={{ top: pos.top, left: pos.left, fontFamily: FONT_SANS }}
      onKeyDown={onKey}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#8a938e]" dir="ltr">
        {el.tagName.toLowerCase()}
        {el.getAttribute('data-tour') ? ` · data-tour="${el.getAttribute('data-tour')}"` : ''}
      </p>
      <textarea
        ref={taRef}
        data-rmk="composer-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        placeholder="What's wrong here?"
        className="mt-[6px] w-full resize-y rounded-[8px] border border-[#e7dfc9] bg-[#fffdf8] p-[8px] text-[13px] leading-[18px] text-[#23302a] outline-none focus:border-[#1f5a44]"
        // `dir="auto"` so the caret and alignment follow whichever script the reviewer starts
        // typing — they will write some remarks in English and some in Arabic script.
        dir="auto"
      />
      <div className="mt-[8px] flex items-center justify-end gap-[6px]">
        <button
          type="button" onClick={onCancel}
          className="rounded-[6px] px-[10px] py-[4px] text-[12px] font-bold text-[#5a6660]"
        >
          Cancel
        </button>
        <button
          type="button" data-rmk="composer-save" onClick={onSave} disabled={!draft.trim()}
          className="rounded-[6px] bg-[#1f5a44] px-[10px] py-[4px] text-[12px] font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  )
}
