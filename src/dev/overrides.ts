/**
 * Staged dictionary edits — the client half of the bridge to `wordlist-overrides.json`.
 *
 * ── WHY A FILE AND NOT localStorage ──────────────────────────────────────────────────
 *
 * Because the build has to be able to see it. An edit that lives only in a browser profile
 * cannot be checked for at build time, so the one failure this whole mechanism exists to
 * prevent — shipping a translation the .xlsx has never heard of — would still be possible.
 * The file is read by `blockPendingOverrides()` in `vite.config.ts`, which refuses to build
 * while any edit is staged. localStorage would also lose the queue on a profile wipe, and
 * the queue is the user's unfinished work.
 *
 * ── WHAT THIS NEVER DOES ─────────────────────────────────────────────────────────────
 *
 * Write `src/i18n/lsd.json` or the .xlsx. The JSON is generated and the spreadsheet is the
 * source of truth; the editor's whole job is to hold a proposed value until a human moves it
 * into the spreadsheet by hand. Nothing here authors, suggests, completes or repairs a Lisan
 * al-Dawat value — it stores exactly the characters that were typed, or refuses them.
 *
 * DEV ONLY. The endpoint exists only under `vite dev`, and `wordlist-overrides` is on
 * `check-dev-only.mjs`'s forbidden list so a reference from shipped code fails the build.
 */

export interface Override {
  lsd: string
  /** ISO timestamp, so a stale queue is obvious when you come back to it. */
  at: string
}

const ENDPOINT = '/__lsd/overrides'

/** In-memory mirror. The file is authoritative; this is what the UI renders between saves. */
let staged: Record<string, Override> = {}
const listeners = new Set<() => void>()

function notify() {
  // Push into the i18n layer first so the app re-renders with the staged values, then tell
  // the panel. The other order shows the editor's new state against the old app text.
  const apply = (window as unknown as { __lsdOverrides?: (m: Record<string, string>) => void }).__lsdOverrides
  if (apply) apply(Object.fromEntries(Object.entries(staged).map(([k, v]) => [k, v.lsd])))
  listeners.forEach((fn) => fn())
}

export function subscribeOverrides(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getOverrides(): Record<string, Override> {
  return staged
}

export function overrideCount(): number {
  return Object.keys(staged).length
}

/** Load the queue from disk once at startup. A failure is not fatal — the editor still works. */
export async function loadOverrides(): Promise<void> {
  try {
    const res = await fetch(ENDPOINT)
    if (!res.ok) return
    const data: unknown = await res.json()
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      staged = data as Record<string, Override>
      notify()
    }
  } catch { /* no dev endpoint (preview/build) — the editor is simply unavailable */ }
}

async function persist(): Promise<void> {
  notify()
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(staged),
    })
  } catch { /* keep the in-memory edit; the next save retries the whole map */ }
}

/**
 * Stage one edit. An empty value CLEARS the entry rather than storing a blank — a blank
 * override would read as "translated to nothing" and mask the gap it was meant to fill.
 */
export function setOverride(english: string, lsd: string): Promise<void> {
  const key = String(english ?? '').replace(/\s+/g, ' ').trim()
  if (!key) return Promise.resolve()
  if (!lsd.trim()) delete staged[key]
  else staged[key] = { lsd, at: new Date().toISOString() }
  return persist()
}

export function clearOverride(english: string): Promise<void> {
  delete staged[String(english ?? '').replace(/\s+/g, ' ').trim()]
  return persist()
}

/** Drop the whole queue — used after the Excel patch has been pasted into the wordlist. */
export function clearAllOverrides(): Promise<void> {
  staged = {}
  return persist()
}
