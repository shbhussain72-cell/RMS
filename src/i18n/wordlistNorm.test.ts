/**
 * wordlistNorm.test.ts — the ornament rows, and the duplicate they would generate.
 *
 * ── THE FAILURE THIS EXISTS TO PREVENT ───────────────────────────────────────────────
 *
 * The sync matches an override in the shared store back to its row in the .xlsx. Five English
 * cells in that sheet carry a `۞` ornament which `normKey` strips, so **a store key never
 * equals the raw cell text for those rows**. A sync that indexes rows by the raw cell finds no
 * match, concludes the key is new, and appends a second row for a string that already has one.
 * The wordlist then holds two rows for one key, `build-lsd-dict.mjs` sees a 1:1 violation, and
 * the failure surfaces at the next build rather than at the sync that caused it.
 *
 * `normKey` living in one module is only half the guard — that is a claim about the code being
 * available. This is the other half: the rows really do exist, they really do differ from their
 * keys, and no wordlist-touching module carries a second definition of the rule.
 *
 * Assertions run against the REAL spreadsheet and the REAL generated dictionary. A fixture
 * would keep passing on the day someone cleans the ornaments out of the sheet by hand, which is
 * exactly when the count is worth knowing about.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { KEY_ORNAMENTS, normKey } from './wordlistNorm.mjs'
import generated from './lsd.json'

const ROOT = resolve(__dirname, '../..')
const XLSX_PATH = resolve(ROOT, 'RMS_Mumineen_LSD_wordlist_v4.xlsx')
const EN_COL = 'English name'

const hasOrnament = (s: string) => { KEY_ORNAMENTS.lastIndex = 0; return KEY_ORNAMENTS.test(s) }

const rows: Record<string, string>[] = (() => {
  const wb = XLSX.read(readFileSync(XLSX_PATH), { type: 'buffer' })
  const sheet = wb.Sheets['Word List']
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }) as Record<string, string>[]
})()

/** Raw English cells, exactly as the sheet holds them — NOT normalised. */
const rawKeys = rows.map((r) => String(r[EN_COL] ?? '')).filter((s) => s.trim() !== '')
const ornamented = rawKeys.filter(hasOrnament)

describe('ornamented English cells', () => {
  it('the sheet still contains some — without this the rest of the suite is vacuous', () => {
    // A control, in the sense check-dev-only uses the word. If someone hand-cleans the sheet
    // the count goes to zero and every assertion below passes by having nothing to test; this
    // line turns that into a visible failure that says the guard is no longer guarding.
    expect(ornamented.length).toBeGreaterThan(0)
  })

  it('a store key NEVER equals the raw cell for an ornamented row', () => {
    // The property the sync depends on, stated directly. Store keys are normKey output; if one
    // of these ever compared equal to its raw cell the ornament was not being stripped.
    for (const raw of ornamented) expect(normKey(raw)).not.toBe(raw)
  })

  it('raw-equality matching MISSES those rows — this is the duplicate-row generator', () => {
    // Both indexes the sync could plausibly build, side by side. The point is not that the
    // normKey index works; it is that the raw index looks like it works — it resolves every
    // other key in the sheet — and fails only on these five.
    const byRaw = new Set(rawKeys)
    const byNorm = new Set(rawKeys.map(normKey))

    for (const raw of ornamented) {
      const storeKey = normKey(raw)
      expect(byNorm.has(storeKey)).toBe(true)   // the row is found, and gets a cell-level edit
      expect(byRaw.has(storeKey)).toBe(false)   // ...or is not found, and gets appended again
    }
  })

  it('normalising is idempotent, so a key cannot drift by being normalised twice', () => {
    for (const raw of rawKeys) expect(normKey(normKey(raw))).toBe(normKey(raw))
  })

  it('the generated dictionary is keyed the normalised way, never the raw way', () => {
    // Closes the loop at the other end: even if a sync did append a raw-keyed row, the build
    // would key it identically to the existing one. The two rows are indistinguishable to
    // lsd.json, which is why the 1:1 check is where this surfaces rather than in the app.
    const keys = Object.keys(generated as Record<string, unknown>).filter((k) => k !== '//')
    for (const raw of ornamented) {
      expect(keys).toContain(normKey(raw))
      expect(keys).not.toContain(raw)
    }
  })
})

/**
 * The other half of the guard: nobody re-derives the rule locally.
 *
 * Same shape as `scripts/probe-dom.test.mjs`. A copied predicate is a predicate that will
 * diverge, and here the divergence is invisible — the copy would strip four ornaments where
 * the original strips five, and only the fifth row would duplicate.
 */
describe('one definition of the rule', () => {
  /** Every module that turns a spreadsheet cell into a key or a value. Add to this list. */
  const CONSUMERS = [
    'scripts/build-lsd-dict.mjs',
    'src/shared/dictionaryApi.ts',
    'api/sync-wordlist.ts',   // written by the sync step; absent until then, and skipped
  ]

  const read = (rel: string): string | null => {
    try { return readFileSync(resolve(ROOT, rel), 'utf8') } catch { return null }
  }

  it('no wordlist consumer strips ornaments with its own rule', () => {
    const offenders: string[] = []
    for (const rel of CONSUMERS) {
      const src = read(rel)
      if (src === null) continue
      // STRIPPING is the thing that has to have one definition, so that is what this looks for:
      // an ornament glyph inside a `replace(...)`. Merely NAMING the glyphs is fine and stays
      // legal — `build-lsd-dict.mjs` counts ornate brackets in LSD *values* for its summary
      // line, which is a report about the translation, not a second opinion about the key.
      if (/replace\([^)]*[۞۩﴾﴿][^)]*\)/.test(src)) offenders.push(rel)
    }
    expect(offenders).toEqual([])
  })

  it('every wordlist consumer that exists imports normKey from wordlistNorm', () => {
    const missing: string[] = []
    for (const rel of CONSUMERS) {
      const src = read(rel)
      if (src === null) continue
      const importsNorm = /from ['"][^'"]*wordlistNorm\.mjs['"]/.test(src)
      // dictionaryApi works on keys that are already normalised by the panel, so it is allowed
      // to import only `bakedValue`. What it may not do is normalise them a second, different way.
      const derivesKeys = /replace\(\s*\/\\s\+\/|sheet_to_json|English name/.test(src)
      if (derivesKeys && !importsNorm) missing.push(rel)
    }
    expect(missing).toEqual([])
  })
})
