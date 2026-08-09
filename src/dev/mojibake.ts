/**
 * BYTE DAMAGE detection for dictionary entries — refuse the value at ENTRY, never repair it.
 *
 * ═══ THIS FILE IS CLASS A ONLY. CLASS B LIVES IN `src/i18n/kanzNorm.mjs` ═════════════
 *
 * Two entirely different things are wrong with text in this wordlist, and they used to share
 * one name — which forced them to share one verdict:
 *
 *   CLASS A — this file. UTF-8 read as latin-1, replacement characters, lone surrogates.
 *             Bytes are GONE and are not always recoverable. Verdict: BLOCK.
 *   CLASS B — `kanzNorm.mjs`. The seven Kanz al-Lulu keyboard pairs (ظظ ثث سس كك حح ضض طط).
 *             Nothing is lost; it is a faithful record in an encoding the app does not read,
 *             and it converts exactly. Verdict: NORMALISE.
 *
 * While one `detectMojibake` answered both questions, the only verdict available to both was
 * REFUSE — so 254 rows of recoverable keyboard output were filed as damage, and
 * `docs/lsd-gaps.md` counted them as unfixable alongside the real thing. The cost was not the
 * refusal. It was that nobody could see there were two problems.
 *
 * Two modules, two names, two verdicts. NOT one function with a mode flag — a flag puts the
 * two back in one place and the next caller passes the wrong one.
 *
 * Repairing class A is not on the table. A mis-decoded string has already lost information in
 * ways that are not always recoverable, and a guess that looks plausible is worse than a
 * rejection: it lands in the wordlist as if it were authored, and nobody looks at it again. So
 * this only ever answers "is this damaged, and how" — the value is refused and the page number
 * reported, and the person who owns the wordlist fixes it at source.
 *
 * Three signatures, in the order they actually occur here:
 *
 * 1. REPLACEMENT CHARACTERS. U+FFFD is what a decoder emits when it gives up. Its presence is
 *    proof of loss, not a hint.
 *
 * 2. UTF-8 READ AS LATIN-1 — the classic Excel-and-CSV failure. Arabic sits in U+0600–06FF,
 *    whose UTF-8 bytes are two-byte sequences beginning 0xD8–0xDB. Read as latin-1 those lead
 *    bytes surface as Ø Ù Ú Û followed by a C1 control or punctuation character. `Ø§Ù„` for
 *    `ال` is the shape you see in a broken export. Latin text mangled the same way produces the
 *    Ã‚/Ã‰ family instead.
 *
 * 3. LONE SURROGATES. A UTF-16 half with no partner, usually from a byte-level slice through a
 *    string. `isWellFormed()` is the precise test where it exists; the regex is the fallback.
 *
 * NOT flagged, deliberately: ornate brackets ﴿﴾ (U+FD3E/F), the bidi marks the wordlist uses on
 * purpose (RLM/LRM and the isolates), Arabic presentation forms, and Latin loanwords inside an
 * LSD string. All four are legitimate content here and every one of them would trip a naive
 * "is this ASCII" check.
 */

/** One reason a value was refused. `sample` is the offending fragment, for the message. */
export interface ByteDamageFinding {
  kind: 'replacement-char' | 'utf8-as-latin1' | 'lone-surrogate'
  sample: string
  detail: string
}

/**
 * The trailing half of a mis-decoded UTF-8 pair, as it SURFACES.
 *
 * A UTF-8 continuation byte is 0x80-0xBF, which is the C1 control block — and no editor shows
 * control characters. Windows-1252, which is what "latin-1" almost always means in practice,
 * maps that range onto printable punctuation instead: € ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ' ' " " • – —
 * ˜ ™ š › œ ž Ÿ. So `ال` mis-decoded reads `Ø§Ù„`, and `É` reads `Ã‰` — the second character
 * is U+2030, nowhere near U+0080. Matching only the raw C1 range therefore misses most real
 * cases, which is exactly what the first version of this file did.
 */
const TRAIL = '[\u0080-\u00BF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]'

/**
 * Lead bytes 0xC2-0xDF seen through that decoder: Â Ã Ø Ù Ú Û and their neighbours. U+00C3 (Ã)
 * sits inside the range, so the Latin and the Arabic manglings are one pattern, not two.
 */
const UTF8_AS_LATIN1 = new RegExp(`[\u00C2-\u00DF]${TRAIL}`)

export function detectByteDamage(value: string): ByteDamageFinding[] {
  const out: ByteDamageFinding[] = []
  const s = String(value ?? '')

  const fffd = s.indexOf('�')
  if (fffd !== -1) {
    out.push({
      kind: 'replacement-char',
      sample: s.slice(Math.max(0, fffd - 6), fffd + 7),
      detail: 'Contains U+FFFD. Something already failed to decode this text; the original bytes are gone.',
    })
  }

  /**
   * DO NOT "SIMPLIFY" THIS TO A RAW C1 CHECK.
   *
   * `[Â-ß][-¿]` is the textbook UTF-8-as-latin-1 pattern and it looks
   * more correct than it is. It describes the BYTES; it does not describe what anyone ever
   * sees. Nothing renders C1 control characters, so every real-world pipeline that produces
   * this damage — Excel, CSV round-trips, a copy-paste through a Windows editor — decodes
   * 0x80-0x9F as windows-1252 instead, which maps that half of the range onto printable
   * punctuation. `É` comes out as `Ã‰`, whose second character is U+2030, not U+0080.
   *
   * So the raw-C1 form catches `Ø§Ù„` (Arabic, whose continuation bytes land in 0xA0-0xBF and
   * survive unmapped) and silently misses the entire Latin family. That is exactly the bug
   * this file shipped with for one commit; `scripts/check-dictionary.mjs` caught it at 2 of 3
   * and the third case is `Ã‰tage`. `TRAIL` above is the union of both halves for that reason.
   *
   * Five people type into this editor. A false negative here does not look like a bug — it
   * looks like a translation that was accepted, and it reaches the wordlist.
   */
  const m8 = UTF8_AS_LATIN1.exec(s)
  if (m8) {
    out.push({
      kind: 'utf8-as-latin1',
      sample: s.slice(Math.max(0, m8.index - 4), m8.index + 8),
      detail: 'Looks like UTF-8 bytes read as latin-1 or windows-1252 (the Ø/Ù/Ã pattern). Re-export the source as UTF-8 rather than retyping it.',
    })
  }

  // `isWellFormed` is ES2024 and present in the browsers this runs in; the regex covers the
  // rest and is what the node-side check uses.
  const wellFormed = (s as unknown as { isWellFormed?: () => boolean }).isWellFormed
  const broken = typeof wellFormed === 'function'
    ? !wellFormed.call(s)
    : /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s)
  if (broken) {
    out.push({
      kind: 'lone-surrogate',
      sample: s.slice(0, 12),
      detail: 'Contains an unpaired UTF-16 surrogate — the string has been cut through a character.',
    })
  }

  return out
}

/** Normalisation check, kept separate: NFC is a fixable authoring detail, not damage. */
export function isNfc(value: string): boolean {
  const s = String(value ?? '')
  return s.normalize('NFC') === s
}
