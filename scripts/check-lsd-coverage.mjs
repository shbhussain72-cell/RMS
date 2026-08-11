/**
 * LSD translation gate.
 *
 * Fails the build when a user-visible English string cannot render in LSD. Three ways
 * that happens, reported separately because the fix differs for each:
 *
 *   UNROUTED  the string is hardcoded in JSX and never passes through the i18n layer,
 *             so it renders English no matter what the wordlist says. Fix: wrap it in
 *             `tx()` / `t()` / `td()`.
 *   NO_ROW    the string is routed, but the wordlist has no row for it. Fix: add the
 *             row to RMS_Mumineen_LSD_wordlist_v4.xlsx.
 *   BLANK     a row exists but its LSD cell is empty. Fix: type the translation.
 *   LATIN     a row exists and is filled, but the LSD value is still Latin script, so
 *             LSD mode shows English anyway. Fix: replace with the LSD text.
 *
 * Usage:
 *   node scripts/check-lsd-coverage.mjs            # exit 1 if anything is outstanding
 *   node scripts/check-lsd-coverage.mjs --report   # always exit 0, write the markdown
 *   node scripts/check-lsd-coverage.mjs --baseline # rewrite the allowlist from current state
 *
 * The BASELINE exists because this gate was introduced against a codebase that was only
 * partly converted — failing on all of it from day one would just get the gate deleted.
 * Everything currently outstanding is recorded in lsd-baseline.json; the gate fails on
 * anything NEW, and the baseline file is expected to shrink to empty. It can never grow
 * without someone deliberately running --baseline.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DICT = path.join(ROOT, 'src/i18n/lsd.json')
const BASELINE = path.join(ROOT, 'scripts/lsd-baseline.json')

const args = new Set(process.argv.slice(2))
const REPORT_ONLY = args.has('--report')
const WRITE_BASELINE = args.has('--baseline')

// ─── dictionary ───────────────────────────────────────────────────────────────
const decode = (s) => String(s)
  .replace(/&nbsp;/g, ' ').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const normKey = (s) => decode(s).replace(/\s+/g, ' ').trim()

const dict = JSON.parse(fs.readFileSync(DICT, 'utf8'))
const entries = new Map(
  Object.entries(dict).filter(([k]) => k !== '//').map(([k, v]) => [normKey(k), v]),
)

/**
 * Does this LSD value actually contain Arabic-script text?
 *
 * Written with \u escapes on purpose: the literal ranges spell out invisible characters
 * (U+FEFF ends the presentation-forms block) that vanish in editors and diffs.
 * Arabic + Supplement + Extended-A + Presentation Forms A/B.
 */
const hasArabic = (s) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s)
/**
 * Rows whose LSD value is DELIBERATELY Latin and must never be reported as untranslated.
 *
 * The wordlist brief states these are intentional and must not be transliterated:
 * `ITS ID`, `Login`, `PDF`, `zone`. The same applies to format masks and units, which are
 * not language at all (`mm/dd/yyyy`, `248 KB`). Flagging them trains people to ignore the
 * gate, which is worse than the gap it would be reporting.
 *
 * Matched on the LSD VALUE, and only when the whole value is the intentional token —
 * a real sentence that merely contains "PDF" still has to be translated.
 */
const INTENTIONAL_LATIN = new Set(
  ['its', 'its id', 'login', 'pdf', 'zone', 'mm/dd/yyyy', 'sms', 'otp', 'ok'],
)
const isUnitOrMask = (s) => /^[\d\s.,]+\s*(kb|mb|gb|px|%)$/i.test(s) || /^[\d\s./:-]+$/.test(s)

/** Latin letters that are NOT an intentional loanword, unit, or format mask. */
const isLatinOnly = (s) => {
  if (!/[A-Za-z]/.test(s) || hasArabic(s)) return false
  const v = s.trim().toLowerCase()
  return !INTENTIONAL_LATIN.has(v) && !isUnitOrMask(s.trim())
}

// ─── source scan ──────────────────────────────────────────────────────────────
// Deliberately conservative: this is a build gate, so a false positive is far more
// expensive than a missed string. Anything that does not look like prose is skipped.
const NOISE = [
  /^[MmLlHhVvCcSsQqTtAaZz][\s\d.,-]/,          // svg path data
  /^[\d\s.,%#:/-]+$/,                          // pure numbers / punctuation
  /serif|sans-serif|system-ui|Segoe UI|Amiri|Marcellus|Mulish|Kanz/i,
  /^(https?:)?\//, /^#[0-9a-fA-F]{3,8}$/,
  /rgba?\(|linear-gradient|url\(|data:|calc\(|var\(/i,
  /^[a-z-]+:\s/,                               // css declarations
  /(^|\s)(flex|grid|absolute|relative|rounded|border|bg-|text-\[|size-\[|mt-\[|px-\[|py-\[|w-\[|h-\[)/,
  /^\p{Lu}?[a-z]+([A-Z][a-z]+)+$/u,            // camelCase identifiers
  /^\d{1,2}:\d{2}/,
  /^[A-Z]{1,3}$/,                              // initialisms handled as data
]
const FRAGMENT = /\s(a|an|the|in|on|to|of|and|or|for|with|is|are|at|by|your|their)$/i
const looksLikeCopy = (s) =>
  s.length >= 3 && s.length <= 160 &&
  /[A-Za-z]{2}/.test(s) && /^[A-Z]/.test(s) &&
  (s.match(/[A-Za-z]/g) || []).length / s.length > 0.5 &&
  !NOISE.some((re) => re.test(s)) && !FRAGMENT.test(s)

/** Directory names under src/ that hold tooling rather than product copy. */
const DEV_ONLY_DIRS = new Set(['i18n', 'remarks', 'dev', 'shared'])

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    // `i18n`, `remarks`, `dev` and `shared` are DEV-ONLY INTERNAL TOOLING, not app copy.
    //
    // `shared` joined the list after its chrome reached the SHIPPED BUNDLE. Its strings go
    // through t()/tx(), so this scanner asked for wordlist rows; rows are what `lsd.json` is
    // generated from; and `lsd.json` is imported by the app. The result was the English string
    // "What should your remarks be signed with?" sitting in every user's bundle, and
    // `check-dev-only.mjs` failing the build on the bare word `remark` — correctly. The guard
    // was not wrong; asking for the rows was.
    //
    // Every file in src/shared/ is review tooling: transport, outbox, poll, identity,
    // IdentityPrompt, remarksApi, dictionaryApi, syncApi. If app code is ever put there, this
    // line is the thing that has to change, not the guard that caught it.
    //
    // Both are gated behind `import.meta.env.DEV` and never reach a user, so their English
    // chrome ("Export Markdown", "Enter remark mode") is not a translation gap — it is the
    // language the tool is written in. Counting it would inflate the outstanding-strings
    // number that `docs/lsd-gaps.md` and the wordlist owner's worklist are built from, and
    // send someone off translating a debug panel.
    //
    // This is the static twin of `SCANNER_IGNORE_ATTR`, which keeps the same chrome out of
    // the runtime DOM scan for the same reason.
    //
    // ── THIS EXCLUSION HAS BEEN ASKED FOR AND REFUSED. DO NOT GRANT IT. ──────────────
    //
    // On 11 Aug 2026 the sticky-note and hide-control work added six new strings under
    // `remarks/` and `dev/` — "Sticky note", "No open remarks on this screen", "Turn on a
    // language to see remarks", "Hide", "Show", and the note button's title. The brief said,
    // as briefs here normally should, that every new user-visible string goes through t()/tx()
    // and into `docs/wordlist-patch.xlsx` with an empty LSD cell.
    //
    // Doing that would have shipped all six. The chain is the one written above and it has no
    // weak link: a row in the patch becomes a row in the wordlist, the wordlist generates
    // `lsd.json`, and `lsd.json` is imported by the app — so a dev-tool string routed for
    // translation reaches every user's bundle. `src/shared` is the proof; it is on this list
    // for exactly that reason.
    //
    // It would also have contradicted itself inside one commit. Three of those six strings
    // were added to `check-dev-only.mjs`'s REVIEW_ONLY list in the same change, which asserts
    // they are ABSENT from a production `dist/`. Routing them puts them in `lsd.json` and
    // `lsd.json` is in every bundle, so the build would have failed on the strings the same
    // commit had just promised to keep out.
    //
    // The instruction was withdrawn once the chain was stated, and the exclusion list was
    // deliberately left alone. The six went through `t()` with an English fallback and no
    // wordlist rows, which is what every other string in that panel already does — "Export
    // Markdown", "Refresh" and "Enter remark mode" are all `t()` calls and none of them has a
    // row.
    //
    // So: a request to route a string under one of these four directories is not an oversight
    // to be helpfully fixed. Translating dev chrome means shipping dev chrome. If the tooling's
    // own copy ever genuinely has to be translated, the thing to change is that `lsd.json`
    // reaches the client bundle at all — not this line.
    if (e.isDirectory()) { if (!DEV_ONLY_DIRS.has(e.name)) walk(p, out) }
    // .ts as well as .tsx: the tour/guide content lives in src/tour/steps.ts and the
    // notification copy in src/data/notifications.ts — both are user-visible strings that
    // a .tsx-only walk silently skipped, which is why the guide was never reported.
    // Test files are excluded: they quote English strings as FIXTURES ("Colombo",
    // "Registration") to assert on, and those are assertions about the app, not copy in it.
    else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/** text -> { text, file, line, routed } */
const found = new Map()
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  /** Nearest non-blank, non-comment line in `dir`, for the standalone-text check below. */
  const neighbour = (i, dir) => {
    for (let j = i + dir; j >= 0 && j < lines.length; j += dir) {
      const s = lines[j].trim()
      if (s && !/^(\/\/|\*|\/\*)/.test(s)) return s
    }
    return ''
  }
  lines.forEach((raw, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(raw)) return
    // `indirect` = the string was seen only as a value handed to something else
    // (`{ label: 'Flight' }` in an options array), never as rendered text. Whether it
    // reaches the user in English depends on the component that finally renders it — if
    // that leaf calls tx(), it translates fine. Tracked separately so it is not reported
    // with the same confidence as a literal sitting directly in JSX.
    const push = (text, routed, indirect = false) => {
      const s = normKey(text)
      if (!s || !looksLikeCopy(s)) return
      const prev = found.get(s)
      if (!prev) found.set(s, { text: s, file: rel, line: i + 1, routed, indirect })
      else {
        if (routed) prev.routed = true
        if (!indirect) prev.indirect = false
      }
    }
    // routed: passed through the i18n layer.
    // The literal may contain ESCAPED apostrophes — tx('We\'re moving participants…') — so
    // the body is "any non-quote, or any backslash-escaped char", not "any non-quote".
    // A naive [^']* stops at the backslash and reports a truncated key ("We\") that can
    // never match the wordlist.
    for (const m of raw.matchAll(/\b(?:tx|t|td|tdText|tdAuthored)\(\s*'((?:[^'\\]|\\.){3,}?)'/g)) {
      push(m[1].replace(/\\(['"\\])/g, '$1'), true)
    }
    // unrouted, same-line: <p>Some copy</p>
    // The `>` must not be an ARROW. `fingerprint: () => Promise<string>` matches this pattern
    // exactly — a `>`, a word, a `<` — and was reported as untranslated JSX copy in a file
    // containing no JSX at all. A real text node is always preceded by a tag's `>`, never by
    // `=`, so excluding that one character is precise rather than a loosening of the gate.
    for (const m of raw.matchAll(/(?<!=)>([^<>{}\n]{3,})</g)) push(m[1], false)
    // unrouted, OWN-LINE: prettier splits a long element so the text node sits alone —
    //     <span …>
    //       New Miqaat
    //     </span>
    // The same-line pattern above cannot see this (it forbids newlines), which silently
    // hid real untranslated copy. Detected structurally instead: a line that is plain
    // text, sandwiched between a line ending in `>` and a line opening a tag.
    const solo = raw.trim()
    if (solo && !/[<>{}=]/.test(solo) && neighbour(i, -1).endsWith('>') && neighbour(i, 1).startsWith('<')) {
      push(solo, false)
    }
    for (const m of raw.matchAll(
      /(?:label|title|placeholder|aria-label|desc|subtitle|sub|text|message|heading|cta|status|body|hint|caption|empty|error)\s*[:=]\s*'([^']{3,})'/g,
    )) push(m[1], false, true)
  })
}

// ─── classify ─────────────────────────────────────────────────────────────────
const problems = []
for (const r of [...found.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  const entry = entries.get(r.text)
  let kind = null
  if (!r.routed) kind = r.indirect ? 'INDIRECT' : 'UNROUTED'
  else if (!entry) kind = 'NO_ROW'
  else if (!entry.lsd) kind = 'BLANK'
  else if (entry.lsd.trim().toLowerCase() === 'remove') kind = null   // deliberately dropped
  else if (isLatinOnly(entry.lsd)) kind = 'LATIN'
  if (kind) problems.push({ ...r, kind })
}
// Wordlist rows that are unusable regardless of whether they are on screen yet.
for (const [k, v] of entries) {
  if (found.has(k)) continue
  // A SENTINEL row is not an untranslated row. The wordlist owner wrote an instruction in
  // the LSD cell; until it is resolved the string shows English, which is a decision someone
  // made rather than a gap nobody noticed. Reported separately so the two never merge.
  if (v.sentinel) problems.push({ text: k, file: '(wordlist)', line: 0, kind: 'SENTINEL' })
  else if (!v.lsd) problems.push({ text: k, file: '(wordlist)', line: 0, kind: 'BLANK' })
  else if (v.lsd.trim().toLowerCase() !== 'remove' && isLatinOnly(v.lsd)) {
    problems.push({ text: k, file: '(wordlist)', line: 0, kind: 'LATIN' })
  }
}

const id = (p) => `${p.kind}\u0000${p.text}`

if (WRITE_BASELINE) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(problems.map(id).sort(), null, 0)}\n`)
  console.log(`baseline written: ${problems.length} known-outstanding strings`)
  process.exit(0)
}

// --all ignores the baseline and reports EVERY outstanding string. Use it to plan work;
// the normal (baselined) mode is what CI runs.
const baseline = args.has('--all')
  ? new Set()
  : new Set(fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : [])
const regressions = problems.filter((p) => !baseline.has(id(p)))
const fixed = [...baseline].filter((b) => !problems.some((p) => id(p) === b))

// ─── report ───────────────────────────────────────────────────────────────────
const byKind = (list) => list.reduce((m, p) => (m[p.kind] = (m[p.kind] ?? 0) + 1, m), {})
const counts = byKind(problems)
console.log('LSD translation gate')
console.log(`  wordlist entries : ${entries.size}`)
console.log(`  strings scanned  : ${found.size}`)
console.log(`  outstanding      : ${problems.length}  ${JSON.stringify(counts)}`)
console.log(`  baselined        : ${baseline.size}`)
if (fixed.length) console.log(`  fixed since baseline: ${fixed.length}  (run --baseline to lock in)`)

if (regressions.length) {
  console.error(`\n✗ ${regressions.length} NEW untranslated user-visible string(s):\n`)
  for (const p of (args.has("--all") ? regressions : regressions.slice(0, 40))) {
    console.error(`  [${p.kind}] ${p.file}${p.line ? `:${p.line}` : ''}  "${p.text}"`)
  }
  if (regressions.length > 40) console.error(`  …and ${regressions.length - 40} more`)
  console.error('\nUNROUTED → wrap in tx()/t()/td().  NO_ROW → add to the xlsx.')
  console.error('BLANK/LATIN → fill the LSD cell in the xlsx.')
  console.error('SENTINEL → the LSD cell holds an instruction; decide what it should say.')
  if (!REPORT_ONLY) process.exit(1)
}

if (!regressions.length) console.log('\n✓ no new untranslated strings')
