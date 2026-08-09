/**
 * syncPlan.ts — decide what the sync would write, before anything is written.
 *
 * Separated from the endpoint so the rails can be tested without a network, a token or a
 * repository. Every abort below is a case where the correct behaviour is to write NOTHING and
 * say why: a partial sync of a wordlist is worse than no sync, because the half that landed
 * looks exactly like a successful run.
 *
 * ── ABORT, NOT SKIP ──────────────────────────────────────────────────────────────────
 *
 * Mojibake aborts the whole run rather than dropping the offending row. A value that has been
 * through a legacy-font round trip is not one bad cell — it is evidence that something in the
 * chain is decoding wrongly, and the other values in the same batch came through the same
 * chain. Skipping it would commit the rest and hide the signal.
 */
import { detectMojibake } from '../../src/dev/mojibake.mjs'
import { bakedValue, isSentinel, normKey } from '../../src/i18n/wordlistNorm.mjs'
import type { Revision } from './records.js'
import type { Edit, Wordlist } from './wordlistXlsx.js'

/** Above this share of the sheet changing in one run, a human has to say so explicitly. */
export const CHANGE_LIMIT = 0.2

export interface Skipped { key: string; why: string }

export interface SyncPlan {
  edits: Edit[]
  /** Keys that already carry this value in the sheet — the retirement case, and the common one. */
  alreadyThere: string[]
  skipped: Skipped[]
  /** Non-empty means write nothing. Each entry is shown in the UI, not only logged. */
  aborts: string[]
  updates: number
  appends: number
}

export function planSync(wl: Wordlist, revisions: Revision[], opts: { force?: boolean } = {}): SyncPlan {
  const edits: Edit[] = []
  const alreadyThere: string[] = []
  const skipped: Skipped[] = []
  const aborts: string[] = []
  let updates = 0
  let appends = 0

  // Newest revision per key wins; `currentOverrides` already returns heads, but a caller that
  // passed raw history would otherwise write an old value over a new one.
  const heads = new Map<string, Revision>()
  for (const r of revisions) {
    const key = normKey(r.key)
    const prev = heads.get(key)
    if (!prev || prev.createdAt < r.createdAt) heads.set(key, r)
  }

  for (const [key, rev] of heads) {
    const value = String(rev.value ?? '').trim()
    const row = wl.byKey.get(key)

    if (!value) {
      // A `new-row` request with no translation. It is a real queue item in the editor, but a
      // blank cell in the wordlist is indistinguishable from an untranslated row, so writing
      // it would report progress the wordlist has not made.
      skipped.push({ key, why: 'no value yet — a blank row request is not a translation' })
      continue
    }

    const found = detectMojibake(value)
    if (found.length) {
      aborts.push(`"${key}" contains mojibake (${found[0].kind}) — nothing was committed. ${found[0].detail}`)
      continue
    }

    if (isSentinel(value)) {
      skipped.push({ key, why: 'the value is a sentinel instruction, not a translation' })
      continue
    }

    if (row && isSentinel(row.value)) {
      // The wordlist owner has written an instruction about this string. Overwriting it with a
      // translation would answer a question they were asking.
      skipped.push({ key, why: "the wordlist row holds a sentinel — the owner's to resolve" })
      continue
    }

    if (row && bakedValue(value) === bakedValue(row.value)) {
      // Already merged. The comparison goes through `bakedValue` for the same reason override
      // retirement does: the build adds a direction mark, so raw equality never matches and
      // the sync would rewrite the same value every night, forever, in a fresh commit each time.
      alreadyThere.push(key)
      continue
    }

    edits.push({ key, value })
    if (row) updates++; else appends++
  }

  if (edits.length && wl.rowCount > 0) {
    const share = edits.length / wl.rowCount
    if (share > CHANGE_LIMIT && !opts.force) {
      aborts.push(
        `${edits.length} of ${wl.rowCount} rows would change (${Math.round(share * 100)}%), over the ${Math.round(CHANGE_LIMIT * 100)}% limit. `
        + 'Nothing was committed. Re-run with force if this is intended.',
      )
    }
  }

  return { edits, alreadyThere, skipped, aborts, updates, appends }
}
