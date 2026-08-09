/**
 * runSync.ts — the sync itself, with no HTTP around it.
 *
 * ═══ THE WORKBOOK IS PATCHED AT THE ZIP LEVEL. NEVER `XLSX.writeFile`. ═══════════════
 *
 * If you are here to make this simpler, read that line twice. `XLSX.writeFile` is one call
 * and it destroys the wordlist. Measured on the real file: a SheetJS read→write round trip
 * returns `xl/styles.xml` carrying **Calibri alone** — Kanz-al-Lulu, the font every one of
 * the 1085 cells is set in and the one the `Read me` sheet names in its last line, is gone —
 * and drops `xl/sharedStrings.xml` entirely.
 *
 * Every value would still be correct. Every assertion about values would still pass. The LSD
 * column would render in a fallback face and nothing anywhere would say so.
 *
 * So the edit goes through `wordlistXlsx.ts`, which rewrites exactly one part of the archive
 * and copies every other part at the COMPRESSED level, and `verifyPatch` re-reads the bytes
 * about to be committed and refuses them if anything else moved. **Font loss fails the sync;
 * it does not survive it.** `sync.test.ts` proves that refusal is real by feeding it a
 * SheetJS-written workbook and asserting it is rejected.
 * ════════════════════════════════════════════════════════════════════════════════════
 *
 * ── APPEND ONLY. INSERT AND SORT ARE PROHIBITED, NOT MERELY AVOIDED ──────────────────
 *
 * The `Read me` sheet cites Word List row numbers in PROSE — rows 230, 231, 312, 457 and 500,
 * under *ASSUMPTIONS — reject any of these*. Those are the translations the wordlist owner
 * has flagged as open to challenge. Renumbering rows would repoint five citations at
 * unrelated strings: documentation broken, not data, so no diff looks wrong and nothing
 * fails. New keys go at the END with an empty Page column.
 *
 * ── DIRECTION OF TRUTH ───────────────────────────────────────────────────────────────
 *
 * The .xlsx stays the source of truth and `src/i18n/lsd.json` stays generated from it. This
 * moves a value from the shared store INTO the sheet and stops; the value becomes real when
 * the commit lands and the next build regenerates the dictionary. Nothing here writes
 * `lsd.json`, and nothing here authors, completes or repairs a Lisan al-Dawat value — it
 * moves the exact characters a human typed, or it aborts.
 *
 * ── WHAT ABORTS THE RUN ──────────────────────────────────────────────────────────────
 *
 *   the base file cannot be read          it is never created fresh — see `getFile`
 *   any pending value contains mojibake   the whole run, not just that row
 *   more than 20% of rows would change    unless `force` is passed explicitly
 *   the patched workbook fails verify     rows lost, fonts changed, any other part touched
 *   the file moved under us               GitHub's 409 on the compare-and-swap
 *
 * Every one is returned to the caller AND written to the status record, so it surfaces in the
 * editor rather than only in a log nobody opens.
 */
import { GitHubError, getFile, putFile, repoFromEnv } from './github'
import { currentOverrides } from './records'
import { storeFromEnv } from './store'
import { planSync } from './syncPlan'
import { patchWordlist, readWordlist, verifyPatch } from './wordlistXlsx'

/** Where the last run's outcome lives, so the editor can show it without re-running anything. */
export const STATUS_PATH = 'sync/last.json'

export interface SyncStatus {
  at: string
  ok: boolean
  /** Set when something was committed. Absent on a no-op and on an abort. */
  commit?: string
  updated: string[]
  appended: string[]
  /** Overrides whose value the sheet already holds — the retirement case, and the common one. */
  alreadyThere: number
  skipped: { key: string; why: string }[]
  aborts: string[]
  rowsBefore: number
  rowsAfter: number
  trigger: 'cron' | 'manual'
}

export interface SyncOutcome {
  status: SyncStatus
  httpStatus: number
}

const now = () => new Date().toISOString()

async function record(status: SyncStatus): Promise<void> {
  try {
    await storeFromEnv().put(STATUS_PATH, status)
  } catch (err) {
    // A status write failing must not turn a successful commit into a reported failure.
    console.error('[sync] could not record status', err)
  }
}

export async function lastStatus(): Promise<SyncStatus | null> {
  const rec = await storeFromEnv().get<SyncStatus>(STATUS_PATH)
  return rec?.body ?? null
}

const aborted = async (
  trigger: SyncStatus['trigger'],
  aborts: string[],
  rows = 0,
  httpStatus = 502,
): Promise<SyncOutcome> => {
  const status: SyncStatus = {
    at: now(), ok: false, updated: [], appended: [], alreadyThere: 0,
    skipped: [], aborts, rowsBefore: rows, rowsAfter: rows, trigger,
  }
  await record(status)
  return { status, httpStatus }
}

export async function runSync(opts: { force?: boolean; trigger: SyncStatus['trigger'] }): Promise<SyncOutcome> {
  const { trigger, force = false } = opts

  let cfg
  try { cfg = repoFromEnv() } catch (err) {
    return aborted(trigger, [err instanceof Error ? err.message : String(err)], 0, 500)
  }

  // 1. The base. Read it, never build it.
  let base
  try { base = await getFile(cfg) } catch (err) {
    const message = err instanceof GitHubError ? err.message : `could not read the wordlist: ${String(err)}`
    return aborted(trigger, [message], 0, err instanceof GitHubError ? err.status : 502)
  }

  let wl
  try { wl = readWordlist(base.bytes) } catch (err) {
    return aborted(trigger, [`the committed wordlist did not parse: ${err instanceof Error ? err.message : String(err)}`], 0, 502)
  }

  // 2. What would be written, and whether it is allowed.
  const revisions = await currentOverrides(storeFromEnv())
  const plan = planSync(wl, revisions, { force })
  const common = {
    at: now(),
    alreadyThere: plan.alreadyThere.length,
    skipped: plan.skipped,
    rowsBefore: wl.rowCount,
    trigger,
  }

  if (plan.aborts.length) {
    const status: SyncStatus = { ...common, ok: false, updated: [], appended: [], aborts: plan.aborts, rowsAfter: wl.rowCount }
    await record(status)
    return { status, httpStatus: 422 }
  }

  // 3. Nothing to do is a SUCCESS, and it must not produce an empty commit. A nightly cron
  //    that commits whether or not anything changed buries the runs that matter.
  if (!plan.edits.length) {
    const status: SyncStatus = { ...common, ok: true, updated: [], appended: [], aborts: [], rowsAfter: wl.rowCount }
    await record(status)
    return { status, httpStatus: 200 }
  }

  // 4. Patch, then check the BYTES rather than the intention that produced them.
  const patched = patchWordlist(base.bytes, plan.edits)
  const problems = verifyPatch(base.bytes, patched.bytes, { updated: patched.updated, appended: patched.appended })
  if (patched.rowsAfter < patched.rowsBefore) {
    problems.unshift(`the sheet would lose rows: ${patched.rowsBefore} becomes ${patched.rowsAfter}`)
  }
  if (problems.length) {
    const status: SyncStatus = { ...common, ok: false, updated: [], appended: [], aborts: problems, rowsAfter: patched.rowsAfter }
    await record(status)
    return { status, httpStatus: 500 }
  }

  // 5. Commit, compare-and-swap on the sha that was read.
  const summary = [
    patched.updated.length ? `${patched.updated.length} updated` : '',
    patched.appended.length ? `${patched.appended.length} appended` : '',
  ].filter(Boolean).join(', ')
  const message = `Wordlist: ${summary}\n\n`
    + `Written by the wordlist sync from the shared override store (${trigger}).\n`
    + 'Cell-level edit: only xl/worksheets/sheet1.xml was rewritten.\n\n'
    + [...patched.updated.map((k) => `  updated  ${k}`), ...patched.appended.map((k) => `  appended ${k}`)].join('\n')

  try {
    const commit = await putFile(cfg, patched.bytes, base.sha, message)
    const status: SyncStatus = {
      ...common, ok: true, commit,
      updated: patched.updated, appended: patched.appended, aborts: [], rowsAfter: patched.rowsAfter,
    }
    await record(status)
    return { status, httpStatus: 200 }
  } catch (err) {
    const detail = err instanceof GitHubError ? err.message : String(err)
    const status: SyncStatus = { ...common, ok: false, updated: [], appended: [], aborts: [detail], rowsAfter: wl.rowCount }
    await record(status)
    return { status, httpStatus: err instanceof GitHubError ? err.status : 502 }
  }
}
