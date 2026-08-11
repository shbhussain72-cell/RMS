/**
 * hidden.ts — which dev widgets are hidden, one entry per widget.
 *
 * ── ONE CONTROL PER WIDGET, NOT ONE FOR ALL OF THEM ──────────────────────────────────
 *
 * There are three floating dev docks: the dictionary panel, the LSD coverage badge and the
 * remarks pill. They occupy three of the four corners between them, and the reason you want one
 * gone is almost always that it is sitting on the one element you are trying to read. A single
 * "hide dev tools" switch answers that by taking away the tool you are using to record what you
 * found.
 *
 * So the state is a MAP keyed by widget, and hiding one says nothing about the others.
 *
 * ── HIDDEN IS NOT UNMOUNTED ──────────────────────────────────────────────────────────
 *
 * Callers must keep the widget in the tree and hide it visually. These panels are not passive:
 * the coverage badge runs the DOM scan, the dictionary panel holds queued edits that have not
 * reached the shared store, and the remarks dock is what resolves every anchor on the page.
 * Unmounting to hide would throw that away and re-run it on unhide, which turns a "get this out
 * of my way" into a lost queue. `DevDock` implements this with `display:none` on a wrapper that
 * stays in the tree; the sticky note does the same.
 *
 * ── RECOVERABLE WITHOUT KNOWING A SHORTCUT ───────────────────────────────────────────
 *
 * A hidden widget always leaves a visible stub — here, the dock's grip and eye. A keyboard-only
 * unhide is not recoverable: the person who needs it is a reviewer who pressed something and is
 * now looking at a screen with no way back, and clearing localStorage takes their remarks with
 * it.
 *
 * The sticky note is NOT on this list. Its visibility is per route and lives with the rest of
 * that note's state in `remarks/note.ts` — a note that exists on one screen and not another
 * cannot be described by a single global flag, and splitting one widget's state across two
 * stores to reuse this hook would buy nothing.
 *
 * DEV ONLY. `devtools.hidden.v1` is on `check-dev-only.mjs`'s review-only list, so it must be
 * absent from a production bundle and present with the flag on.
 */
import { useCallback, useEffect, useState } from 'react'

/** Versioned: this is a map today and may need to carry per-widget settings later. */
export const HIDDEN_KEY = 'devtools.hidden.v1'

/**
 * Every widget that can be hidden. Closed on purpose: an id that is not on this list is dropped
 * on read rather than kept, so a renamed widget cannot leave a permanently-hidden orphan entry
 * that nothing renders a stub for.
 */
export const DEV_WIDGETS = ['coverage', 'dictionary', 'remarks'] as const
export type DevWidgetId = (typeof DEV_WIDGETS)[number]

const known = (k: string): k is DevWidgetId => (DEV_WIDGETS as readonly string[]).includes(k)

export function readHidden(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Only `true` for a known id counts. Anything else — a stale id, a string, a number left
      // by an older shape — resets to shown, which is the state you can act on.
      if (known(k) && v === true) out[k] = true
    }
    return out
  } catch {
    return {}
  }
}

function persist(id: DevWidgetId, hidden: boolean) {
  try {
    const next = readHidden()
    if (hidden) next[id] = true
    else delete next[id]
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
  } catch { /* private mode, quota — a widget that forgets it was hidden is not worth throwing over */ }
}

/**
 * `[hidden, setHidden]` for one widget.
 *
 * Seeded from storage after mount rather than in the initialiser: these components render on
 * the server-less first pass of a dev build where `localStorage` reads are cheap but the same
 * component is also mounted by the harness in a fresh context, and a lazy initialiser that
 * throws in a locked-down browser would take the whole panel down with it.
 */
export function useDevHidden(id: DevWidgetId): [boolean, (v: boolean) => void] {
  const [hidden, set] = useState(false)

  useEffect(() => { set(readHidden()[id] === true) }, [id])

  const setHidden = useCallback((v: boolean) => {
    set(v)
    persist(id, v)
  }, [id])

  return [hidden, setHidden]
}
