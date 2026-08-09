/**
 * wordlistXlsx.ts — write a value into a wordlist cell without rewriting the workbook.
 *
 * ═══ READ THIS BEFORE REACHING FOR `XLSX.writeFile` ══════════════════════════════════
 *
 * It is one line and it destroys the spreadsheet. Measured on the real file: a SheetJS
 * read→write round trip returns `styles.xml` carrying **Calibri alone**. Kanz-al-Lulu — the
 * font every cell in the wordlist is set in, and the one the `Read me` sheet names in its
 * last line — is gone from all 1085 rows. `sharedStrings.xml` is dropped entirely and every
 * cell comes back as an inline string.
 *
 * Every VALUE would still be correct. Every assertion about values would still pass. The LSD
 * column would render in a fallback face and nothing anywhere would say so.
 *
 * So: this module edits `xl/worksheets/sheet1.xml` as text and hands it to `replacePart`,
 * which re-encodes that one part and copies every other part of the zip at the compressed
 * level. `xl/styles.xml` and `xl/sharedStrings.xml` come out byte-identical because nothing
 * can touch them, and `api/_lib/sync.test.ts` asserts that rather than trusting it.
 * ════════════════════════════════════════════════════════════════════════════════════
 *
 * ── APPEND ONLY. INSERT AND SORT ARE PROHIBITED ──────────────────────────────────────
 *
 * Not "avoided" — prohibited. The `Read me` sheet cites Word List row numbers in PROSE,
 * under *ASSUMPTIONS — reject any of these*: rows 230, 231, 312, 457 and 500. Those are the
 * translations the wordlist owner has flagged as open to challenge. Renumbering rows would
 * silently repoint five citations at unrelated strings, and the damage would be to the
 * documentation rather than to the data — nothing would fail, no diff would look wrong, and
 * the sheet would go on saying "Row 231" about a row that had moved.
 *
 * New keys are therefore appended at the end of the sheet, with an EMPTY Page column, which
 * is the placement the wordlist owner chose. A future rail that wants to reorder for tidiness
 * is asking to break documentation.
 *
 * ── WRITTEN AS INLINE STRINGS, ON PURPOSE ────────────────────────────────────────────
 *
 * A value could be added to `sharedStrings.xml` and referenced by index, which is what Excel
 * does. That means editing a second part — reindexing, keeping `count`/`uniqueCount` honest,
 * and one arithmetic slip away from every cell in the sheet pointing at the wrong string.
 * `t="inlineStr"` keeps the whole edit inside one part. Excel reads it, SheetJS reads it, and
 * Excel rewrites it as a shared string the next time a human saves the file.
 *
 * The cell's `s` (style) attribute is preserved on an edit and copied from an existing cell on
 * an append, so the font travels with the value rather than being restated here.
 */
import { isSentinel, normKey } from '../../src/i18n/wordlistNorm.mjs'
import { findPart, partBytes, partText, readZip, replacePart, writeZip, type ZipEntry } from './zip'

export const SHEET_PART = 'xl/worksheets/sheet1.xml'
export const STYLES_PART = 'xl/styles.xml'
export const SHARED_STRINGS_PART = 'xl/sharedStrings.xml'

/** Columns, by the header row: `Page | English name | LSD name`. */
const PAGE_COL = 'A'
const EN_COL = 'B'
const LSD_COL = 'C'

export class WordlistError extends Error {}

export interface WordlistRow {
  /** 1-based sheet row number. */
  row: number
  /** The English cell as `normKey` sees it — the shape a store key is in. */
  key: string
  /** The LSD cell's current text, undecorated. */
  value: string
}

export interface Wordlist {
  entries: ZipEntry[]
  sheetXml: string
  /** normKey(English) → row. Ornamented cells are keyed the stripped way; see wordlistNorm. */
  byKey: Map<string, WordlistRow>
  rowCount: number
  lastRow: number
}

// ── XML text helpers ─────────────────────────────────────────────────────────────────

/**
 * Excel escapes characters it cannot put in XML as `_xHHHH_`. SheetJS decodes these when it
 * reads, so an index built without decoding would key a row differently from the way the
 * dictionary generator keyed it, and that row would never match a store key.
 */
const decodeX = (s: string) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))

const unescapeXml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&')

const escapeXml = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const textOf = (xml: string) => decodeX(unescapeXml(xml))

// ── reading ──────────────────────────────────────────────────────────────────────────

/** `<si>` entries of sharedStrings.xml, flattened — needed to READ the sheet, never to write it. */
function sharedStrings(entries: ZipEntry[]): string[] {
  const part = findPart(entries, SHARED_STRINGS_PART)
  if (!part) return []
  const xml = partText(part)
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    textOf([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
}

const colOf = (ref: string) => ref.replace(/\d+/g, '')

/** One `<c>` element, whether self-closing or not. */
const CELL_RE = /<c\s+r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
const ROW_RE = /<row\s+r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g

function cellValue(attrs: string, inner: string | undefined, shared: string[]): string {
  if (inner === undefined) return ''
  const t = /\st="([^"]+)"/.exec(attrs)?.[1]
  if (t === 'inlineStr') {
    return textOf([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
  }
  const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
  if (v === undefined) return ''
  if (t === 's') return shared[Number(v)] ?? ''
  return textOf(v)
}

export function readWordlist(bytes: Uint8Array): Wordlist {
  const entries = readZip(bytes)
  const sheet = findPart(entries, SHEET_PART)
  if (!sheet) throw new WordlistError(`${SHEET_PART} is missing — this is not the wordlist workbook`)
  if (!findPart(entries, STYLES_PART)) throw new WordlistError(`${STYLES_PART} is missing — refusing to write a workbook with no styles`)

  const sheetXml = partText(sheet)
  const shared = sharedStrings(entries)

  const byKey = new Map<string, WordlistRow>()
  let rowCount = 0
  let lastRow = 0

  ROW_RE.lastIndex = 0
  for (const rm of sheetXml.matchAll(ROW_RE)) {
    const row = Number(rm[1])
    lastRow = Math.max(lastRow, row)
    rowCount++
    if (row === 1) continue                        // the header
    const body = rm[3] ?? ''
    let english = ''
    let value = ''
    CELL_RE.lastIndex = 0
    for (const cm of body.matchAll(CELL_RE)) {
      const col = colOf(cm[1])
      if (col === EN_COL) english = cellValue(cm[2], cm[3], shared)
      else if (col === LSD_COL) value = cellValue(cm[2], cm[3], shared)
    }
    const key = normKey(english)
    if (!key) continue

    // ── DUPLICATE KEYS: MIRROR THE GENERATOR EXACTLY ────────────────────────────────
    //
    // Six English keys appear twice in this sheet. Five of them carry a translation early on
    // and a `remove` sentinel near the end, because the wordlist owner annotated strings that
    // had already been translated; `Host City` is a plain duplicate. So "which row is this
    // key" has an answer, and it is not obviously the first one.
    //
    // `scripts/build-lsd-dict.mjs` takes the LAST row for a key, except that a standing
    // sentinel is never replaced by a later translation. That is the rule reproduced here,
    // because the sync must edit the row the BUILD reads. First-wins was tried and would have
    // written five values into rows the generated dictionary ignores — the commit would land,
    // the diff would look right, and the app would never show the new text.
    //
    // `sync.test.ts` asserts the two agree, key by key, against the real lsd.json.
    const prev = byKey.get(key)
    if (prev && isSentinel(prev.value) && !isSentinel(value)) continue
    byKey.set(key, { row, key, value: value.trim() })
  }

  return { entries, sheetXml, byKey, rowCount, lastRow }
}

// ── writing ──────────────────────────────────────────────────────────────────────────

const inlineCell = (ref: string, style: string, value: string) =>
  `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`

/** The `s="…"` of an existing LSD cell, so an appended row carries the sheet's own font. */
function lsdStyleAttr(sheetXml: string): string {
  const m = new RegExp(`<c\\s+r="${LSD_COL}\\d+"([^>]*?)(?:/>|>)`).exec(sheetXml)
  return /\ss="(\d+)"/.exec(m?.[1] ?? '')?.[0] ?? ''
}

/** Replace (or insert) the LSD cell inside one `<row>` element, keeping column order. */
function withLsdCell(rowXml: string, row: number, value: string, styleFallback: string): string {
  const ref = `${LSD_COL}${row}`
  const existing = new RegExp(`<c\\s+r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`).exec(rowXml)
  if (existing) {
    const style = /\ss="(\d+)"/.exec(existing[1])?.[0] ?? styleFallback
    return rowXml.replace(existing[0], inlineCell(ref, style, value))
  }
  // No LSD cell yet — put it after the English cell so the columns stay in order. Excel
  // tolerates unordered cells; other readers are less forgiving, and a file that only opens
  // in one program is not a source of truth.
  const after = new RegExp(`<c\\s+r="${EN_COL}${row}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(rowXml)
  const cell = inlineCell(ref, styleFallback, value)
  if (after) return rowXml.replace(after[0], after[0] + cell)
  return rowXml.replace(/(<row\s+r="\d+"[^>]*>)/, `$1${cell}`)
}

export interface Edit { key: string; value: string }
export interface PatchResult {
  bytes: Uint8Array
  updated: string[]
  appended: string[]
  rowsBefore: number
  rowsAfter: number
}

/**
 * Apply edits to the workbook and return new bytes.
 *
 * Existing key → column C of its row is replaced, nothing else in the row is touched.
 * Unknown key → a new row at the END, with an empty Page column.
 */
export function patchWordlist(bytes: Uint8Array, edits: Edit[]): PatchResult {
  const wl = readWordlist(bytes)
  const styleFallback = lsdStyleAttr(wl.sheetXml)
  let xml = wl.sheetXml
  const updated: string[] = []
  const appended: Edit[] = []

  for (const edit of edits) {
    const key = normKey(edit.key)
    const found = wl.byKey.get(key)
    if (!found) { appended.push({ key, value: edit.value }); continue }
    const rowRe = new RegExp(`<row\\s+r="${found.row}"(?:[^>]*?/>|[^>]*?>[\\s\\S]*?</row>)`)
    const rowXml = rowRe.exec(xml)?.[0]
    if (!rowXml) throw new WordlistError(`row ${found.row} for "${key}" vanished between index and patch`)
    xml = xml.replace(rowXml, withLsdCell(rowXml, found.row, edit.value, styleFallback))
    updated.push(key)
  }

  let nextRow = wl.lastRow
  if (appended.length) {
    const newRows = appended.map((e) => {
      nextRow++
      // No A cell at all: the Page column is left EMPTY for appended rows, which is what the
      // wordlist owner asked for. An absent cell and a cell containing "" are the same thing
      // to every reader of this sheet, and the absent one does not invent a style.
      return `<row r="${nextRow}" spans="1:3">`
        + inlineCell(`${EN_COL}${nextRow}`, styleFallback, e.key)
        + inlineCell(`${LSD_COL}${nextRow}`, styleFallback, e.value)
        + '</row>'
    }).join('')
    if (!/<\/sheetData>/.test(xml)) throw new WordlistError('sheet has no </sheetData> — refusing to guess where rows go')
    xml = xml.replace('</sheetData>', `${newRows}</sheetData>`)
    xml = xml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/, (_m, c1, r1, c2) => `<dimension ref="${c1}${r1}:${c2}${nextRow}"`)
  }

  return {
    bytes: writeZip(replacePart(wl.entries, SHEET_PART, Buffer.from(xml, 'utf8'))),
    updated,
    appended: appended.map((e) => e.key),
    rowsBefore: wl.rowCount,
    rowsAfter: wl.rowCount + appended.length,
  }
}

// ── verification ─────────────────────────────────────────────────────────────────────

/** Font face names declared in styles.xml, in order. */
const fontNames = (entries: ZipEntry[]): string[] => {
  const part = findPart(entries, STYLES_PART)
  if (!part) return []
  return [...partText(part).matchAll(/<name val="([^"]*)"/g)].map((m) => m[1])
}

/**
 * Cells outside the three wordlist columns, by reference.
 *
 * There is exactly one in the real sheet: `F370` holds the number 1448, left behind by
 * whoever was editing rows 369-384. It is debris — row 1 has no D/E/F cell, so no column was
 * ever named, and the `Read me` dates the wordlist to "the 1448H Iqtibasat" — but it is
 * somebody else's debris in somebody else's spreadsheet, and a sync that quietly dropped it
 * would be deciding that on their behalf. Anything only verifiable by hand is eventually not
 * verified, so it is checked here instead.
 */
export function strayCells(sheetXml: string, entries: ZipEntry[]): Map<string, string> {
  const shared = sharedStrings(entries)
  const out = new Map<string, string>()
  CELL_RE.lastIndex = 0
  for (const m of sheetXml.matchAll(CELL_RE)) {
    const col = colOf(m[1])
    if (col === PAGE_COL || col === EN_COL || col === LSD_COL) continue
    out.set(m[1], cellValue(m[2], m[3], shared))
  }
  return out
}

/**
 * Everything that must still be true after a patch, checked against the bytes that are about
 * to be committed rather than against the intention that produced them.
 *
 * Run by the sync BEFORE it pushes, so font loss aborts the sync instead of surviving it.
 * Returns a list of problems; empty means the patch is safe to commit.
 */
export function verifyPatch(
  before: Uint8Array,
  after: Uint8Array,
  expected: { updated: string[]; appended: string[] },
): string[] {
  const problems: string[] = []
  let a: ZipEntry[]
  let b: ZipEntry[]
  try {
    b = readZip(before)
    a = readZip(after)
  } catch (err) {
    return [`the patched workbook does not read back as a zip: ${err instanceof Error ? err.message : String(err)}`]
  }

  // 1. Same parts, no additions and no losses.
  const namesBefore = b.map((e) => e.name).sort()
  const namesAfter = a.map((e) => e.name).sort()
  if (namesBefore.join('\n') !== namesAfter.join('\n')) {
    const lost = namesBefore.filter((n) => !namesAfter.includes(n))
    const gained = namesAfter.filter((n) => !namesBefore.includes(n))
    problems.push(`the archive's parts changed — lost [${lost.join(', ')}], gained [${gained.join(', ')}]`)
  }

  // 2. Every part except the one sheet is byte-identical. This is the whole design: untouched
  //    parts are copied at the compressed level, so a difference here means something reached
  //    them that should not have been able to.
  for (const part of b) {
    if (part.name === SHEET_PART) continue
    const other = findPart(a, part.name)
    if (!other) continue                                  // already reported above
    const x = partBytes(part)
    const y = partBytes(other)
    if (x.length !== y.length || !x.every((v, i) => v === y[i])) {
      problems.push(`${part.name} changed — only ${SHEET_PART} may be rewritten`)
    }
  }

  // 3. Named explicitly, because "styles.xml differs" does not tell the next person that the
  //    LSD column has just lost its typeface. This is the failure a SheetJS write produces.
  for (const required of [STYLES_PART, SHARED_STRINGS_PART]) {
    if (!findPart(a, required)) problems.push(`${required} is missing from the patched workbook`)
  }
  const fb = fontNames(b)
  const fa = fontNames(a)
  if (fb.join('|') !== fa.join('|')) {
    problems.push(`the workbook's fonts changed: [${fb.join(', ')}] became [${fa.join(', ')}] — every cell in the sheet is set in one of these`)
  }

  const sheetB = findPart(b, SHEET_PART)
  const sheetA = findPart(a, SHEET_PART)
  if (!sheetB || !sheetA) return [...problems, `${SHEET_PART} is missing`]
  const xmlB = partText(sheetB)
  const xmlA = partText(sheetA)

  // 4. Sheet-level presentation that lives in the part we DID rewrite, so byte-identity
  //    cannot cover it. The wordlist is read right-to-left; losing that is not cosmetic.
  if (/rightToLeft="1"/.test(xmlB) && !/rightToLeft="1"/.test(xmlA)) {
    problems.push('the sheet lost its right-to-left reading order')
  }
  if (/<cols>/.test(xmlB) && !/<cols>/.test(xmlA)) problems.push('the sheet lost its column widths')

  // 5. Cells outside A:C — the 1448.
  const strayB = strayCells(xmlB, b)
  const strayA = strayCells(xmlA, a)
  for (const [ref, value] of strayB) {
    if (!strayA.has(ref)) problems.push(`cell ${ref} (${value}) was dropped — it is not the sync's to delete`)
    else if (strayA.get(ref) !== value) problems.push(`cell ${ref} changed from ${value} to ${strayA.get(ref)}`)
  }

  // 6. Keys: nothing lost, nothing changed that was not asked for.
  const wlB = readWordlist(before)
  const wlA = readWordlist(after)
  if (wlA.rowCount < wlB.rowCount) problems.push(`the sheet lost rows: ${wlB.rowCount} became ${wlA.rowCount}`)
  const asked = new Set([...expected.updated, ...expected.appended].map((k) => normKey(k)))
  for (const [key, row] of wlB.byKey) {
    const now = wlA.byKey.get(key)
    if (!now) { problems.push(`key "${key}" is no longer in the sheet`); continue }
    if (now.value !== row.value && !asked.has(key)) {
      problems.push(`key "${key}" changed without being asked to: "${row.value}" became "${now.value}"`)
    }
  }
  const gained = [...wlA.byKey.keys()].filter((k) => !wlB.byKey.has(k))
  const unexpected = gained.filter((k) => !asked.has(k))
  if (unexpected.length) problems.push(`rows appeared that were not requested: ${unexpected.slice(0, 5).join(', ')}`)

  return problems
}
