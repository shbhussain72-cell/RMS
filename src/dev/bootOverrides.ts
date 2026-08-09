/**
 * bootOverrides.ts — re-apply stored dictionary edits on a fresh load.
 *
 * ── THE DEFECT THIS FIXES ────────────────────────────────────────────────────────────
 *
 * A dictionary edit changed the running page immediately and vanished the moment you reloaded.
 * Reload is precisely the action somebody takes to confirm their edit landed, so the feature
 * read as broken while the live-update path was working perfectly.
 *
 * Measured against the rendered DOM on both paths, at /miqaats/ashara-1448 in LSD:
 *
 *                                    dev path      panel path
 *   DOM shows the new value          true          true
 *   after reload                     LOST          LOST
 *   GETs to /api/dictionary at boot   —            0
 *
 * Two holes, same shape, two different causes — which is the reason this file exists rather
 * than a one-line fix in each:
 *
 *   dev path    `loadOverrides()` was exported from `dev/overrides.ts` and had NO CALLER
 *               anywhere in src/. Nothing ever re-applied the staged queue.
 *   panel path  `refresh()` in `shared/dictionaryApi.ts` IS called — but only from
 *               DictionaryPanel's `pull()`, behind `if (open)`. Open the panel and the store
 *               loads; never open it and the app renders the committed wordlist while the
 *               store holds an edit nobody sees.
 *
 * Note what that means for testing: an assertion of the form "the loader is called at boot"
 * would have PASSED on the panel path throughout, because `refresh()` genuinely is called. Only
 * an assertion about the rendered DOM after a reload catches both. See check-dictionary.
 *
 * ── WHY ONE BOOT AND TWO STORES ──────────────────────────────────────────────────────
 *
 * The boot is shared; the stores are not, and merging them would be wrong.
 *
 *   `dev/overrides.ts`        a LOCAL queue behind the vite middleware `/__lsd/overrides`. It
 *                             exists only under the dev server, is one person's staging area,
 *                             and is what the wordlist sync eventually drains.
 *   `shared/dictionaryApi.ts` the SHARED store behind `/api/dictionary`. Multi-author, carries
 *                             revisions, conflicts and history, and is reachable from a
 *                             deployed preview where the middleware does not exist.
 *
 * They have different lifetimes, different authority and different failure modes. What they
 * share is the moment they must run — first paint — and that is the thing that was missing from
 * both. So this owns the moment, and each store keeps owning itself. If a later change makes
 * one of them redundant, delete that store; do not fold its loader into the other's.
 *
 * Both are attempted and neither is fatal: a dev server has no `/api/dictionary`, a deployed
 * preview has no `/__lsd/overrides`, and in each case the other one is still worth applying.
 */

/**
 * Load every stored override and push it into the running dictionary.
 *
 * Called once from `main.tsx`, inside a `REVIEW_TOOLS` guard so this module and everything it
 * imports are dropped from a production build. Both loaders call their own `notify()`, which is
 * what re-renders the app — so there is nothing to co-ordinate here beyond running them.
 */
export async function applyStoredOverridesAtBoot(): Promise<void> {
  /** Loads to attempt. Each is a thunk so an absent module is never imported at all. */
  const loaders: Promise<unknown>[] = []

  // The SHARED store ships wherever the review flag is on, deployed previews included, so it
  // is loaded under the same condition as this module.
  loaders.push(import('../shared/dictionaryApi').then((m) => m.refresh()))

  // The LOCAL queue is behind a vite middleware that exists ONLY under the dev server, and its
  // endpoint literal `/__lsd/overrides` is on check-dev-only's FORBIDDEN list — it must be
  // absent from every built artefact, review flag or not. `import.meta.hot` is statically
  // undefined in a build, so this branch and the module it reaches are dropped, and that
  // invariant holds. Importing it unconditionally here would have shipped the endpoint into
  // any flag-on build and broken a gate that has been correct for three releases.
  if (import.meta.hot) {
    loaders.push(import('./overrides').then((m) => m.loadOverrides()))
  }

  // allSettled, not all: one store being unreachable is the normal case — a dev server has no
  // `/api/dictionary`, a deployed preview has no middleware — and must not stop the other from
  // applying. Each loader already swallows its own transport failure; this is the backstop for
  // anything they do not.
  const results = await Promise.allSettled(loaders)
  for (const r of results) {
    if (r.status === 'rejected') {
      // Never rethrown. A missing store is not an app error, and a boot path that can reject
      // is a boot path that can take the first paint with it.
      console.warn(BOOT_WARNING, r.reason)
    }
  }
}

/**
 * Held as a module constant rather than written inline, so `check-dev-only.mjs` can grep for it
 * as proof this module did not ship. A string literal that reaches an argument position, which
 * is the rule that list is built on: a value the program carries, never a name it uses.
 */
const BOOT_WARNING = '[dictionary] a stored override source was unavailable at boot'
