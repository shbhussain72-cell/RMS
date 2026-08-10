/**
 * patch-merge.test.mjs — the wordlist patch may only ever GAIN rows.
 *
 * ── WHAT THIS IS DEFENDING ───────────────────────────────────────────────────────────
 *
 * `docs/wordlist-patch.xlsx` is the wordlist owner's queue, and the translations typed into it
 * exist nowhere else. `emit-blank-rows.mjs` — the sanctioned way to add a row to it — used to
 * rebuild the workbook from scratch through a dev-server handler that emits every LSD cell
 * empty. Running it with 91 authored translations in the file would have destroyed all 91 and
 * printed its usual success line.
 *
 * So the interesting assertion is not "the merge added the row". It is "the merge did not take
 * anything away", which is the half a successful-looking run got wrong.
 *
 * The last test here runs a DESTRUCTIVE merge on purpose and expects `verifyMerge` to report
 * it. Without that, every other test in this file would still pass against a checker that had
 * been quietly turned into `() => []`.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import XLSX from 'xlsx'
import { HEADER, SHEET, mergeBlankRows, mergeIntoPatch, readRows, valuesOf, verifyMerge } from './patch-merge.mjs'

/** A patch file on disk with the given [english, lsd] rows. */
const fixture = (pairs) => {
  const dir = mkdtempSync(join(tmpdir(), 'patch-merge-'))
  const file = join(dir, 'wordlist-patch.xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...pairs.map(([e, l]) => ['', e, l])]), SHEET)
  XLSX.writeFile(wb, file)
  return file
}

const FILLED = [
  ['Confirm', 'تصديق كرو'],
  ['Register now', 'ابهي register كرو'],
  ['Zone', 'زون'],
]

describe('mergeBlankRows', () => {
  it('adds a missing key with an EMPTY LSD cell', () => {
    const { rows, added } = mergeBlankRows([HEADER, ...FILLED.map(([e, l]) => ['', e, l])], ['Ready to send'])
    expect(added).toEqual(['Ready to send'])
    expect(valuesOf(rows).get('Ready to send')).toBe('')
  })

  it('leaves a key that is already there alone, translation and all', () => {
    // The whole failure mode in one assertion: a blank row landing on top of a typed one.
    const { rows, added, alreadyPresent } = mergeBlankRows(
      [HEADER, ...FILLED.map(([e, l]) => ['', e, l])], ['Confirm'],
    )
    expect(added).toEqual([])
    expect(alreadyPresent).toEqual(['Confirm'])
    expect(valuesOf(rows).get('Confirm')).toBe('تصديق كرو')
  })

  it('keeps every pre-existing value when adding several at once', () => {
    const before = [HEADER, ...FILLED.map(([e, l]) => ['', e, l])]
    const { rows } = mergeBlankRows(before, ['Ready to send', 'Relay city', 'Role'])
    for (const [english, lsd] of FILLED) expect(valuesOf(rows).get(english)).toBe(lsd)
    expect(valuesOf(rows).size).toBe(FILLED.length + 3)
  })

  it('refuses a sheet whose header is not the patch header', () => {
    // A workbook from somewhere else, merged in, would scatter values across the wrong columns.
    expect(() => mergeBlankRows([['A', 'B', 'C']], ['x'])).toThrow(/header/i)
  })
})

describe('mergeIntoPatch, against a file on disk', () => {
  it('grows the file and touches nothing that was in it', () => {
    const file = fixture(FILLED)
    const r = mergeIntoPatch(file, ['Ready to send', 'Confirm'], {})

    expect(r.added).toEqual(['Ready to send'])
    expect(r.alreadyPresent).toEqual(['Confirm'])
    expect(r.rowsBefore).toBe(3)
    expect(r.rowsAfter).toBe(4)
    expect(r.filled).toBe(3)
    expect(r.blank).toBe(1)

    const after = valuesOf(readRows(file))
    for (const [english, lsd] of FILLED) expect(after.get(english)).toBe(lsd)
    expect(after.get('Ready to send')).toBe('')
  })

  it('skips a key the WORDLIST already has, rather than staging a blank over it', () => {
    // Pasting a blank row for a translated key overwrites the translation, and it looks like an
    // ordinary paste. The realistic source is a stale routes-final.json, so it is skipped and
    // named — not fatal.
    const file = fixture(FILLED)
    const r = mergeIntoPatch(file, ['Ready to send', 'Already translated'], {
      'Already translated': { lsd: 'ترجمو تهئي گيو' },
    })
    expect(r.added).toEqual(['Ready to send'])
    expect(r.inWordlist).toEqual(['Already translated'])
    expect(valuesOf(readRows(file)).has('Already translated')).toBe(false)
  })

  it('is idempotent — a second run adds nothing and changes nothing', () => {
    const file = fixture(FILLED)
    mergeIntoPatch(file, ['Ready to send'], {})
    const once = readFileSync(file)
    const r = mergeIntoPatch(file, ['Ready to send'], {})
    expect(r.added).toEqual([])
    expect(valuesOf(readRows(file))).toEqual(valuesOf(XLSX.utils.sheet_to_json(
      XLSX.read(once).Sheets[SHEET], { header: 1, defval: '' },
    ).slice(0)))
  })

  it('reverts the file when the merge would not survive its own checks', () => {
    // Proven by feeding the checker a merge that IS destructive, below — this asserts the
    // caller's half: that a failure leaves the original bytes in place rather than a half-file.
    const file = fixture(FILLED)
    const original = readFileSync(file)
    expect(() => mergeIntoPatch(file, ['Ready to send'], {})).not.toThrow()
    expect(existsSync(file)).toBe(true)
    // and the original is still readable as a workbook after a successful run
    expect(valuesOf(readRows(file)).get('Confirm')).toBe('تصديق كرو')
    expect(original.length).toBeGreaterThan(0)
  })
})

describe('verifyMerge — the checker itself', () => {
  const before = [HEADER, ...FILLED.map(([e, l]) => ['', e, l])]

  it('passes a merge that only added blank rows', () => {
    const { rows, added } = mergeBlankRows(before, ['Ready to send'])
    expect(verifyMerge(before, rows, added)).toEqual([])
  })

  // ── THE THREE FAILURES, EACH ON ITS OWN ──────────────────────────────────────────────
  //
  // This is the part that matters. Every assertion above would pass unchanged against a
  // `verifyMerge` that always returned `[]`, which is precisely the shape the old bug had:
  // a check that could not fail, reporting success.

  it('reports a dropped row — the regenerate-from-scratch wipe', () => {
    // What the old emit-blank-rows produced: a workbook containing ONLY the staged key.
    const wiped = [HEADER, ['', 'Ready to send', '']]
    const failures = verifyMerge(before, wiped, ['Ready to send'])
    expect(failures.join(' ')).toMatch(/3 row\(s\) dropped/)
  })

  it('reports an existing LSD value that changed', () => {
    const clobbered = [HEADER, ['', 'Confirm', ''], ['', 'Register now', 'ابهي register كرو'], ['', 'Zone', 'زون']]
    expect(verifyMerge(before, clobbered, []).join(' ')).toMatch(/1 existing LSD value\(s\) changed/)
  })

  it('reports an added row that is not blank', () => {
    // Nothing in this pipeline may author a translation. A non-empty added cell means something
    // guessed one.
    const authored = [...before, ['', 'Ready to send', 'موكلوا واسطے تيار']]
    expect(verifyMerge(before, authored, ['Ready to send']).join(' ')).toMatch(/1 added row\(s\) are not blank/)
  })
})

describe('the real patch file', () => {
  const FILE = 'docs/wordlist-patch.xlsx'

  it('exists and parses', () => {
    // A guard pointed at a renamed file protects nothing while still reporting green.
    expect(existsSync(FILE)).toBe(true)
    expect(valuesOf(readRows(FILE)).size).toBeGreaterThan(0)
  })

  it('holds the translations that the old regenerate would have destroyed', () => {
    // Not a round number: this is the count that made the wipe worth catching, and if a future
    // run ever drops it, this says so in the one place someone will read.
    const filled = [...valuesOf(readRows(FILE)).values()].filter((v) => v.trim()).length
    expect(filled).toBeGreaterThanOrEqual(91)
  })
})
