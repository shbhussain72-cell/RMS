/**
 * build-lsd-dict.mjs — generates `src/i18n/lsd.json` from the LSD wordlist Excel.
 *
 * NOTE: no `#!/usr/bin/env node` shebang. vite.config.ts imports this module, and Vite
 * bundles its config with esbuild — an inlined shebang becomes a syntax error there. The
 * npm script invokes `node` explicitly, so the shebang was never needed.
 *
 *   npm run build:lsd          one-shot (also chained into `npm run dev` and `npm run build`)
 *
 * It is ALSO imported by vite.config.ts's `lsdWordlistWatcher` plugin, which re-runs
 * `buildLsdDict()` whenever the xlsx is saved so the running app updates live. That is why
 * the work lives in an exported function that THROWS rather than calling process.exit —
 * a bad spreadsheet edit must not take the dev server down with it. Only the CLI wrapper
 * at the bottom of this file exits the process.
 *
 * Source of truth: `RMS_Mumineen_LSD_wordlist_v4.xlsx` (repo root), sheet "Word List",
 * columns `Page | English name | LSD name`. The Excel is authoritative for BOTH the
 * English and the LSD side — this script never edits, splits, or "fixes" either.
 *
 * Output shape (keyed on the English string itself, which is globally unique 1:1):
 *
 *   { "<english>": { "lsd": "<string>", "page": "<page>" } }
 *
 * Key normalisation: whitespace collapsed + trimmed. Casing is NOT touched — it is
 * meaningful in this wordlist (LIVE, OPTIONAL, RAZA STATUS). The same normalisation is
 * applied at lookup time in `src/i18n/index.tsx`, so both sides always agree.
 *
 * LSD values are trimmed but otherwise passed through byte-for-byte: internal spacing,
 * Latin tokens (`ITS ID`, `Login`, `PDF`), and ornate brackets ﴿…﴾ (U+FD3E/U+FD3F) are
 * all intentional and are preserved exactly.
 *
 * `page` is design-PDF screen metadata carried through for the coverage report only.
 * It is never used for lookup.
 *
 * ⚠️ src/i18n/lsd.json is a GENERATED BUILD ARTIFACT. Never hand-edit it — edit the
 *    xlsx and re-run this script. A "//" header key is emitted into the JSON saying so.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as XLSX from 'xlsx'
import { SENTINELS, bakedValue, normKey } from '../src/i18n/wordlistNorm.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

export const XLSX_PATH = resolve(ROOT, 'RMS_Mumineen_LSD_wordlist_v4.xlsx')
export const OUT_PATH = resolve(ROOT, 'src/i18n/lsd.json')
/**
 * Sheets that may carry rows. Both are optional and are MERGED.
 *
 * v2 of the wordlist split them for the translators' benefit; v4 merged everything back
 * into "Word List" and dropped "Placeholders" entirely. Both shapes work — a missing sheet
 * is skipped, not an error — so the sheet layout can keep changing without a code change:
 *   · "Word List"    — buttons, labels, headings: permanent UI chrome.
 *   · "Placeholders" — cities, names, ITS ids, zones, instructions: temporary/dynamic copy.
 * They are MERGED into one dictionary here; the app looks strings up by text and neither
 * knows nor cares which sheet a row came from. Moving a row between sheets in Excel is
 * therefore free — it re-files it for humans without changing app behaviour. The origin is
 * carried through as `list` purely so the coverage report can group by it.
 * A missing sheet is skipped, not an error (the split can be introduced gradually).
 */
const SHEETS = [
  { name: 'Word List', list: 'permanent' },
  { name: 'Placeholders', list: 'placeholder' },
]

const EN_COL = 'English name'
const LSD_COL = 'LSD name'
const PAGE_COL = 'Page'


/**
 * SENTINELS, KEY_ORNAMENTS, `normKey` and `bakedValue` now live in
 * `src/i18n/wordlistNorm.mjs` — see that file for why. They are imported rather than
 * declared here because the shared review store has to compare a live override against the
 * value THIS script baked, and a second copy of the baking rule would drift the moment
 * either side changed. Re-exported so existing importers of this module keep working.
 */
export { SENTINELS }

/**
 * Classify one raw LSD cell.
 *
 * Split out as a pure function so the sentinel rule is unit-testable without a spreadsheet
 * — see scripts/build-lsd-dict.test.mjs.
 *
 * @returns {{ value: string, sentinel: string|null }}
 */
export function classifyValue(raw) {
  const trimmed = String(raw ?? '').trim()
  const token = trimmed.toLowerCase()
  if (SENTINELS.has(token)) return { value: '', sentinel: token }
  return { value: bakedValue(trimmed), sentinel: null }
}


/**
 * Read the xlsx and write src/i18n/lsd.json.
 *
 * Excel writes atomically (temp file + rename) and briefly holds a lock, so a watcher
 * firing the instant you hit Save can hit EBUSY/ENOENT. `retries` re-attempts the READ
 * only; nothing is written until a complete parse succeeds, so a partial file can never
 * clobber a good dictionary.
 *
 * @returns {{count:number, rows:number, skippedEmptyRows:number, emptyLsd:string[], withLatin:number, withOrnate:number}}
 * @throws {Error} on a missing file/sheet/column, a blank English key, or a 1:1 violation.
 */
export async function buildLsdDict({ retries = 0, retryDelayMs = 250 } = {}) {
  let buf
  for (let attempt = 0; ; attempt++) {
    try { buf = readFileSync(XLSX_PATH); break } catch (err) {
      if (attempt >= retries) throw new Error(`could not read ${XLSX_PATH}\n  ${err.message}`)
      await new Promise((r) => setTimeout(r, retryDelayMs))
    }
  }

  const wb = XLSX.read(buf, { type: 'buffer' })
  const present = SHEETS.filter((s) => wb.SheetNames.includes(s.name))
  if (present.length === 0) {
    throw new Error(`none of the expected sheets (${SHEETS.map((s) => `"${s.name}"`).join(', ')}) were found. ` +
      `Sheets present: ${wb.SheetNames.map((s) => `"${s}"`).join(', ')}`)
  }

  const dict = {}
  const blankEnglish = []
  const emptyLsd = []
  const conflicts = []
  const sentinelRows = []
  const perSheet = {}
  let totalRows = 0
  let skippedEmptyRows = 0

  for (const sheet of present) {
    // `defval: ''` keeps blank cells as empty strings so a partially-filled row is still
    // visible here as a validation error, rather than silently collapsing into nothing.
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet.name], { defval: '', raw: false })
    if (rows.length === 0) { perSheet[sheet.name] = 0; continue }
    for (const col of [PAGE_COL, EN_COL, LSD_COL]) {
      if (!(col in rows[0])) {
        throw new Error(`sheet "${sheet.name}": expected column "${col}" not found. ` +
          `Columns present: ${Object.keys(rows[0]).map((c) => `"${c}"`).join(', ')}`)
      }
    }
    totalRows += rows.length
    let kept = 0

    rows.forEach((row, i) => {
      const rowNo = i + 2 // +1 for the header, +1 for 1-based spreadsheet rows
      const where = `${sheet.name}!${rowNo}`
      const english = normKey(row[EN_COL])
      const { value: lsd, sentinel } = classifyValue(row[LSD_COL])
      const rawLsd = String(row[LSD_COL] ?? '').trim()
      const page = normKey(row[PAGE_COL])

      if (!english && !rawLsd) { skippedEmptyRows++; return } // fully blank spacer row
      if (!english) { blankEnglish.push(where); return }
      if (sentinel) sentinelRows.push({ where, english, sentinel, page })
      else if (!lsd) emptyLsd.push(`${where}: "${english}"`)

      const prev = dict[english]
      const prevSentinel = prev ? prev.sentinel ?? null : null

      // A sentinel row does not "disagree" with a translation row for the same key — it
      // says something ABOUT it. Counting the pair as a 1:1 violation is what made the build
      // red once the wordlist owner annotated several already-translated guidelines: both
      // statements were true at once. The sentinel takes precedence (it is the newer, more
      // deliberate statement) and the string falls back to English until the instruction is
      // resolved, so no translation is silently discarded — the row is still in the xlsx.
      if (prev && prev.lsd !== lsd && !sentinel && !prevSentinel) {
        conflicts.push(`${where}: "${english}" → "${prev.lsd}" vs "${lsd}"`)
      }
      if (prevSentinel && !sentinel) { kept++; return } // keep the standing sentinel

      dict[english] = { lsd, page, list: sheet.list, ...(sentinel ? { sentinel } : {}) }
      kept++
    })
    perSheet[sheet.name] = kept
  }
  const rows = { length: totalRows } // keeps the reporting shape below unchanged

  if (blankEnglish.length) {
    throw new Error(`${blankEnglish.length} row(s) have an LSD value but no English key (${blankEnglish.join(', ')}). ` +
      `A row with no English string cannot be keyed — fix the xlsx.`)
  }
  if (conflicts.length) {
    throw new Error(`${conflicts.length} English key(s) map to more than one LSD value — the 1:1 assumption is broken:\n  ` +
      conflicts.join('\n  '))
  }

  const payload = {
    '//': 'GENERATED FILE — do not edit by hand. Edit RMS_Mumineen_LSD_wordlist_v4.xlsx and run `npm run build:lsd` (the dev server regenerates this automatically on save).',
    ...dict,
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8')

  return {
    count: Object.keys(dict).length,
    rows: rows.length,
    skippedEmptyRows,
    emptyLsd,
    sentinelRows,
    perSheet,
    withLatin: Object.values(dict).filter((e) => /[A-Za-z]/.test(e.lsd)).length,
    withOrnate: Object.values(dict).filter((e) => e.lsd.includes('﴾') || e.lsd.includes('﴿')).length,
  }
}

// ─── CLI entry ────────────────────────────────────────────────────────────────
// Only runs when invoked directly (`node scripts/build-lsd-dict.mjs`), not on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const r = await buildLsdDict()
    const sheetSummary = Object.entries(r.perSheet).map(([n, c]) => `"${n}" ${c}`).join(' + ')
    console.log(`\n  source : RMS_Mumineen_LSD_wordlist_v4.xlsx → ${sheetSummary}`)
    console.log(`  rows   : ${r.rows} data rows${r.skippedEmptyRows ? ` (${r.skippedEmptyRows} blank rows skipped)` : ''}`)
    console.log(`  entries: ${r.count}`)
    if (r.sentinelRows.length) {
      // Loud on purpose. A sentinel is an unresolved instruction from the wordlist owner,
      // not a translation, and the string is showing English until somebody acts on it.
      console.warn(`
  ⚠ ${r.sentinelRows.length} row(s) contain a SENTINEL, not a translation — these fall back to English:`)
      for (const row of r.sentinelRows) console.warn(`      ${row.where}: "${row.english}" → "${row.sentinel}"`)
      console.warn(`      (sentinels recognised: ${[...SENTINELS].join(', ')})`)
    }
    console.log(`  notes  : ${r.withLatin} entries mix Latin tokens into LSD, ${r.withOrnate} contain ornate brackets ﴿…﴾`)
    if (r.emptyLsd.length) {
      // Not fatal: an English key with no translation yet simply falls back to English at
      // runtime, exactly like a key that is absent. Surfaced loudly so it is not a surprise.
      console.warn(`\n  ⚠ ${r.emptyLsd.length} entr${r.emptyLsd.length === 1 ? 'y has' : 'ies have'} an empty LSD value (will fall back to English):`)
      r.emptyLsd.slice(0, 10).forEach((p) => console.warn(`      ${p}`))
      if (r.emptyLsd.length > 10) console.warn(`      … and ${r.emptyLsd.length - 10} more`)
    }
    console.log(`\n✓ wrote ${r.count} entries → src/i18n/lsd.json\n`)
  } catch (err) {
    console.error(`\n✗ build:lsd — ${err.message}\n`)
    process.exit(1)
  }
}
