/**
 * reviewTools.ts — the ONE place that decides whether the internal review tooling exists.
 *
 *   VITE_REVIEW_TOOLS=true    Remarks + Coverage are mounted, and the i18n coverage tracking
 *                             that feeds them is compiled in.
 *   anything else / unset     none of it exists in the bundle.
 *
 * ── WHY A FLAG AND NOT `import.meta.env.DEV` ─────────────────────────────────────────
 *
 * The tools were gated on DEV, which meant they were reachable only on a machine running
 * `vite`. Review happens on the Vercel URL, where DEV is false and the tools vanished — the
 * people whose feedback the tools exist to collect were the only people who could not reach
 * them. DEV answers "is this a dev server"; the question here is "is this an internal review
 * build", and those are different questions that happened to have the same answer locally.
 *
 * ── WHY ONE MODULE AND NOT THE EXPRESSION INLINE ─────────────────────────────────────
 *
 * Repeating `import.meta.env.VITE_REVIEW_TOOLS === 'true'` at six call sites is six chances
 * to typo the variable name into something that is permanently falsy, and a typo here fails
 * SILENTLY in the safe-looking direction: the tool simply does not appear, which is
 * indistinguishable from the flag being off. Once, in one place, checked by the build.
 *
 * ── HOW THIS SURVIVES TREE-SHAKING ───────────────────────────────────────────────────
 *
 * Vite replaces `import.meta.env.VITE_*` with a literal at build time, so with the flag unset
 * this file compiles to `const REVIEW_TOOLS = false` and Rollup propagates that constant into
 * every `if (!REVIEW_TOOLS) return null` guard, drops the dead branch, and then drops the
 * unreachable imports with it.
 *
 * That is the theory. `scripts/check-dev-only.mjs` is the measurement, and it now runs in
 * BOTH flag states — a gate that only ever tests one of them is not a gate. The Remarks tool
 * shipped to production once already, from a default parameter that looked entirely correct.
 */
export const REVIEW_TOOLS = import.meta.env.VITE_REVIEW_TOOLS === 'true'

/**
 * True on a build where the tools are on but there is no dev server behind them — i.e. the
 * deployed review build. Used for the "this browser only" notice: on a local dev server the
 * reviewer IS the developer and the notice would be noise.
 */
export const REVIEW_TOOLS_DEPLOYED = REVIEW_TOOLS && !import.meta.env.DEV
