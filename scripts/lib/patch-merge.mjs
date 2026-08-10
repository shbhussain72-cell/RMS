/**
 * patch-merge.mjs — the ONLY code path allowed to write `docs/wordlist-patch.xlsx`.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────
 *
 * `emit-blank-rows.mjs` used to build the workbook from scratch — it staged the class-C queue,
 * asked the `/__lsd/patch.xlsx` dev-server handler for a workbook, and wrote the bytes over the
 * file. That handler emits every LSD cell EMPTY, on purpose: it is the dictionary editor's
 * Export button, and an export of staged rows is meant to be blank.
 *
 * Written over a file the wordlist owner has been typing into, that is a wipe. At the time this
 * was found the patch held 91 authored translations (commit cba6c04) and the sanctioned command
 * to add a row to it would have destroyed all 91, then printed its usual success line.
 *
 * The deliverables guard did not catch it. That guard reads DELETES, and the note in
 * `deliverables.json` is about content that "exists nowhere else" — which an overwrite removes
 * exactly as thoroughly as an unlink. `deliverables.test.mjs` covers overwrites now too, and
 * this module is its one declared exception.
 *
 * ── THE SHAPE OF THE FIX ─────────────────────────────────────────────────────────────
 *
 * Read, merge, assert, write. The merge is a pure function over rows so it can be tested
 * without a spreadsheet or a dev server, and the three assertions run against the file as it is
 * on disk AFTER the write — not against the intent that produced it:
 *
 *   1. no row that was in the file is missing from it
 *   2. no LSD value that was in the file has changed
 *   3. every row this added has an EMPTY LSD cell
 *
 * A failure restores the original bytes before throwing. A merge that cannot prove it preserved
 * the file has to leave the file alone; "probably fine" is the state this module exists to end.
 */
import XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'

export const SHEET = 'Word List'
export const HEADER = ['Page', 'English name', 'LSD name']

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** The sheet as an array-of-arrays, header included. */
export function readRows(file) {
  const wb = XLSX.readFile(file)
  const ws = wb.Sheets[SHEET]
  if (!ws) throw new Error(`${file} has no "${SHEET}" sheet (found: ${wb.SheetNames.join(', ')})`)
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
}

/** english -> LSD value, for the body of a sheet. */
export const valuesOf = (rows) =>
  new Map(rows.slice(1).filter((r) => norm(r[1])).map((r) => [norm(r[1]), String(r[2] ?? '')]))

/**
 * Merge blank rows for `keys` into `rows`, which is the sheet as read.
 *
 * PURE — no fs, no workbook. Every existing row is carried through byte for byte, including
 * its Page column; a key already present is left exactly as it is, filled or not, because the
 * whole failure this module addresses is a blank row landing on top of a typed one.
 */
export function mergeBlankRows(rows, keys) {
  const header = rows[0] ?? HEADER
  if (norm(header[1]) !== 'English name' || norm(header[2]) !== 'LSD name') {
    throw new Error(`unexpected header: ${JSON.stringify(header)}`)
  }
  const body = rows.slice(1).filter((r) => norm(r[1]))
  const have = new Set(body.map((r) => norm(r[1])))

  const added = []
  const alreadyPresent = []
  for (const key of keys) {
    const k = norm(key)
    if (!k) continue
    if (have.has(k)) { alreadyPresent.push(k); continue }
    body.push(['', k, ''])
    have.add(k)
    added.push(k)
  }

  // The order the file is already in, so a diff shows the new lines in context rather than a
  // reshuffle of all 119.
  body.sort((a, b) => norm(a[1]).localeCompare(norm(b[1])))

  return {
    rows: [HEADER, ...body.map((r) => [r[0] ?? '', norm(r[1]), String(r[2] ?? '')])],
    added,
    alreadyPresent,
  }
}

/**
 * The three assertions, over the BEFORE and AFTER states of the sheet.
 *
 * Returns the list of failures; empty means the merge preserved the file. Separate from the
 * write so a caller can check a merge it has not committed to disk, and so the test can assert
 * that a destructive merge is actually reported — a checker that never fires is the same as no
 * checker.
 */
export function verifyMerge(before, after, added) {
  const b = valuesOf(before)
  const a = valuesOf(after)
  const failures = []

  const dropped = [...b.keys()].filter((k) => !a.has(k))
  if (dropped.length) failures.push(`${dropped.length} row(s) dropped: ${dropped.slice(0, 5).join(' | ')}`)

  const changed = [...b.entries()].filter(([k, v]) => a.has(k) && a.get(k) !== v).map(([k]) => k)
  if (changed.length) failures.push(`${changed.length} existing LSD value(s) changed: ${changed.slice(0, 5).join(' | ')}`)

  const authored = added.filter((k) => String(a.get(k) ?? '').trim())
  if (authored.length) failures.push(`${authored.length} added row(s) are not blank: ${authored.slice(0, 5).join(' | ')}`)

  return failures
}

/**
 * Read the patch, merge blank rows for `keys`, verify against the file on disk, and keep the
 * write only if all three assertions hold.
 *
 * `wordlist` is the generated dictionary. A blank row is never emitted for a key it already
 * has — pasting one would overwrite a real translation with nothing, and it would look like an
 * ordinary paste. Same rail the dev-server handler carries; it belongs on both sides.
 *
 * Such a key is SKIPPED and named, not made fatal. The realistic way one arrives is a stale
 * `routes-final.json` naming a string that has since been translated, and a tool that refuses
 * to run at all until someone re-walks 24 routes is a tool people stop running.
 */
export function mergeIntoPatch(file, keys, wordlist = {}) {
  const inWordlist = keys.filter((k) => Object.prototype.hasOwnProperty.call(wordlist, norm(k)))
  const wanted = keys.filter((k) => !Object.prototype.hasOwnProperty.call(wordlist, norm(k)))

  const original = readFileSync(file)
  const before = readRows(file)
  const { rows, added, alreadyPresent } = mergeBlankRows(before, wanted)

  const out = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(rows), SHEET)
  XLSX.writeFile(out, file)

  // Re-READ, rather than trusting `rows`. The assertions are about the file the wordlist owner
  // will open, and a workbook writer that mangled a cell would satisfy any check made against
  // the array we handed it.
  const after = readRows(file)
  const failures = verifyMerge(before, after, added)
  if (failures.length) {
    writeFileSync(file, original)
    throw new Error(`patch merge REVERTED, ${file} is unchanged:\n  ${failures.join('\n  ')}`)
  }

  const filled = [...valuesOf(after).values()].filter((v) => v.trim()).length
  return {
    added,
    alreadyPresent,
    inWordlist,
    rowsBefore: valuesOf(before).size,
    rowsAfter: valuesOf(after).size,
    filled,
    blank: valuesOf(after).size - filled,
  }
}
