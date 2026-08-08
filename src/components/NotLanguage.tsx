/**
 * `notLanguage` — mark text that is not language in ANY language.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────
 *
 * The coverage scanner reports every Latin text node on screen, which is what makes it
 * honest: it cannot be gamed by wiring, and there is no hand-maintained "ignore these"
 * list to rot. But a handful of nodes are genuinely untranslatable, and they turned up in
 * the wordlist owner's queue as rows to fill:
 *
 *   MH   avatar initials, derived from a person's name by taking first letters
 *   EN   the language switcher's own labels — the only two strings on the page that
 *   LSD  must NOT follow the current language, because they are how you change it
 *
 * `MH` has no Lisan al-Dawat form. It is not a word; it is the first letters of whatever
 * the name happens to be, and if the name is translated the initials follow from the
 * translation, not from a dictionary row. Asking someone to translate it wastes their
 * time and — worse — leaves a permanently unfinished row in a queue that is supposed to
 * reach zero.
 *
 * ── WHY A MARKER AND NOT AN ALLOWLIST ────────────────────────────────────────────────
 *
 * A list of literals (`['MH', 'AB', 'EN', …]`) would suppress those two letters EVERYWHERE,
 * including a real untranslated `MH` somewhere else, and it would need editing every time a
 * fixture gains a name. It is also invisible: nothing at the call site says why that string
 * is exempt.
 *
 * This marks the SITE instead. Spread it onto the element that renders the text:
 *
 *   <span className="…" {...notLanguage}>{initialsOf(name)}</span>
 *
 * Greppable — `rg notLanguage` lists every exemption in the app with its context — and it
 * exempts exactly the node it is written on, not a string.
 *
 * NOT for untranslated copy. A string that has no LSD form YET is class C and belongs in the
 * queue; this is only for strings that have no LSD form at all.
 */

/** The attribute `src/i18n/domScan.ts` skips. Exported so the scanner can name it too. */
export const NOT_LANGUAGE_ATTR = 'data-lsd-not-language'

/** Spread onto the element whose text is not language. See the note above. */
export const notLanguage = { [NOT_LANGUAGE_ATTR]: '' } as const

/**
 * A person's initials — first letters of the first two words.
 *
 * Fifteen files had grown a private copy of this. They agreed, but nothing kept them
 * agreeing, and the marker above has to sit beside every one of them.
 */
export const initialsOf = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
