/**
 * kanzNorm.mjs — Kanz al-Lulu keyboard output → Unicode Lisan ud-Dawat.
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────────────
 *
 * The Kanz al-Lulu keyboard emits each Urdu-specific letter as a DOUBLED Arabic letter.
 * Seven pairs, confirmed against the corpus in `docs/kanz-digraphs.md` by substituting and
 * requiring the result to attest elsewhere in the same sheet:
 *
 *     ظظ → ہ      ثث → پ      سس → ے      كك → گ
 *     حح → چ      ضض → ٹ      طط → ں
 *
 * This is NOT damage in the sense `src/dev/mojibake.ts` means. Nothing was mis-decoded and
 * no information was lost: the text is a faithful record of which keys were pressed, in an
 * encoding the app does not read. It is recoverable exactly, which is why it normalises here
 * instead of being refused there.
 *
 * ── WHY THIS IS NOT THE SAME FUNCTION AS MOJIBAKE DETECTION ──────────────────────────
 *
 * It was, and that is what this file exists to undo. One `detectMojibake` answered two
 * questions with one verdict — "is this damaged" and "is this Kanz input" — so the only
 * available answer to both was REFUSE. Class A (UTF-8 read as latin-1, lone surrogates) has
 * lost bytes and must be refused; class B has lost nothing and must be converted. Sharing a
 * name forced the wrong answer onto whichever class was not being thought about.
 *
 * Two modules, two verdicts, no mode flag. A flag would put the two back in one place and
 * the next person would pass the wrong one.
 *
 * ── THE ODD-RUN RULE ─────────────────────────────────────────────────────────────────
 *
 * A run of three identical letters is ambiguous: `سسس` is either `س`+`سس` (→ `سے`) or
 * `سس`+`س` (→ `ےس`). Naive left-to-right replacement takes the first two and produces `ےس`.
 *
 * Maximal runs are therefore paired from the RIGHT, leaving any odd leftover at the start.
 * `سسس` → `سے`, `سسسس` → `ےے`. Every instance in the corpus resolves this way — `جاسسس`
 * `تھاسسس` `كرسسس` `كهلسسس` are all `-سے` — and the reason is structural rather than lucky:
 * `ے` is barree ye, which occurs word-finally.
 *
 * The rule is still a rule, not a proof. That is why `normaliseKanz` reports WHAT it changed
 * rather than only returning the new string, and why the editor is required to show it: a
 * conversion the author can see is a conversion the author can reject.
 *
 * ── WHY NOT ATTESTATION-GATED, LIKE THE CORPUS REPAIR WAS ────────────────────────────
 *
 * The one-off repair of the existing 254 rows applied a substitution only where the result
 * was attested elsewhere in the sheet, because there was nobody present to ask. At an input
 * path there is: the author is standing there and is told what changed. Unconditional
 * conversion plus a visible report is the right trade at entry; silent conversion of a
 * corpus is not. Different situations, deliberately different rules.
 *
 * Plain .mjs with a hand-written .d.mts beside it, for the same reason as `wordlistNorm.mjs`:
 * `scripts/build-lsd-dict.mjs` is run by node directly, the editor is bundled for a browser,
 * and the sync is TypeScript. No imports, no node built-ins.
 */

/**
 * The confirmed mapping. Order is not significant — no doubled sequence here is a prefix of
 * another — but it is kept in the order `docs/kanz-digraphs.md` presents it so the two can be
 * read against each other.
 */
export const KANZ_PAIRS = Object.freeze([
  Object.freeze({ doubled: 'ظظ', single: 'ہ' }),
  Object.freeze({ doubled: 'ثث', single: 'پ' }),
  Object.freeze({ doubled: 'سس', single: 'ے' }),
  Object.freeze({ doubled: 'كك', single: 'گ' }),
  Object.freeze({ doubled: 'حح', single: 'چ' }),
  Object.freeze({ doubled: 'ضض', single: 'ٹ' }),
  Object.freeze({ doubled: 'طط', single: 'ں' }),
])

/** doubled letter → the single letter it stands for. Keyed on the REPEATED character. */
const BY_CHAR = new Map(KANZ_PAIRS.map((p) => [p.doubled[0], p.single]))

/**
 * `صص` is in the OLD detector's doubled-consonant list and is NOT in the confirmed mapping.
 * It does not occur in the corpus. It is named here rather than omitted so that a future
 * reader does not "complete the set" by inventing a target for it — that would be authoring
 * Lisan ud-Dawat, which is the wordlist owner's to do and nobody else's.
 */
export const UNMAPPED_DOUBLES = Object.freeze(['صص'])

/** Does this string carry any Kanz doubled pair? Cheap; used to skip untouched values. */
export function hasKanzDoubles(value) {
  const s = String(value ?? '')
  for (const { doubled } of KANZ_PAIRS) if (s.includes(doubled)) return true
  return false
}

/** A doubled sequence with no confirmed target — reported, never guessed at. */
export function unmappedDoubles(value) {
  const s = String(value ?? '')
  return UNMAPPED_DOUBLES.filter((d) => s.includes(d))
}

/**
 * Convert Kanz keyboard output to Unicode.
 *
 * @returns {{ value: string, changed: boolean, changes: Array<{ doubled: string, single: string, count: number }> }}
 *          `changes` is per PAIR, with a count — enough for the editor to say what it did
 *          without re-deriving it, and enough for a test to assert the rendered character.
 */
export function normaliseKanz(value) {
  const s = String(value ?? '')
  const counts = new Map()
  let out = ''
  let i = 0

  while (i < s.length) {
    const ch = s[i]
    const single = BY_CHAR.get(ch)
    if (!single) { out += ch; i++; continue }

    // Maximal run of this character, paired from the RIGHT — see the odd-run rule above.
    let end = i
    while (end < s.length && s[end] === ch) end++
    const run = end - i
    const pairs = Math.floor(run / 2)
    if (pairs > 0) {
      if (run % 2 === 1) out += ch          // the odd one out goes first
      out += single.repeat(pairs)
      counts.set(ch, (counts.get(ch) ?? 0) + pairs)
    } else {
      out += ch                              // a lone letter is just a letter
    }
    i = end
  }

  const changes = KANZ_PAIRS
    .filter((p) => counts.has(p.doubled[0]))
    .map((p) => ({ doubled: p.doubled, single: p.single, count: counts.get(p.doubled[0]) }))

  return { value: out, changed: changes.length > 0, changes }
}

/** The converted string alone, for callers that do not need the report. */
export const kanzNormalised = (value) => normaliseKanz(value).value

/**
 * A one-line summary of a conversion, for the editor and the sync log.
 * Empty string when nothing changed, so a caller can render it unconditionally.
 */
export function describeKanzChanges(changes) {
  if (!changes || changes.length === 0) return ''
  return changes.map((c) => `${c.doubled}→${c.single}${c.count > 1 ? ` ×${c.count}` : ''}`).join(', ')
}
