/**
 * Types for mojibake.mjs — CLASS A (byte damage) only; class B is `src/i18n/kanzNorm.mjs`,
 * which ships its own `kanzNorm.d.mts`. See the header over there for why they are two
 * modules and not one function with a flag.
 *
 * Hand-written because the implementation must stay plain .mjs:
 * `src/dev/DictionaryPanel.tsx` is TypeScript in the browser bundle, while `api/dictionary/
 * [key].ts` and `api/_lib/syncPlan.ts` are Vercel Functions, which may only import files that
 * load as uploaded. See the header of `mojibake.mjs` for why that rules out .ts.
 *
 * Keep the union in `kind` in step with the three `out.push({ kind: … })` sites over there —
 * nothing checks that for us, and a widened implementation with a stale declaration here is
 * a `switch` the panel stops handling without a type error.
 */

/** One reason a value was refused. `sample` is the offending fragment, for the message. */
export interface ByteDamageFinding {
  kind: 'replacement-char' | 'utf8-as-latin1' | 'lone-surrogate'
  sample: string
  detail: string
}

export declare function detectByteDamage(value: string): ByteDamageFinding[]

/** Normalisation check, kept separate: NFC is a fixable authoring detail, not damage. */
export declare function isNfc(value: string): boolean
