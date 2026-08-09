/**
 * sync.test.ts — the workbook survives being written to.
 *
 * Everything here runs against the REAL `RMS_Mumineen_LSD_wordlist_v4.xlsx`, because the
 * things that break are things a fixture would not have: one stray cell in column F, five
 * English keys carrying an ornament, a font applied through a style index, and a `Read me`
 * sheet that cites row numbers in prose.
 *
 * The load-bearing test is the last one. It writes the workbook the obvious way — `XLSX.write`
 * — and asserts that `verifyPatch` REFUSES it. Without that, every other assertion here could
 * pass while `verifyPatch` was incapable of failing, which is the shape this repo has been
 * caught by four times.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  SHARED_STRINGS_PART, SHEET_PART, STYLES_PART,
  patchWordlist, readWordlist, strayCells, verifyPatch,
} from './wordlistXlsx'
import { findPart, partBytes, partText, readZip, replacePart, writeZip } from './zip'
import { CHANGE_LIMIT, planSync } from './syncPlan'
import { bakedValue, isSentinel } from '../../src/i18n/wordlistNorm.mjs'

const ROOT = resolve(__dirname, '../..')
const BOOK = new Uint8Array(readFileSync(resolve(ROOT, 'RMS_Mumineen_LSD_wordlist_v4.xlsx')))

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * The wordlist grows — 1085 data rows when this suite was written, 106 more the week after.
 * Absolute counts were a control and became a tripwire that fires on every legitimate
 * translation batch. What actually matters is the RELATIONSHIP (a round trip loses nothing;
 * an append adds exactly one), with a lower bound so the suite cannot pass on an empty sheet.
 */
const DATA_ROWS = (() => {
  const wb = XLSX.read(BOOK, { type: 'array' })
  return (XLSX.utils.sheet_to_json(wb.Sheets['Word List'], { defval: '', raw: false }) as unknown[]).length
})()
const sheetRows = (bytes: Uint8Array) => {
  const wb = XLSX.read(bytes, { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets['Word List'], { defval: '', raw: false }) as Record<string, string>[]
}

describe('zip round trip', () => {
  it('rewriting an unmodified archive preserves every part byte for byte', () => {
    const out = writeZip(readZip(BOOK))
    const before = readZip(BOOK)
    const after = readZip(out)
    expect(after.map((e) => e.name)).toEqual(before.map((e) => e.name))
    for (const part of before) {
      expect(same(partBytes(part), partBytes(findPart(after, part.name)!)), part.name).toBe(true)
    }
  })

  it('and the result still opens as a workbook', () => {
    expect(DATA_ROWS).toBeGreaterThan(1000)          // control: the sheet is really populated
    expect(sheetRows(writeZip(readZip(BOOK))).length).toBe(DATA_ROWS)
  })
})

describe('reading the wordlist', () => {
  const wl = readWordlist(BOOK)

  it('indexes every row by its normalised English key', () => {
    expect(wl.byKey.size).toBeGreaterThan(1000)
    // `lastRow` is the highest row NUMBER, which is not `DATA_ROWS + 1` once the sheet has
    // gaps — two tool-chrome rows were removed without renumbering, exactly as the sync's own
    // prohibition requires, so the numbering runs past the row count. What the sync depends on
    // is only that appending lands after everything that already exists.
    expect(wl.lastRow).toBeGreaterThanOrEqual(DATA_ROWS + 1)
  })

  it('finds the ornamented keys under their stripped form', () => {
    // The five Login-block rows. If these are missed the sync appends duplicates for keys
    // that already have rows — see src/i18n/wordlistNorm.test.ts for the same property from
    // the spreadsheet's side.
    expect(wl.byKey.get('ITS ID')?.row).toBe(4)
    expect(wl.byKey.get('Remember Me')?.row).toBe(10)
  })

  it('reads the same values SheetJS reads', () => {
    const rows = sheetRows(BOOK)
    const norm = (v: unknown) => String(v ?? '').replace(/[۞۩﴾﴿]/g, '').replace(/\s+/g, ' ').trim()
    // Keys that appear on more than one row are excluded HERE and covered by their own test
    // below: for those, "the value SheetJS reads" depends on which row you look at, and the
    // answer the sync needs is the one the build resolves to, not the first one in the file.
    const seen = new Map<string, number>()
    for (const r of rows) { const k = norm(r['English name']); if (k) seen.set(k, (seen.get(k) ?? 0) + 1) }

    for (const r of rows) {
      const key = norm(r['English name'])
      if (!key || (seen.get(key) ?? 0) > 1) continue
      expect(wl.byKey.get(key)?.value, key).toBe(String(r['LSD name'] ?? '').trim())
    }
    expect([...seen.values()].filter((n) => n > 1).length).toBe(6)
  })

  it('sees the stray cell in column F', () => {
    const stray = strayCells(wl.sheetXml, wl.entries)
    expect([...stray.keys()]).toEqual(['F370'])
    expect(stray.get('F370')).toBe('1448')
  })
})

describe('editing an existing row', () => {
  const VALUE = '‏تجربة اليوم'
  const patched = patchWordlist(BOOK, [{ key: 'Status Tracking', value: VALUE }])

  it('reports one update and no appends', () => {
    expect(patched.updated).toEqual(['Status Tracking'])
    expect(patched.appended).toEqual([])
    expect(patched.rowsAfter).toBe(patched.rowsBefore)
  })

  it('the new value is what SheetJS reads back — so the build will see it', () => {
    const row = sheetRows(patched.bytes).find((r) => r['English name'] === 'Status Tracking')
    expect(row?.['LSD name']).toBe(VALUE)
  })

  it('every part except the sheet is byte-identical', () => {
    const before = readZip(BOOK)
    const after = readZip(patched.bytes)
    for (const part of before) {
      if (part.name === SHEET_PART) continue
      expect(same(partBytes(part), partBytes(findPart(after, part.name)!)), part.name).toBe(true)
    }
  })

  it('styles.xml and sharedStrings.xml are present and unchanged', () => {
    const after = readZip(patched.bytes)
    for (const name of [STYLES_PART, SHARED_STRINGS_PART]) {
      const part = findPart(after, name)
      expect(part, name).toBeDefined()
      expect(same(partBytes(findPart(readZip(BOOK), name)!), partBytes(part!)), name).toBe(true)
    }
    expect(partText(findPart(after, STYLES_PART)!)).toContain('Kanz-al-Lulu')
  })

  it('F370, the named range and the right-to-left view all survive', () => {
    const after = readZip(patched.bytes)
    const xml = partText(findPart(after, SHEET_PART)!)
    expect(strayCells(xml, after).get('F370')).toBe('1448')
    expect(partText(findPart(after, 'xl/workbook.xml')!)).toContain('_xlnm._FilterDatabase')
    expect(xml).toContain('rightToLeft="1"')
    expect(xml).toContain('<cols>')
  })

  it('leaves every other row alone', () => {
    const before = readWordlist(BOOK)
    const after = readWordlist(patched.bytes)
    for (const [key, row] of before.byKey) {
      if (key === 'Status Tracking') continue
      expect(after.byKey.get(key)?.value, key).toBe(row.value)
      expect(after.byKey.get(key)?.row, key).toBe(row.row)
    }
  })

  it('verifyPatch is satisfied', () => {
    expect(verifyPatch(BOOK, patched.bytes, { updated: patched.updated, appended: [] })).toEqual([])
  })
})

describe('an ornamented key edits its row instead of appending a duplicate', () => {
  const patched = patchWordlist(BOOK, [{ key: 'ITS ID', value: '‏آيْ ٹي ايس id' }])

  it('updates, never appends', () => {
    expect(patched.appended).toEqual([])
    expect(patched.rowsAfter).toBe(patched.rowsBefore)
  })

  it('and there is still exactly one row for that key', () => {
    const rows = sheetRows(patched.bytes).filter((r) =>
      String(r['English name'] ?? '').replace(/[۞۩﴾﴿]/g, '').trim() === 'ITS ID')
    expect(rows.length).toBe(1)
    expect(rows[0]['LSD name']).toBe('‏آيْ ٹي ايس id')
    // The ornament is in the ENGLISH cell and is not the sync's to clean up.
    expect(rows[0]['English name']).toBe('ITS ID۞')
  })
})

describe('appending a new key', () => {
  const KEY = 'Zone allocation pending'
  const VALUE = '‏zone ني تعيين باقي چھے'
  const patched = patchWordlist(BOOK, [{ key: KEY, value: VALUE }])

  it('adds exactly one row, at the end', () => {
    expect(patched.appended).toEqual([KEY])
    expect(patched.rowsAfter).toBe(patched.rowsBefore + 1)
    const rows = sheetRows(patched.bytes)
    expect(rows.length).toBe(DATA_ROWS + 1)
    expect(rows.at(-1)?.['English name']).toBe(KEY)
  })

  it('with an EMPTY Page column', () => {
    const last = sheetRows(patched.bytes).at(-1)!
    expect(last['Page']).toBe('')
    expect(last['LSD name']).toBe(VALUE)
  })

  it('extends the dimension so the new row is inside the used range', () => {
    const xml = partText(findPart(readZip(patched.bytes), SHEET_PART)!)
    // Derived from the sheet's own last row number, not from the row count — see above.
    expect(xml).toContain(`<dimension ref="A1:F${readWordlist(BOOK).lastRow + 1}"`)
  })

  it('does not renumber anything — the Read me cites rows 230, 231, 312, 457 and 500', () => {
    const before = readWordlist(BOOK)
    const after = readWordlist(patched.bytes)
    for (const [key, row] of before.byKey) expect(after.byKey.get(key)?.row, key).toBe(row.row)
  })

  it('verifyPatch is satisfied', () => {
    expect(verifyPatch(BOOK, patched.bytes, { updated: [], appended: patched.appended })).toEqual([])
  })
})

describe('verifyPatch can actually fail', () => {
  it('refuses a workbook written by SheetJS — the font loss the whole design exists to avoid', () => {
    // The one-line way to do this job, and the reason this module is 200 lines instead.
    const wb = XLSX.read(BOOK, { type: 'array', cellStyles: true })
    const rewritten = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    const problems = verifyPatch(BOOK, rewritten, { updated: [], appended: [] })

    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).toContain('fonts changed')
    expect(problems.join('\n')).toContain('Kanz-al-Lulu')
  })

  it('refuses a patch that drops the stray cell', () => {
    const entries = readZip(BOOK)
    const xml = partText(findPart(entries, SHEET_PART)!).replace(/<c r="F370"[^>]*>[\s\S]*?<\/c>/, '')
    const broken = writeZip(replacePart(entries, SHEET_PART, Buffer.from(xml, 'utf8')))
    expect(verifyPatch(BOOK, broken, { updated: [], appended: [] }).join('\n')).toContain('F370')
  })

  it('refuses a patch that changes a value nobody asked to change', () => {
    const patched = patchWordlist(BOOK, [{ key: 'Status Tracking', value: 'x' }])
    // Same bytes, but the sync claims it changed nothing.
    expect(verifyPatch(BOOK, patched.bytes, { updated: [], appended: [] }).join('\n'))
      .toContain('without being asked')
  })
})

describe('the rails', () => {
  const wl = readWordlist(BOOK)
  const rev = (key: string, value: string, at = '2026-08-09T10:00:00.000Z') => ({
    revisionId: `r${key}`, key, value, author: 'A', createdAt: at, kind: 'edit' as const,
  })

  it('mojibake aborts the whole run, not just that row', () => {
    const plan = planSync(wl, [rev('Status Tracking', 'Ø§Ù„Ø´Ù‡Ø±'), rev('Raza', '‏رزا جديد')])
    expect(plan.aborts.length).toBe(1)
    expect(plan.aborts[0]).toContain('mojibake')
    // The clean edit is still planned — the abort is what stops it being written, and the
    // endpoint checks `aborts` before it patches anything.
    expect(plan.edits.map((e) => e.key)).toEqual(['Raza'])
  })

  it('a value already in the sheet is not rewritten — compared through bakedValue', () => {
    // A MIXED-script row, because that is the case where the two strings genuinely differ:
    // the sheet holds `‏Login كرو` and a reviewer typing the same words produces it
    // without the direction mark. `bakedValue` adds the mark to both sides; raw equality
    // would miss it and the sync would rewrite the same cell in a fresh commit every night.
    const row = wl.byKey.get('Login')!
    const unbaked = row.value.replace(/^[‎‏]/, '')
    expect(unbaked).not.toBe(row.value)
    const plan = planSync(wl, [rev('Login', unbaked)])
    expect(plan.edits).toEqual([])
    expect(plan.alreadyThere).toEqual(['Login'])
  })

  it('a sentinel row is left for the wordlist owner', () => {
    const sentinelKey = [...wl.byKey.values()].find((r) => r.value.toLowerCase() === 'remove')!.key
    const plan = planSync(wl, [rev(sentinelKey, '‏كائي شي')])
    expect(plan.edits).toEqual([])
    expect(plan.skipped[0].why).toContain('sentinel')
  })

  it('an empty value is a blank-row request, not a translation', () => {
    const plan = planSync(wl, [rev('Some brand new string', '')])
    expect(plan.edits).toEqual([])
    expect(plan.skipped[0].why).toContain('no value yet')
  })

  it('over 20% of the sheet changing needs force', () => {
    const many = [...wl.byKey.keys()].slice(0, 300).map((k, i) => rev(k, `‏قيمة ${i}`))
    const blocked = planSync(wl, many)
    expect(blocked.aborts.join('\n')).toContain('over the 20% limit')

    const forced = planSync(wl, many, { force: true })
    expect(forced.aborts).toEqual([])
    // Not 300: some of those keys are sentinel-shadowed and are skipped either way. The point
    // is that `force` removes the abort, not that it changes what is eligible.
    expect(forced.edits.length).toBe(blocked.edits.length)
    expect(forced.edits.length / wl.rowCount).toBeGreaterThan(CHANGE_LIMIT)
  })

  it('and just under the limit does not', () => {
    const some = [...wl.byKey.keys()].slice(0, Math.floor(wl.rowCount * CHANGE_LIMIT) - 1).map((k, i) => rev(k, `‏قيمة ${i}`))
    expect(planSync(wl, some).aborts).toEqual([])
  })

  it('the newest revision for a key wins', () => {
    const plan = planSync(wl, [
      rev('Status Tracking', '‏قديم', '2026-08-01T10:00:00.000Z'),
      rev('Status Tracking', '‏جديد', '2026-08-09T10:00:00.000Z'),
    ])
    expect(plan.edits).toEqual([{ key: 'Status Tracking', value: '‏جديد' }])
  })

  it('an unknown key is an append, a known key is an update', () => {
    const plan = planSync(wl, [rev('Status Tracking', '‏تجربة'), rev('A string with no row at all', '‏تجربة')])
    expect(plan.updates).toBe(1)
    expect(plan.appends).toBe(1)
  })
})

/**
 * The sync's reader and the build's reader must agree about every key in the sheet, or the
 * sync edits rows the dictionary does not read. Six keys in this workbook appear twice, and
 * five of those resolve to a `remove` sentinel that shadows an earlier translation — the case
 * where "the row for this key" has a non-obvious answer.
 */
describe('the sync reads the wordlist the way the build does', () => {
  const wl = readWordlist(BOOK)
  const generated = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/lsd.json'), 'utf8')) as
    Record<string, { lsd?: string; sentinel?: string }>

  it('agrees with lsd.json on every key', () => {
    const disagreements: string[] = []
    for (const [key, entry] of Object.entries(generated)) {
      if (key === '//') continue
      const row = wl.byKey.get(key)
      if (!row) { disagreements.push(`${key}: the sync cannot find a row`); continue }
      if (entry.sentinel) {
        if (!isSentinel(row.value)) disagreements.push(`${key}: build says sentinel, sync reads "${row.value}"`)
        continue
      }
      if (bakedValue(row.value) !== (entry.lsd ?? '')) {
        disagreements.push(`${key}: build has "${entry.lsd}", sync reads "${bakedValue(row.value)}"`)
      }
    }
    expect(disagreements.slice(0, 10)).toEqual([])
  })

  it('and resolves the shadowed duplicates to the sentinel, not the translation', () => {
    // Row 81 carries a translation; row 1085 says `remove`. The build keeps the sentinel, so
    // the sync must see the sentinel too — otherwise it would happily overwrite row 81 with a
    // new value that the dictionary would then ignore.
    const key = 'Host City registrations may close early once capacity is reached.'
    expect(isSentinel(wl.byKey.get(key)!.value)).toBe(true)
    expect(wl.byKey.get(key)!.row).toBe(1085)
    expect(planSync(wl, [{ revisionId: 'x', key, value: '‏تجربة', author: 'A', createdAt: '2026-08-09T10:00:00.000Z', kind: 'edit' as const }]).edits).toEqual([])
  })
})
