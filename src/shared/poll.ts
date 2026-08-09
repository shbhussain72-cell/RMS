/**
 * poll.ts — see other people's writes without a reload, without billing overnight.
 *
 * There is no push channel and no backend beyond six serverless functions, so the panel
 * polls. Every `list()` against the store is a billed operation, and a panel left open on a
 * forgotten tab would otherwise run until the laptop sleeps.
 *
 * Three rules, all of them about NOT polling:
 *
 *   CLOSED PANEL, NO POLL. The caller starts and stops with the panel. Nothing here runs in
 *   the background of the app.
 *
 *   HIDDEN TAB, NO POLL. `document.hidden` pauses the timer entirely — a background tab has
 *   nobody looking at it. Becoming visible polls once immediately, because the first thing
 *   you do on returning to a tab is read it, and then resumes at the base interval.
 *
 *   NOTHING NEW, SLOW DOWN. Each poll that returns an unchanged fingerprint doubles the
 *   interval up to the cap; any change resets it to the base. An active review session stays
 *   at 30s where it matters, and an idle one decays to a poll every few minutes.
 */

export interface PollOptions {
  /** Returns a value that changes when the data changes. Anything `!==`-comparable. */
  fingerprint: () => Promise<string>
  /** Called when the fingerprint changed, and once on the initial fetch. */
  onChange: () => void
  /** Surfaced rather than swallowed — a poll failing is how you learn the API is down. */
  onError?: (err: unknown) => void
  baseMs?: number
  maxMs?: number
}

export function startPolling({ fingerprint, onChange, onError, baseMs = 30_000, maxMs = 300_000 }: PollOptions): () => void {
  let interval = baseMs
  let last: string | null = null
  let timer: number | undefined
  let stopped = false

  const schedule = () => {
    window.clearTimeout(timer)
    if (stopped || document.hidden) return
    timer = window.setTimeout(run, interval)
  }

  const run = async () => {
    if (stopped || document.hidden) return
    try {
      const next = await fingerprint()
      if (next !== last) {
        last = next
        interval = baseMs
        onChange()
      } else {
        interval = Math.min(interval * 2, maxMs)
      }
    } catch (err) {
      // Back off on failure too. A cold or broken function should not be hit every 30s by six
      // browsers at once, and the error is reported rather than hidden behind the retry.
      interval = Math.min(interval * 2, maxMs)
      onError?.(err)
    }
    schedule()
  }

  const onVisibility = () => {
    if (document.hidden) { window.clearTimeout(timer); return }
    interval = baseMs
    void run()
  }

  document.addEventListener('visibilitychange', onVisibility)
  void run()

  return () => {
    stopped = true
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
