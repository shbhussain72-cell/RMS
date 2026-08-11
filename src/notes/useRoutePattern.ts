/**
 * The current route PATTERN, e.g. `/miqaats/:id/city`.
 *
 * ── WHY IT REUSES THE REMARKS ROUTE TABLE ────────────────────────────────────────────
 *
 * `src/remarks/routes.ts` already maps a pathname to the pattern that matched it, and
 * `scripts/remarks.test.mjs` already asserts that table is identical to every `path=` in
 * `App.tsx`. Remarks is retired, but that table is not about remarks — it exists because this
 * app uses a `<Routes>` element tree rather than a data router, so there is no runtime way to
 * ask React Router which PATTERN matched, only which pathname did.
 *
 * Copying it here would be a second table with the same job and no test, and the first thing it
 * would do is drift. Importing it keeps one table under one assertion. If remarks is ever
 * deleted outright, this file is what has to move — not what has to be rewritten.
 */
import { useLocation } from 'react-router-dom'
import { patternFor } from '../remarks/routes'

export function useRoutePattern(): string {
  return patternFor(useLocation().pathname)
}
