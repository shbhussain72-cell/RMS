/**
 * Read/write for `rms-tour-seen` — the list of screen keys whose walkthrough has been shown.
 *
 * Split out of TourProvider so it can be tested without mounting the provider (which would
 * drag in the router and the store). Everything here is defensive in the same way
 * remarks/storage.ts is: the key is written by other builds and by the screenshot/bidi
 * harnesses, and a bad value must not take the app down.
 */
import { TOUR_SEEN_KEY } from './steps'

/**
 * Screen keys already shown; always an array of strings, whatever is actually on disk.
 *
 * The try/catch alone is NOT enough, and the shape check is the whole point. A key holding
 * the string '1' parses to the NUMBER 1 without throwing, so the catch never runs and a
 * number escapes typed as string[] — then `getSeen().includes(...)` in TourProvider is a
 * TypeError inside an effect, which unmounts the tree. Every route with a walkthrough
 * rendered as a blank page. Screenshot runs still wrote full-size files for those routes, so
 * a "none missing" check reported success on them.
 */
export function getSeen(): string[] {
  try {
    const raw = localStorage.getItem(TOUR_SEEN_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((k): k is string => typeof k === 'string')
  } catch {
    return []
  }
}

export function markSeen(key: string): void {
  try {
    const set = new Set(getSeen())
    set.add(key)
    localStorage.setItem(TOUR_SEEN_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore storage failures */
  }
}
