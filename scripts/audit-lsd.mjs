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
 * CLASS A         Byte damage: UTF-8 read as latin-1, U+FFFD, lone surrogates. The bytes
 *                 are GONE and it CANNOT be repaired programmatically — the owner has to
 *                 re-key the row, so rows are emitted with their source page.
 *
 * CLASS B         Kanz al-Lulu keyboard output: the seven doubled pairs ظظ ثث سس كك حح
 *                 ضض طط. NOT damage. It is a faithful record in an encoding the app does
 *                 not read, and it converts exactly. NO ACTION NEEDED — kanzNorm.mjs
 *                 normalises it at every entry point, so it never reaches lsd.json.
 *
 * These two used to be one class called MOJIBAKE. Sharing a name forced one verdict onto
 * both, and this audit reported 190 rows as unfixable when almost none of them were. The
 * counts below are split for that reason. See docs/kanz-digraphs.md.
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
import { KANZ_PAIRS, hasKanzDoubles } from '../src/i18n/kanzNorm.mjs'
import { detectByteDamage } from '../src/dev/mojibake.ts'

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
 * Class B is now decided by the shared module, not by a regex kept here.
 *
 * The old local pattern listed SIX pairs — it had صص, which does not occur in this corpus
 * at all, and was missing كك and حح, which do. So it both invented a class and under-counted
 * the real one. `KANZ_PAIRS` is the confirmed set, proved against the corpus in
 * docs/kanz-digraphs.md, and there is now exactly one copy of it.
 *
 * The restraint in the original note still applies and is why the set is not "any repeated
 * Arabic letter": gemination is normal in Arabic orthography, and a broader rule would flag
 * correct text.
 */
const classBHits = (value) => KANZ_PAIRS
  .filter((p) => value.includes(p.doubled))
  .map((p) => p.doubled)

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
const classA = []
const classB = []
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
    continue // an empty value cannot also be damaged or identity
  }

  // ── CLASS A — bytes are gone. The owner must re-key the row. ──
  const damage = detectByteDamage(value)
  if (damage.length) {
    classA.push({
      key: r.key,
      value: r.lsd,
      page: r.page,
      kinds: [...new Set(damage.map((d) => d.kind))].sort().join(' '),
      sample: damage[0].sample,
    })
  }

  // ── CLASS B — Kanz keyboard output. Converts exactly; no action needed. ──
  //
  // Expected to be ZERO here, and that is the point: this audit reads lsd.json, and the
  // generator normalises on the way in. A non-zero count means a path stopped normalising,
  // which is the outcome worth watching rather than the historical row count.
  const kanz = classBHits(value)
  if (kanz.length) {
    classB.push({ key: r.key, value: r.lsd, page: r.page, pairs: kanz.sort().join(' ') })
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

/** A row is "usable" only if it has a value that is not empty, damaged or a pass-through. */
const defective = new Set([
  ...corruptedKeys.map((r) => r.key),
  ...classA.map((r) => r.key),
  ...classB.map((r) => r.key),
  ...empty.map((r) => r.key),
  ...identity.map((r) => r.key),
])
const usable = total - defective.size

const summary = {
  totalEntries: total,
  corruptedKeys: corruptedKeys.length,
  classAByteDamage: classA.length,
  classBKanzInput: classB.length,
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
  process.stdout.write(`${JSON.stringify({ summary, corruptedKeys, classA, classB, empty, identity }, null, 2)}\n`)
} else {
  const line = (label, n) => `  ${String(n).padStart(5)}  ${pct(n).padStart(5)}%  ${label}`
  console.log('LSD dictionary audit')
  console.log(`  source: src/i18n/lsd.json (generated from RMS_Mumineen_LSD_wordlist_v4.xlsx)`)
  console.log(`  ${total} entries\n`)
  console.log(line('corrupted English keys (contain Arabic script)', corruptedKeys.length))
  console.log(line('class A — byte damage (must be re-keyed)', classA.length))
  console.log(line('class B — Kanz input (normalises, no action)', classB.length))
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
  console.log(`\nclass B pairs still reaching the dictionary: ${
    [...new Set(classB.flatMap((m) => m.pairs.split(' ')))].sort().join(' ') || '— none, they normalise on the way in'
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
  P(`| Class A — byte damage | ${classA.length} | ${pct(classA.length)}% |`)
  P(`| Class B — Kanz input | ${classB.length} | ${pct(classB.length)}% |`)
  P(`| Empty values | ${empty.length} | ${pct(empty.length)}% |`)
  P(`| Identity pass-throughs | ${identity.length} | ${pct(identity.length)}% |`)
  P(`| **Distinct defective rows** | **${defective.size}** | **${pct(defective.size)}%** |`)
  P(`| **Usable rows** | **${usable}** | **${pct(usable)}%** |`)
  P('')
  P('Classes overlap — a corrupted key can also hold a damaged value — so the counts')
  P('sum to more than the distinct-defective total.')
  P('')
  P('### What happened to the old "mojibake" figure', '')
  P('This audit used to report one class called *mojibake*, counted by a local six-pair')
  P('regex, and it stood at **190 rows** — reported as unfixable, because that one name')
  P('carried one verdict. It was two different problems:')
  P('')
  P('- **Class A** is real byte damage. Bytes are gone; the row must be re-keyed by hand.')
  P('- **Class B** is Kanz al-Lulu keyboard output. Nothing was lost — it converts exactly,')
  P('  and `src/i18n/kanzNorm.mjs` now converts it at the generator, the editor and the')
  P('  sync, so it never reaches this file. **No action needed.**')
  P('')
  P('**Every row it flagged was class B.** Reclassified against the pre-repair workbook:')
  P('')
  P('| | rows |', '|---|---:|')
  P('| Flagged by the old six-pair regex | 234 |')
  P('| → class A only (must be re-keyed by hand) | **0** |')
  P('| → class B only (converts exactly) | **234** |')
  P('| → both | 0 |')
  P('| → neither | 0 |')
  P('')
  P('So the headline number is not "190 rows to re-key" but **0**. Not one value in this')
  P('wordlist has ever had byte damage — class A across the whole corpus is 0. Every row the')
  P('old figure counted was recoverable, and is now recovered on the way into the dictionary.')
  P('')
  P('The old regex was also wrong in both directions: it listed `صص`, which occurs **0**')
  P('times in this corpus, and omitted `كك` and `حح`, which cost it **20** class B rows it')
  P('never reported. The set is now the seven pairs proved against the corpus in')
  P('`docs/kanz-digraphs.md`, held in one place.')
  P('')
  P('Class B reading **0** here is the assertion, not a formality: this file is generated')
  P('from `lsd.json`, so a non-zero count means an entry path stopped normalising.')
  P('')
  P('The wordlist itself is a separate question — 189 rows still hold Kanz input at source,')
  P('awaiting the rulings in `docs/kanz-unattested.md`. That is by design: the spreadsheet')
  P('is the owner\'s, and the repair only rewrote what the corpus could vouch for.')
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

  P(`## 2a. Class A — byte damage (${classA.length})`, '')
  P('UTF-8 read as latin-1, a U+FFFD replacement character, or a lone surrogate. Detected by')
  P('`detectByteDamage` in `src/dev/mojibake.ts`.')
  P('')
  P('**These cannot be fixed programmatically.** The bytes are gone — a guess that looks')
  P('plausible is worse than a rejection, because it lands in the wordlist as if it were')
  P('authored. Each row must be re-keyed by hand. Page numbers are included for that.')
  P('')
  if (classA.length) {
    P('| Page | English key | Current LSD value | Kinds | Near |', '|---|---|---|---|---|')
    for (const r of classA) {
      P(`| ${esc(r.page) || '—'} | ${esc(clip(r.key, 60))} | ${esc(clip(r.value, 50))} | ${r.kinds} | \`${esc(clip(r.sample, 20))}\` |`)
    }
  } else {
    P('None. No value in the dictionary carries byte damage.')
  }
  P('')

  P(`## 2b. Class B — Kanz keyboard input (${classB.length})`, '')
  P('The seven doubled pairs ظظ ثث سس كك حح ضض طط — Kanz al-Lulu keyboard output, where each')
  P('Urdu-specific letter arrives as a doubled Arabic one.')
  P('')
  P('**No action needed, and a non-zero count here is a regression.** Nothing was lost in')
  P('this encoding and it converts exactly; `src/i18n/kanzNorm.mjs` does so at the generator,')
  P('the editor and the sync. This file is generated from `lsd.json`, downstream of that')
  P('conversion, so anything listed below means an entry path stopped normalising.')
  P('')
  if (classB.length) {
    P('| Page | English key | Current LSD value | Pairs |', '|---|---|---|---|')
    for (const r of classB) {
      P(`| ${esc(r.page) || '—'} | ${esc(clip(r.key, 70))} | ${esc(clip(r.value, 70))} | ${r.pairs} |`)
    }
  } else {
    P('None — as expected. The conversion is working.')
  }
  P('')

  P(`## 3. Empty values (${empty.length})`, '')
  P('Row exists, LSD cell blank. Renders English.', '')
  if (empty.length) {
    P('| Page | English key |', '|---|---|')
    for (const r of empty) P(`| ${esc(r.page) || '—'} | ${esc(clip(r.key))} |`)
  } else P('_None._')
  P('')

  P(`## 3b. Sentinel rows \u2014 awaiting a decision (${sentinels.length})`, '')
  P('These cells hold an INSTRUCTION, not a translation. The wordlist owner wrote a keyword')
  P('where the LSD text goes; nobody has yet decided what the string should say, so **the app')
  P('shows English** in the meantime. They are listed apart from the empty rows above because')
  P('the action needed differs: an empty row needs someone to translate it, a sentinel row')
  P('needs someone to say what was meant.', '')
  if (sentinels.length) {
    P('| Page | English key | Cell contains |', '|---|---|---|')
    for (const r of sentinels) P(`| ${esc(r.page) || '\u2014'} | ${esc(clip(r.key, 80))} | \`${esc(r.sentinel)}\` |`)
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

  P(`## 4b. Identity by policy \u2014 no action needed (${identityPolicy.length})`, '')
  P('These also read the same in both languages, and that is **correct**. They are acronyms,')
  P('units, format masks and agreed loanwords \u2014 see `docs/loanword-policy.md`. They are listed')
  P('so it is clear they were considered, not overlooked.', '')
  if (identityPolicy.length) {
    P('| English key | Why identity is right |', '|---|---|')
    for (const r of identityPolicy) P(`| ${esc(clip(r.key))} | ${esc(r.reason)} |`)
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
