/**
 * Types for kanzNorm.mjs — hand-written for the same reason as `wordlistNorm.d.mts`: the
 * implementation must stay plain .mjs so the generator (node), the editor (browser bundle)
 * and the sync (TypeScript) can all import the one copy.
 */
export interface KanzPair {
  /** The doubled Arabic letter the Kanz keyboard emits, e.g. `ظظ`. */
  readonly doubled: string
  /** The Unicode letter it stands for, e.g. `ہ`. */
  readonly single: string
}

/** One pair's contribution to a conversion. */
export interface KanzChange {
  readonly doubled: string
  readonly single: string
  readonly count: number
}

export interface KanzResult {
  /** The converted string. Equal to the input when `changed` is false. */
  readonly value: string
  readonly changed: boolean
  /** Per-pair, with counts — what the editor shows and what a test asserts against. */
  readonly changes: readonly KanzChange[]
}

export declare const KANZ_PAIRS: readonly KanzPair[]
export declare const UNMAPPED_DOUBLES: readonly string[]
export declare function hasKanzDoubles(value: unknown): boolean
export declare function unmappedDoubles(value: unknown): string[]
export declare function normaliseKanz(value: unknown): KanzResult
export declare function kanzNormalised(value: unknown): string
export declare function describeKanzChanges(changes: readonly KanzChange[] | undefined): string
