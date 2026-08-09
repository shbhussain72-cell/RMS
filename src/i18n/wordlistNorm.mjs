/**
 * wordlistNorm.mjs — how a spreadsheet cell becomes a dictionary key and a dictionary value.
 *
 * ONE definition, imported by all three consumers:
 *
 *   scripts/build-lsd-dict.mjs   turns the xlsx into lsd.json at build time
 *   src/shared/dictionaryApi.ts  decides whether a live override has been merged yet
 *   api/sync-wordlist.ts         matches an override back to its row in the xlsx
 *
 * ── WHY THIS HAD TO BE EXTRACTED ─────────────────────────────────────────────────────
 *
 * Override retirement compares a value in the shared store against the value the build
 * baked into lsd.json. Those are not the same string: `bakedValue` prefixes mixed-script
 * values with RLM, so the store's `register كرو` becomes `‏register كرو` in the dictionary.
 * A retirement check written against the raw value would never match, no override would ever
 * be retired, and the pending count would climb forever while every edit was already in the
 * wordlist. Silent, and it looks like the feature working.
 *
 * The key side has the same trap from the other direction: five English cells carry a `۞`
 * ornament that `normKey` strips, so the store's key never equals the raw cell text. A sync
 * matching on raw equality would fail to find those rows and append duplicates.
 *
 * Both are cases where a copied predicate would have drifted — see docs/assertion-discipline.md
 * and scripts/probe-dom.mjs for what that costs here.
 *
 * Plain .mjs with a hand-written .d.mts beside it, because `build-lsd-dict.mjs` is executed
 * by node directly (and imported by vite.config.ts) while the other two are TypeScript.
 * No imports, no node built-ins: it has to run in a browser bundle too.
 */

/**
 * Decorative Arabic ornaments that keep getting pasted onto the END of English keys when the
 * sheet is edited — U+06DE ۞ is the recurring one (it is a real glyph in the app's Login
 * divider, so it travels with copy/paste). An ornament in the ENGLISH column is always an
 * artifact: it makes the key unmatchable, so `ITS ID۞` silently stops resolving and the
 * string renders English forever.
 *
 * Stripped here rather than hand-cleaned in Excel, because hand-cleaning has been undone
 * twice by a later revision of the sheet. Only the English key is scrubbed — LSD values
 * legitimately contain these glyphs and are never touched.
 */
export const KEY_ORNAMENTS = /[۞۩﴾﴿]/g

/**
 * Lookup-key normalisation: strip ornaments, collapse whitespace runs, trim.
 * Never lowercase — casing is meaningful in the wordlist (LIVE, OPTIONAL, RAZA STATUS).
 */
export const normKey = (v) => String(v ?? '').replace(KEY_ORNAMENTS, '').replace(/\s+/g, ' ').trim()

const RLM = '‏'
const hasArabicScript = (s) => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(s)
const startsWithMark = (s) => /^[‎‏؜⁦-⁩]/.test(s)

/**
 * A raw LSD cell as the dictionary will hold it: trimmed, then given an explicit base
 * direction.
 *
 * A value that mixes Arabic with Latin or digits has NEUTRAL characters at its edges —
 * brackets, digits, punctuation. The Unicode bidi algorithm resolves those from the
 * surrounding paragraph, so the same string renders differently depending on what wraps it:
 * a trailing "؟" or a "﴿…﴾" pair jumps to the wrong end, and a leading Latin word drags the
 * line the wrong way.
 *
 * The translator already prefixes most values with U+200F for exactly this reason — but only
 * 240 of ~300 mixed values had it, which is why some strings looked right and others did not.
 * Adding it here makes every value behave identically wherever it is rendered.
 *
 * Presentation only: RLM is a zero-width formatting character. No word, letter or bracket is
 * altered, and a value that already carries a directional mark is left alone.
 */
export const bakedValue = (v) => {
  const s = String(v ?? '').trim()
  if (!s || startsWithMark(s)) return s
  // Only mixed-script values need the hint; pure Arabic and pure Latin are unambiguous.
  const mixed = hasArabicScript(s) && /[A-Za-z0-9]/.test(s)
  return mixed ? RLM + s : s
}

/**
 * Words a wordlist owner writes in an LSD cell to say something ABOUT the string rather than
 * to translate it. `remove` is not Lisan al-Dawat for anything; it is an instruction.
 *
 * A sentinel must never reach lsd.json as a value, and a sentinel row is never a sync
 * candidate — the store must not overwrite an instruction with a translation.
 */
export const SENTINELS = new Set(['remove'])

export const isSentinel = (raw) => SENTINELS.has(String(raw ?? '').trim().toLowerCase())
