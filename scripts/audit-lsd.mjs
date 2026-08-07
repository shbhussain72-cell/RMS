/**
 * audit-lsd.mjs — classify every row of the generated LSD dictionary.
 *
 * READ ONLY. This script never edits `src/i18n/lsd.json` (a build artifact of
 * RMS_Mumineen_LSD_wordlist_v4.xlsx) and never edits the workbook. It reports; the
 * wordlist owner repairs.
 *
 *   node scripts/audit-lsd.mjs              # print the report
 *   node scripts/audit-lsd.mjs --write      # also write docs/lsd-gaps.md
 *   node scripts/audit-lsd.mjs --json       # machine-readable, for diffing sessions
 *
 * Deterministic by construction: every collection is sorted by a stable key before it is
 * emitted, and nothing depends on object insertion order, the clock, or the filesystem.
 * Running it twice produces byte-identical output.
 *
 * ── The four defect classes ──────────────────────────────────────────────────
 *
 * CORRUPTED KEY   The ENGLISH column contains Arabic-script characters. The key is what
 *                 the app looks up, so such a row can never match anything on screen —
 *                 it is dead weight, and the English it was meant to cover is silently
 *                 untranslated. Caused by a find/replace that wrote the LSD value into
 *                 the key column.
 *
 * MOJIBAKE        The LSD value carries doubled consonants (ثث سس طط ضض صص ظظ). This is
 *                 the signature of a legacy non-Unicode Dawat font transcoded byte-by-byte:
 *                 a glyph that occupied one codepoint in the old encoding lands as two
 *                 identical Arabic letters in Unicode. The text is unreadable and CANNOT
 *                 be repaired programmatically — the original keystrokes are gone. Rows
 *                 are emitted with their source page so the owner can re-key them.
 *
 * EMPTY           Row exists, LSD cell blank. Renders English.
 *
 * IDENTITY        LSD value equals the English key. Either an untranslated placeholder or
 *                 a deliberate loanword (`PDF`, `zone`). Reported without judgement —
 *                 classification is the owner's call, not this script's.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const DICT_PATH = resolve(ROOT, 'src/i18n/lsd.json')
const DOC_PATH = resolve(ROOT, 'docs/lsd-gaps.md')

const args = new Set(process.argv.slice(2))
const WRITE = args.has('--write')
const AS_JSON = args.has('--json')

// ─── character classes ────────────────────────────────────────────────────────
// Escapes rather than literals: the ranges end at U+FEFF, an invisible character that
// silently vanishes from editors and diffs if written literally.
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const LATIN_WORD = /[A-Za-z]{2,}/
/** Zero-width direction controls. Presentation only — stripped before any comparison. */
const BIDI_MARKS = /[‎‏؜⁦-⁩‪-‮]/g
const BIDI_MARKS_G = /[‎‏؜⁦-⁩‪-‮]/g

/**
 * Doubled-consonant signature of the legacy-font transcode.
 *
 * Deliberately limited to the six pairs observed in this wordlist rather than "any
 * repeated Arabic letter": gemination is normal in Arabic orthography, so a broader rule
 * would flag correct text. These six do not occur naturally in the corpus.
 */
const MOJIBAKE = /(ثث|سس|طط|ضض|صص|ظظ)/g

const stripMarks = (s) => String(s ?? '').replace(BIDI_MARKS, '')

// ─── load ─────────────────────────────────────────────────────────────────────
const dict = JSON.parse(readFileSync(DICT_PATH, 'utf8'))
const rows = Object.entries(dict)
  .filter(([k]) => k !== '//')
  .map(([key, v]) => ({
    key,
    lsd: String(v?.lsd ?? ''),
    page: String(v?.page ?? ''),
    list: String(v?.list ?? ''),
    sentinel: v?.sentinel ? String(v.sentinel) : null,
  }))
  // Sorted once, here. Every downstream list inherits this order, which is what makes
  // repeated runs byte-identical.
  .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

const total = rows.length

// ─── classify ─────────────────────────────────────────────────────────────────
const corruptedKeys = []
const mojibake = []
const empty = []
const POLICY = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/loanword-policy.json'), 'utf8'))

const identity = []      // B1 — identity because nobody has translated it yet
const identityPolicy = [] // B2 — identity is the CORRECT final state (loanword/technical)
const sentinels = []      // rows holding an instruction instead of a translation

for (const r of rows) {
  if (r.sentinel) { sentinels.push({ key: r.key, page: r.page, sentinel: r.sentinel }); continue }
  const value = stripMarks(r.lsd).trim()

  // Two ways a key becomes unmatchable, reported together because the consequence is
  // identical: the app looks up by English string, so the row is dead and the English it
  // covered renders untranslated.
  //   · Arabic script in the key  — a find/replace wrote the LSD value into the key column
  //   · an invisible bidi mark    — U+200F etc. travels with a copy/paste out of an RTL
  //                                 cell and is undetectable by eye in Excel
  const invisible = r.key.match(BIDI_MARKS_G) || []
  if (ARABIC.test(r.key) || invisible.length) {
    corruptedKeys.push({
      key: r.key,
      page: r.page,
      kind: ARABIC.test(r.key) ? 'arabic-in-key' : 'invisible-mark',
      marks: invisible.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' '),
      // The Latin remnant, if any, is the only clue to what the key was meant to be.
      latinRemnant: (r.key.match(/[A-Za-z][A-Za-z ’'&/()-]*/g) || []).join(' ').trim(),
      value: r.lsd,
    })
  }

  if (!value) {
    empty.push({ key: r.key, page: r.page })
    continue // an empty value cannot also be mojibake or identity
  }

  const hits = value.match(MOJIBAKE)
  if (hits) {
    mojibake.push({
      key: r.key,
      value: r.lsd,
      page: r.page,
      // Which pairs, and how many — lets the owner spot systematic vs one-off damage.
      pairs: [...new Set(hits)].sort().join(' '),
      count: hits.length,
    })
  }

  // Compared with direction marks stripped: the build step prefixes U+200F to mixed-script
  // values, so a byte-for-byte test would miss every pass-through that has one.
  // Identity splits in two, and conflating them is what made this number useless: a row that
  // reads the same in both languages is either an untranslated gap or a deliberate loanword,
  // and only one of those is anyone's problem. The split is driven by
  // src/i18n/loanword-policy.json so it survives regeneration instead of being re-argued.
  if (value.toLowerCase() === stripMarks(r.key).trim().toLowerCase()) {
    const reason = POLICY.identityByPolicy.entries[r.key]
    if (reason) identityPolicy.push({ key: r.key, page: r.page, value: r.lsd, reason })
    else identity.push({ key: r.key, page: r.page, value: r.lsd, note: POLICY.needsOwnerDecision.entries[r.key] || '' })
  }
}

const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : '0.0')

/** A row is "usable" only if it has a value that is not empty, mojibake or a pass-through. */
const defective = new Set([
  ...corruptedKeys.map((r) => r.key),
  ...mojibake.map((r) => r.key),
  ...empty.map((r) => r.key),
  ...identity.map((r) => r.key),
])
const usable = total - defective.size

const summary = {
  totalEntries: total,
  corruptedKeys: corruptedKeys.length,
  mojibakeValues: mojibake.length,
  emptyValues: empty.length,
  identityPassThroughs: identity.length,
  identityByPolicy: identityPolicy.length,
  sentinelRows: sentinels.length,
  distinctDefectiveRows: defective.size,
  usableRows: usable,
  usablePct: Number(pct(usable)),
}

// ─── report ───────────────────────────────────────────────────────────────────
if (AS_JSON) {
  process.stdout.write(`${JSON.stringify({ summary, corruptedKeys, mojibake, empty, identity }, null, 2)}\n`)
} else {
  const line = (label, n) => `  ${String(n).padStart(5)}  ${pct(n).padStart(5)}%  ${label}`
  console.log('LSD dictionary audit')
  console.log(`  source: src/i18n/lsd.json (generated from RMS_Mumineen_LSD_wordlist_v4.xlsx)`)
  console.log(`  ${total} entries\n`)
  console.log(line('corrupted English keys (contain Arabic script)', corruptedKeys.length))
  console.log(line('mojibake values (legacy-font transcode)', mojibake.length))
  console.log(line('empty values', empty.length))
  console.log(line('identity — B1, awaiting translation', identity.length))
  console.log(line('identity — B2, correct by loanword policy', identityPolicy.length))
  console.log(line('sentinel rows (instruction, not translation)', sentinels.length))
  console.log(line('— distinct defective rows', defective.size))
  console.log(line('usable rows', usable))
  if (corruptedKeys.length) {
    console.log('\ncorrupted keys:')
    for (const r of corruptedKeys) console.log(`  p${(r.page || '—').padEnd(12)} ${r.kind.padEnd(15)} ${JSON.stringify(r.key)}${r.marks ? '  ' + r.marks : ''}`)
  }
  console.log(`\nmojibake pairs seen: ${
    [...new Set(mojibake.flatMap((m) => m.pairs.split(' ')))].sort().join(' ') || '—'
  }`)
  if (!WRITE) console.log('\n(run with --write to regenerate docs/lsd-gaps.md)')
}

// ─── docs/lsd-gaps.md ─────────────────────────────────────────────────────────
if (WRITE) {
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const clip = (s, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s)
  const md = []
  const P = (...l) => md.push(...l)

  P('# LSD gaps — committed baseline', '')
  P('Generated by `node scripts/audit-lsd.mjs --write`. Do not hand-edit — rerun the script.')
  P('')
  P('This file is the reference point for every later remediation session: the numbers below')
  P('are the "before". A session is judged by the delta against them, so regenerate it only')
  P('when you intend to move the baseline.')
  P('')
  P('Source: `src/i18n/lsd.json`, generated from `RMS_Mumineen_LSD_wordlist_v4.xlsx` via')
  P('`npm run build:lsd`. Neither file is modified by the audit.')
  P('')
  P('## Summary', '')
  P('| Class | Rows | % of dictionary |', '|---|---:|---:|')
  P(`| Total entries | ${total} | 100.0% |`)
  P(`| Corrupted English keys | ${corruptedKeys.length} | ${pct(corruptedKeys.length)}% |`)
  P(`| Mojibake values | ${mojibake.length} | ${pct(mojibake.length)}% |`)
  P(`| Empty values | ${empty.length} | ${pct(empty.length)}% |`)
  P(`| Identity pass-throughs | ${identity.length} | ${pct(identity.length)}% |`)
  P(`| **Distinct defective rows** | **${defective.size}** | **${pct(defective.size)}%** |`)
  P(`| **Usable rows** | **${usable}** | **${pct(usable)}%** |`)
  P('')
  P('Classes overlap — a corrupted key can also hold a mojibake value — so the four counts')
  P('sum to more than the distinct-defective total.')
  P('')

  P(`## 1. Corrupted English keys (${corruptedKeys.length})`, '')
  P('The English column contains Arabic-script characters. The app looks up by English')
  P('string, so these rows can never match anything on screen: the translation is stranded')
  P('and the English it covered renders untranslated. A find/replace wrote the LSD value')
  P('into the key column.')
  P('')
  P('**Not repaired here.** The original English has to be recovered from the design source.')
  P('')
  P('Two kinds, same consequence:')
  P('')
  P('- `arabic-in-key` — a find/replace wrote the LSD value into the English column.')
  P('- `invisible-mark` — a zero-width bidi control (U+200F and friends) rode along with a')
  P('  copy/paste out of an RTL cell. Invisible in Excel; makes the key unmatchable.')
  P('')
  P('| Page | Kind | Key as stored | Marks | Latin remnant |', '|---|---|---|---|---|')
  for (const r of corruptedKeys) {
    P(`| ${esc(r.page) || '—'} | ${r.kind} | \`${esc(clip(r.key))}\` | ${r.marks || '—'} | ${esc(r.latinRemnant) || '—'} |`)
  }
  P('')

  P(`## 2. Mojibake values (${mojibake.length})`, '')
  P('Doubled consonants — ثث سس طط ضض صص ظظ — are the signature of a legacy non-Unicode')
  P('Dawat font transcoded byte-by-byte: one glyph in the old encoding becomes two identical')
  P('Arabic letters in Unicode. Examples in this corpus: `اْثثنسس`, `تهاسسس`, `نهيطط`, `هضضاوو`.')
  P('')
  P('**These cannot be fixed programmatically.** The mapping is lossy — the original')
  P('keystrokes are not recoverable from the output — so each row must be re-keyed by hand')
  P('in the wordlist. Page numbers are included for exactly that purpose.')
  P('')
  P('| Page | English key | Current LSD value | Pairs |', '|---|---|---|---|')
  for (const r of mojibake) {
    P(`| ${esc(r.page) || '—'} | ${esc(clip(r.key, 70))} | ${esc(clip(r.value, 70))} | ${r.pairs} |`)
  }
  P('')

  P(`## 3. Empty values (${empty.length})`, '')
  P('Row exists, LSD cell blank. Renders English.', '')
  if (empty.length) {
    P('| Page | English key |', '|---|---|')
    for (const r of empty) P(`| ${esc(r.page) || '—'} | ${esc(clip(r.key))} |`)
  } else P('_None._')
  P('')

  P(`## 4. Identity pass-throughs (${identity.length})`, '')
  P('LSD value equals the English key (compared with zero-width direction marks stripped,')
  P('since the build step prefixes U+200F to mixed-script values).')
  P('')
  P('Some are deliberate loanwords — `PDF`, `zone`, `ITS` — and some are untranslated')
  P('placeholders. This script does not try to tell them apart; that is the wordlist')
  P("owner's decision.")
  P('')
  if (identity.length) {
    P('| Page | English key = LSD value |', '|---|---|')
    for (const r of identity) P(`| ${esc(r.page) || '—'} | ${esc(clip(r.key))} |`)
  } else P('_None._')
  P('')

  P('## 5. DOM scanner baseline (A/B/C)', '')
  P('Produced by the CoveragePanel DOM scanner, which walks rendered text nodes while the')
  P('app is in LSD and flags any node containing a Latin word with no Arabic character.')
  P('This finds hardcoded JSX literals that never call `t()` — invisible to the old')
  P('miss-counting panel, which is why it reported only ~60.')
  P('')
  P('| Class | Meaning | Fix owner |', '|---|---|---|')
  P('| **A** | Key exists in the dictionary WITH a real value — translation exists, the string just is not wired | developer |')
  P('| **B** | Key exists but the value is empty or an identity pass-through | wordlist owner |')
  P('| **C** | No dictionary key at all | wordlist owner, then developer |')
  P('')
  P('Baseline is captured by walking the app in LSD and using the panel\'s **Export JSON**')
  P('button, then committing the totals here. See `artifacts/audit/` for the matching')
  P('screenshots.')
  P('')
  // The scanner block is owned by scripts/scan-baseline.mjs. Preserve whatever it last
  // wrote, so regenerating the dictionary audit does not silently discard the runtime
  // baseline (the two writers touch the same file and would otherwise clobber in order).
  let scannerBlock = null
  try {
    const prev = readFileSync(DOC_PATH, 'utf8')
    const m = prev.match(/<!-- SCANNER_BASELINE_START -->[sS]*?<!-- SCANNER_BASELINE_END -->/)
    if (m && !/Not yet captured/.test(m[0])) scannerBlock = m[0]
  } catch { /* first run — no doc yet */ }

  if (scannerBlock) P(scannerBlock)
  else {
  P('<!-- SCANNER_BASELINE_START -->')
  P('_Not yet captured. Run the app in LSD, walk the routes, export from the panel._')
  P('<!-- SCANNER_BASELINE_END -->')
  }
  P('')

  mkdirSync(dirname(DOC_PATH), { recursive: true })
  writeFileSync(DOC_PATH, `${md.join('\n')}\n`)
  console.log(`\nwrote docs/lsd-gaps.md`)
}
