/**
 * Mojibake detection for dictionary entries — refuse the value at ENTRY, never repair it.
 *
 * Repairing is not on the table. A mis-decoded string has already lost information in ways
 * that are not always recoverable, and a guess that looks plausible is worse than a rejection:
 * it lands in the wordlist as if it were authored, and nobody looks at it again. So this only
 * ever answers "is this damaged, and how" — the value is refused and the page number reported,
 * and the person who owns the wordlist fixes it at source.
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
export interface MojibakeFinding {
  kind: 'replacement-char' | 'utf8-as-latin1' | 'lone-surrogate'
  sample: string
  detail: string
}

/** Lead bytes of a UTF-8 Arabic/Hebrew sequence, seen through a latin-1 decoder. */
const UTF8_AS_LATIN1 = /[Â-ß][-¿]/
/** The Ã-family: latin-1 text that has been through the same mangling. */
const A_TILDE_RUN = /Ã[-¿ -ÿ]/

export function detectMojibake(value: string): MojibakeFinding[] {
  const out: MojibakeFinding[] = []
  const s = String(value ?? '')

  const fffd = s.indexOf('�')
  if (fffd !== -1) {
    out.push({
      kind: 'replacement-char',
      sample: s.slice(Math.max(0, fffd - 6), fffd + 7),
      detail: 'Contains U+FFFD. Something already failed to decode this text; the original bytes are gone.',
    })
  }

  const m8 = UTF8_AS_LATIN1.exec(s) ?? A_TILDE_RUN.exec(s)
  if (m8) {
    out.push({
      kind: 'utf8-as-latin1',
      sample: s.slice(Math.max(0, m8.index - 4), m8.index + 8),
      detail: 'Looks like UTF-8 bytes read as latin-1 (the Ø/Ù/Ã pattern). Re-export the source as UTF-8 rather than retyping it.',
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
