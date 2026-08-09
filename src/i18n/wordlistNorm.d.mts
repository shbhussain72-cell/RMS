/**
 * Types for wordlistNorm.mjs — hand-written because the implementation must stay plain .mjs:
 * `scripts/build-lsd-dict.mjs` is run by node directly and imported by vite.config.ts, while
 * the dictionary client and the sync endpoint are TypeScript.
 */
export declare const KEY_ORNAMENTS: RegExp
export declare function normKey(v: unknown): string
export declare function bakedValue(v: unknown): string
export declare const SENTINELS: Set<string>
export declare function isSentinel(raw: unknown): boolean
