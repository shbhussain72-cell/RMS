/**
 * repair-kanz.ts — the one-off repair of Kanz keyboard output already in the wordlist.
 *
 *   npx vite-node scripts/repair-kanz.ts -- --report          # analyse, write nothing
 *   npx vite-node scripts/repair-kanz.ts -- --write           # patch the workbook
 *
 * TypeScript and run through vite-node because it must use the REAL `verifyPatch` and the
 * real zip machinery from `api/_lib/`. A second copy of either would be the drift this
 * repository has been bitten by before — and here the thing that would drift is the check
 * standing between a bad patch and the only copy of the corpus.
 *
 * ── ROW-ADDRESSED, NOT KEY-ADDRESSED ─────────────────────────────────────────────────
 *
 * `patchWordlist` resolves an English key to a row through `byKey`, which deliberately
 * mirrors the generator's last-row-wins-except-sentinels rule. That is right for the sync and
 * WRONG here. Rows 76, 81, 89, 92 and 94 each carry a translation that is shadowed by a later
 * `remove` sentinel row, so `byKey` points at the sentinel. Four of those five shadowed rows
 * carry Kanz input. Going through `byKey` would have written the repair into the sentinel rows
 * — blanking five instructions the wordlist owner wrote — and left the corrupt rows corrupt.
 *
 * So the cell edit below is addressed by SHEET ROW. It is a small amount of XML handling that
 * `wordlistXlsx.ts` also does, which would normally be worth sharing; it is not shared because
 * exporting it means editing `api/`, and this script is a one-off that `verifyPatch` covers
 * completely. If this ever stops being a one-off, move it into `wordlistXlsx.ts` rather than
 * letting a second permanent copy exist.
 *
 * ── THE APPLYING RULE ────────────────────────────────────────────────────────────────
 *
 * Never a blanket substitution. For each corrupt WORD, every possible decoding is enumerated
 * — a doubled pair may be a substitution or may be genuine, and odd runs parse more than one
 * way — and the substitution is applied only when EXACTLY ONE decoding is attested in clean
 * form elsewhere in the same sheet. Anything else is held for the wordlist owner to rule on
 * and written to `docs/kanz-unattested.md`.
 *
 * A word is "attested" only against rows that are themselves clean. Attesting against another
 * corrupt row would make the check circular — it would confirm a guess with the same guess.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KANZ_PAIRS, UNMAPPED_DOUBLES } from '../src/i18n/kanzNorm.mjs'
import { findPart, partText, readZip, replacePart, writeZip } from '../api/_lib/zip'
import { SHEET_PART, readWordlist, verifyPatch } from '../api/_lib/wordlistXlsx'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const XLSX_PATH = resolve(ROOT, 'RMS_Mumineen_LSD_wordlist_v4.xlsx')
const HELD_DOC = resolve(ROOT, 'docs/kanz-unattested.md')

const LSD_COL = 'C'
const EN_COL = 'B'
const HE = 'هھہ'

// ── tokenising ───────────────────────────────────────────────────────────────────────

/**
 * Arabic-script letters AND the combining marks that sit on them.
 *
 * U+0652 (sukun) occurs 286 times in this column and is part of the word — `اْثثنا` is one
 * token, not `ا` plus `ثثنا`. Leaving the marks out of this class silently splits words, and
 * the damage is invisible: the first version of this analysis reported `ثث → پ` "attested 3
 * times", where the real word was `اْثث → اْپ` and the three attestations were the tails of
 * split tokens. Every count downstream was drawn from that.
 */
const isLetter = (c: string): boolean => {
  const p = c.codePointAt(0) ?? 0
  return (p >= 0x0620 && p <= 0x065f) || p === 0x0640 || p === 0x0670
    || (p >= 0x066e && p <= 0x06d3) || (p >= 0x06d5 && p <= 0x06ed)
}

interface Token { word: string; start: number; end: number }

function tokenise(s: string): Token[] {
  const out: Token[] = []
  let cur = ''
  let start = 0
  for (let i = 0; i <= s.length; i++) {
    const ch = s[i]
    if (ch !== undefined && isLetter(ch)) { if (!cur) start = i; cur += ch; continue }
    if (cur) { out.push({ word: cur, start, end: start + cur.length }); cur = '' }
  }
  return out
}

const DOUBLED = KANZ_PAIRS.map((p) => p.doubled)
const ANY_DOUBLE = new RegExp(`(${[...DOUBLED, ...UNMAPPED_DOUBLES].join('|')})`)
const UNMAPPED_RE = new RegExp(`(${UNMAPPED_DOUBLES.join('|')})`)

/** Every decoding of this word that changes something. Deduped. */
function decodings(word: string): string[] {
  const found = new Set<string>()
  const walk = (i: number, acc: string, changed: boolean): void => {
    if (i >= word.length) { if (changed) found.add(acc); return }
    for (const { doubled, single } of KANZ_PAIRS) {
      if (word.startsWith(doubled, i)) walk(i + 2, acc + single, true)
    }
    walk(i + 1, acc + word[i], changed)
  }
  walk(0, '', false)
  return [...found]
}

/** he characters, in order — must be identical before and after, apart from ہ that ظظ adds. */
const heProfile = (s: string): string => [...s].filter((c) => HE.includes(c)).join('')
const heProfileIgnoringGol = (s: string): string => heProfile(s).replace(/ہ/g, '')

// ── the corpus ───────────────────────────────────────────────────────────────────────

interface SheetRow { row: number; en: string; lsd: string }

/** Read every row's English and LSD cell, addressed by sheet row. */
function readRows(sheetXml: string, shared: string[]): SheetRow[] {
  const decodeX = (s: string) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  const unescapeXml = (s: string) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&')
  const textOf = (x: string) => decodeX(unescapeXml(x))
  const CELL = /<c\s+r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  const ROW = /<row\s+r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g

  const value = (attrs: string, inner: string | undefined): string => {
    if (inner === undefined) return ''
    const t = /\st="([^"]+)"/.exec(attrs)?.[1]
    if (t === 'inlineStr') return textOf([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
    if (v === undefined) return ''
    if (t === 's') return shared[Number(v)] ?? ''
    return textOf(v)
  }

  const out: SheetRow[] = []
  for (const rm of sheetXml.matchAll(ROW)) {
    const row = Number(rm[1])
    if (row === 1) continue
    const body = rm[3] ?? ''
    let en = ''
    let lsd = ''
    CELL.lastIndex = 0
    for (const cm of body.matchAll(CELL)) {
      const col = cm[1].replace(/\d+/g, '')
      if (col === EN_COL) en = value(cm[2], cm[3])
      else if (col === LSD_COL) lsd = value(cm[2], cm[3])
    }
    out.push({ row, en, lsd })
  }
  return out
}

function sharedStrings(entries: ReturnType<typeof readZip>): string[] {
  const part = findPart(entries, 'xl/sharedStrings.xml')
  if (!part) return []
  const xml = partText(part)
  const decodeX = (s: string) => s.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  const un = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&')
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => decodeX(un([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''))))
}

// ── the decision ─────────────────────────────────────────────────────────────────────

export interface Applied { row: number; en: string; word: string; to: string; attests: number }
export interface Held {
  row: number; en: string; lsd: string; word: string; why: string
  candidates: Array<{ text: string; attested: number; inCorruptRowsOnly: number }>
}

export function decide(rows: SheetRow[]) {
  // Attestation corpus: words from rows with NO Kanz doubles anywhere in them. A corrupt row
  // may never attest another — that is the circularity the whole check exists to avoid.
  const cleanCorpus = new Map<string, number>()
  const corruptCorpus = new Map<string, number>()
  for (const r of rows) {
    const rowIsCorrupt = ANY_DOUBLE.test(r.lsd)
    for (const { word } of tokenise(r.lsd)) {
      if (ANY_DOUBLE.test(word)) continue                    // the word itself is corrupt
      const into = rowIsCorrupt ? corruptCorpus : cleanCorpus
      into.set(word, (into.get(word) ?? 0) + 1)
    }
  }

  const applied: Applied[] = []
  const held: Held[] = []
  const newValue = new Map<number, string>()

  for (const r of rows) {
    if (!ANY_DOUBLE.test(r.lsd)) continue
    const toks = tokenise(r.lsd).filter((t) => ANY_DOUBLE.test(t.word))
    const edits: Array<{ start: number; end: number; text: string }> = []

    for (const t of toks) {
      const record = { row: r.row, en: r.en, lsd: r.lsd, word: t.word }

      if (UNMAPPED_RE.test(t.word)) {
        held.push({ ...record, why: `contains ${UNMAPPED_DOUBLES.join('/')}, which has no confirmed target in the mapping`, candidates: [] })
        continue
      }

      const cands = decodings(t.word)
      const attested = cands.filter((c) => cleanCorpus.has(c))
      const safe = attested.filter((c) => heProfileIgnoringGol(c) === heProfileIgnoringGol(t.word))

      if (safe.length === 1) {
        applied.push({ row: r.row, en: r.en, word: t.word, to: safe[0], attests: cleanCorpus.get(safe[0]) ?? 0 })
        edits.push({ start: t.start, end: t.end, text: safe[0] })
        continue
      }

      const why = cands.length === 0 ? 'no decoding is possible'
        : attested.length === 0 ? `none of the ${cands.length} possible decoding(s) is attested in a clean row`
        : safe.length === 0 ? 'the only attested decoding would add, drop or change a he character'
        : `${safe.length} decodings are all attested — ambiguous`
      held.push({
        ...record,
        why,
        candidates: cands
          .map((c) => ({ text: c, attested: cleanCorpus.get(c) ?? 0, inCorruptRowsOnly: corruptCorpus.get(c) ?? 0 }))
          .sort((a, b) => (b.attested - a.attested) || (b.inCorruptRowsOnly - a.inCorruptRowsOnly)),
      })
    }

    if (edits.length) {
      edits.sort((a, b) => b.start - a.start)                 // right to left, so offsets hold
      let s = r.lsd
      for (const e of edits) s = s.slice(0, e.start) + e.text + s.slice(e.end)
      newValue.set(r.row, s)
    }
  }

  return { applied, held, newValue, cleanCorpus, corruptCorpus }
}

// ── the cell edit ────────────────────────────────────────────────────────────────────

const escapeXml = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Replace column C of one row with an inline string, keeping the cell's own style. */
function writeCell(xml: string, row: number, value: string): string {
  const rowRe = new RegExp(`<row\\s+r="${row}"(?:[^>]*?/>|[^>]*?>[\\s\\S]*?</row>)`)
  const rowXml = rowRe.exec(xml)?.[0]
  if (!rowXml) throw new Error(`row ${row} not found in the sheet`)
  const cellRe = new RegExp(`<c\\s+r="${LSD_COL}${row}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`)
  const cell = cellRe.exec(rowXml)
  if (!cell) throw new Error(`row ${row} has no ${LSD_COL} cell to repair`)
  const style = /\ss="(\d+)"/.exec(cell[1])?.[0] ?? ''
  const replacement = `<c r="${LSD_COL}${row}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  return xml.replace(rowXml, rowXml.replace(cell[0], replacement))
}

// ── the held document ────────────────────────────────────────────────────────────────

/**
 * Everything the attestation check refused, with enough context to rule on each.
 *
 * Grouped by DISTINCT WORD rather than by row: a word held on 46 rows is one decision, not
 * forty-six, and a list per row would bury that. The row numbers are carried so any ruling
 * can be applied without re-deriving where it lands.
 */
function writeHeldDoc(held: Held[], applied: Applied[], allRows: SheetRow[]): void {
  interface Group { word: string; why: string; rows: number[]; ens: string[]; lsds: string[]; candidates: Held['candidates'] }
  const groups = new Map<string, Group>()
  for (const h of held) {
    let g = groups.get(h.word)
    if (!g) { g = { word: h.word, why: h.why, rows: [], ens: [], lsds: [], candidates: h.candidates }; groups.set(h.word, g) }
    g.rows.push(h.row)
    if (g.ens.length < 3) { g.ens.push(h.en); g.lsds.push(h.lsd) }
  }
  const ordered = [...groups.values()].sort((a, b) => b.rows.length - a.rows.length)

  // A decoding that exists ONLY inside other corrupt rows would be a circular refusal — the
  // check would be rejecting a repair because the evidence for it has not been repaired yet.
  const circular = ordered.filter((g) => g.candidates.some((c) => c.attested === 0 && c.inCorruptRowsOnly > 0))

  const L: string[] = []
  const P = (...lines: string[]) => L.push(...lines)

  P('# Kanz repair — what the attestation check refused', '',
    'Generated by `npx vite-node scripts/repair-kanz.ts -- --report`. Do not hand-edit — rerun it.', '',
    'Every entry here is a word the seven-pair mapping *could* convert, where the conversion was',
    'NOT applied because the result is not attested in clean form elsewhere in the sheet. They are',
    'listed for the wordlist owner to rule on individually. Nothing below has been changed in the',
    'spreadsheet.', '',
    '## Summary', '',
    `| | |`, `|---|---:|`,
    `| Corrupt word occurrences | ${applied.length + held.length} |`,
    `| Applied automatically | ${applied.length} |`,
    `| **Held for a ruling** | **${held.length}** |`,
    `| Distinct words held | ${ordered.length} |`,
    `| Rows carrying at least one held word | ${new Set(held.map((h) => h.row)).size} |`, '',
    '### Is the check refusing for the right reason?', '',
    'A refusal would be *circular* if the correct form existed only inside other corrupted rows —',
    'the repair would then be blocked by evidence that is itself waiting on the same repair.', '',
    `**Circular refusals found: ${circular.length}.**`,
    circular.length === 0
      ? 'Every held target is absent from the whole spreadsheet, clean rows and corrupt rows alike.'
        + ' The attestation corpus is not the limiting factor — these words genuinely never appear'
        + ' in correct form anywhere in the sheet.'
      : 'Listed individually below, marked ⟲.', '')

  P('## Held words', '',
    'Ordered by how many rows each appears on. `→` lines are the possible decodings; a decoding is',
    'only applied when exactly one of them attests.', '')

  for (const g of ordered) {
    P(`### \`${g.word}\` — ${g.rows.length} occurrence${g.rows.length === 1 ? '' : 's'}`, '')
    P(`**Why held:** ${g.why}`, '')
    if (g.candidates.length) {
      P('| decoding | attested in clean rows | present only in corrupt rows |', '|---|---:|---:|')
      for (const c of g.candidates) {
        P(`| \`${c.text}\` | ${c.attested} | ${c.inCorruptRowsOnly}${c.attested === 0 && c.inCorruptRowsOnly > 0 ? ' ⟲' : ''} |`)
      }
      P('')
    }
    P(`**Rows:** ${g.rows.join(', ')}`, '')
    P('**Examples:**', '')
    for (let i = 0; i < g.ens.length; i++) {
      P(`- **${g.ens[i].replace(/\|/g, '\\|').slice(0, 110) || '(no English key)'}**`, `  > ${g.lsds[i]}`)
    }
    P('')
  }

  P('## For reference: what WAS applied', '',
    'Each of these had exactly one possible decoding that attests in a clean row.', '',
    '| Kanz form | becomes | occurrences | target attested |', '|---|---|---:|---:|')
  const byWord = new Map<string, { to: string; n: number; attests: number }>()
  for (const a of applied) {
    const e = byWord.get(a.word) ?? { to: a.to, n: 0, attests: a.attests }
    e.n++
    byWord.set(a.word, e)
  }
  for (const [w, e] of [...byWord].sort((a, b) => b[1].n - a[1].n)) {
    P(`| \`${w}\` | \`${e.to}\` | ${e.n} | ${e.attests} |`)
  }
  P('')

  void allRows
  writeFileSync(HELD_DOC, L.join('\n'))
  console.log(`wrote ${HELD_DOC}`)
}

// ── run ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
/**
 * Which workbook to analyse. Defaults to the live one; `--from <path>` reads another.
 *
 * The held document is regenerated from the PRE-repair backup, because it has to describe the
 * whole decision — the 150 applied as well as the 221 held. Read from the live workbook after
 * a repair it would report "0 applied", which is true of that file and useless as a record of
 * what was done. `--write` is refused with `--from` for the obvious reason.
 */
const fromIdx = args.indexOf('--from')
const SOURCE = fromIdx === -1 ? XLSX_PATH : resolve(ROOT, args[fromIdx + 1] ?? '')
if (WRITE && fromIdx !== -1) throw new Error('--write and --from together would patch a file from another file\'s analysis')

const before = new Uint8Array(readFileSync(SOURCE))
const entries = readZip(before)
const sheet = findPart(entries, SHEET_PART)
if (!sheet) throw new Error(`${SHEET_PART} missing`)
const sheetXml = partText(sheet)
const rows = readRows(sheetXml, sharedStrings(entries))

const { applied, held, newValue } = decide(rows)

const rowsTouched = newValue.size
const rowsCorrupt = rows.filter((r) => ANY_DOUBLE.test(r.lsd)).length
const heldRows = new Set(held.map((h) => h.row))
const fully = [...newValue.keys()].filter((r) => !heldRows.has(r)).length

console.log(`corrupt rows            : ${rowsCorrupt}`)
console.log(`word occurrences        : ${applied.length + held.length}`)
console.log(`  applied               : ${applied.length}`)
console.log(`  held for a ruling     : ${held.length}`)
console.log(`rows repaired           : ${rowsTouched}  (${fully} fully, ${rowsTouched - fully} partially)`)
console.log(`rows left untouched     : ${rowsCorrupt - rowsTouched}`)

// ── the outcome assertion: no he character may move ──────────────────────────────────
let heMoved = 0
for (const [row, next] of newValue) {
  const was = rows.find((r) => r.row === row)!.lsd
  // ظظ→ہ legitimately ADDS a gol he; nothing may remove or change one.
  if (heProfileIgnoringGol(was) !== heProfileIgnoringGol(next)) {
    heMoved++
    console.error(`  he characters changed on row ${row}: "${heProfile(was)}" → "${heProfile(next)}"`)
  }
}
console.log(`he characters altered   : ${heMoved}   ${heMoved === 0 ? '(none — as required)' : '*** REFUSING ***'}`)
if (heMoved > 0) process.exit(1)

writeHeldDoc(held, applied, rows)

if (!WRITE) {
  console.log('\nreport only — nothing written. Pass --write to patch the workbook.')
  process.exit(0)
}

let xml = sheetXml
for (const [row, value] of newValue) xml = writeCell(xml, row, value)
const after = writeZip(replacePart(entries, SHEET_PART, Buffer.from(xml, 'utf8')))

// ── verification, against the bytes about to be written ──────────────────────────────
const wlBefore = readWordlist(before)
const wlAfter = readWordlist(after)
const askedKeys = [...newValue.keys()]
  .map((row) => rows.find((r) => r.row === row)?.en ?? '')
  .filter(Boolean)

const problems = verifyPatch(before, after, { updated: askedKeys, appended: [] })
if (problems.length) {
  console.error('\nverifyPatch REFUSED the patch:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

// verifyPatch is key-addressed, so it cannot see a change to a row whose key is shadowed by a
// later duplicate. Assert row by row that every cell is either untouched or exactly the value
// computed above — the outcome, not the intention that produced it.
const afterRows = readRows(partText(findPart(readZip(after), SHEET_PART)!), sharedStrings(readZip(after)))
let wrong = 0
for (const r of rows) {
  const now = afterRows.find((x) => x.row === r.row)
  if (!now) { console.error(`  row ${r.row} vanished`); wrong++; continue }
  const expected = newValue.get(r.row) ?? r.lsd
  if (now.lsd !== expected) { console.error(`  row ${r.row} is "${now.lsd}", expected "${expected}"`); wrong++ }
  if (now.en !== r.en) { console.error(`  row ${r.row} English changed`); wrong++ }
}
if (wrong) { console.error(`\n${wrong} row(s) did not land as computed — nothing written.`); process.exit(1) }
if (afterRows.length !== rows.length) { console.error('row count changed — nothing written.'); process.exit(1) }

console.log(`\nverifyPatch: clean. ${rows.length} rows checked cell by cell, ${wlBefore.byKey.size} keys before, ${wlAfter.byKey.size} after.`)
writeFileSync(XLSX_PATH, after)
console.log(`wrote ${XLSX_PATH}`)
