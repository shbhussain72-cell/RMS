/**
 * Route patterns, mirroring `src/App.tsx`.
 *
 * Duplicated deliberately. This app uses `<BrowserRouter>` with a `<Routes>` element tree,
 * not a data router, so `useMatches()` is unavailable and there is no runtime way to ask
 * React Router which PATTERN matched — only which pathname did. Since every interesting route
 * here is `/miqaats/:id/…`, grouping remarks by pathname alone would split one screen's
 * remarks across every miqaat id anyone happened to be looking at.
 *
 * The duplication is guarded: `scripts/remarks-routes.test.mjs` parses the `path="…"` props
 * out of App.tsx and asserts this list matches exactly, so adding a route without updating
 * this file fails the test suite rather than silently degrading remark grouping.
 */
import { matchPath } from 'react-router-dom'

export const ROUTE_PATTERNS = [
  '/login',
  '/',
  '/miqaats',
  '/miqaats/:id',
  '/miqaats/:id/questionnaire',
  '/miqaats/:id/edit-form',
  '/miqaats/:id/people',
  '/miqaats/:id/invite',
  '/miqaats/:id/review',
  '/miqaats/:id/success',
  '/miqaats/:id/preferred-city',
  '/miqaats/:id/arrange',
  '/miqaats/:id/city',
  '/miqaats/:id/araz',
  '/miqaats/:id/zone',
  '/miqaats/:id/manage',
  '/miqaats/:id/manage/host',
  '/miqaats/:id/manage/relay',
  '/miqaats/:id/city-allocation',
  '/miqaats/:id/zone-allocation',
  '/miqaats/:id/roster',
  '/miqaats/:id/raza',
  '/miqaats/:id/raza-letter',
  '/miqaats/:id/timeline',
  '/notifications',
  '/join-group',
] as const

/**
 * Which pattern does this pathname match?
 *
 * Longest pattern first, so `/miqaats/:id/manage/host` is preferred over `/miqaats/:id`.
 * Falls back to the pathname itself, which keeps an unrecognised route usable rather than
 * bucketing it under something wrong.
 */
export function patternFor(pathname: string): string {
  const ordered = [...ROUTE_PATTERNS].sort((a, b) => b.split('/').length - a.split('/').length)
  for (const p of ordered) {
    if (matchPath({ path: p, end: true }, pathname)) return p
  }
  return pathname
}
