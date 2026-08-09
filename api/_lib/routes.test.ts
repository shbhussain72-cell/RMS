/**
 * routes.test.ts — every deployed route answers, in both of the shapes Vercel accepts.
 *
 * ── THE FAILURE THIS EXISTS TO CATCH ─────────────────────────────────────────────────
 *
 * Every `/api` route on the live deployment answered `500 FUNCTION_INVOCATION_FAILED` as
 * `text/plain`, while the same modules invoked locally answered JSON on every path. Vercel
 * defines that error as an uncaught exception, and `handler()` cannot produce one — it
 * catches, and returns a JSON 404 when `REVIEW_API` is unset and a JSON 500 when the store is
 * missing. A throw before the handler runs is a throw in the platform's invocation of it, and
 * the only thing under this repo's control there is the shape of the module's exports.
 *
 * The routes carried named method exports written as `export const GET = handler(…)`. Vercel's
 * documentation for a non-framework `/api` shows `export default { fetch(request) {…} }` as
 * the primary form and `export function GET(request) {…}` — a function declaration — as the
 * alternative. They now export both, with the default built FROM the named methods by
 * `route()`, so the two cannot drift apart.
 *
 * ── WHY THIS ENUMERATES THE DIRECTORY ────────────────────────────────────────────────
 *
 * Listing the routes by hand would pass forever on the day someone adds an eighth one. The
 * file list is derived from the filesystem the way Vercel derives it, so a new route is in
 * this suite the moment it exists, and a route that forgets its default export fails here
 * rather than at the next deploy.
 *
 * ── WHAT IT DOES NOT CLAIM ───────────────────────────────────────────────────────────
 *
 * That the deployment works. Nothing local can assert that; `npm run check:api` fetches the
 * deployed URL and asserts the response is JSON, and it is the only thing that can.
 */
import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { __setStoreForTests, memoryStore } from './store'

const API_DIR = resolve(__dirname, '..')

/**
 * The files Vercel turns into functions: everything under `api/` except the `_lib` helpers
 * and the test files beside them. Derived, not listed — see the header.
 */
function routeFiles(dir = API_DIR, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '_lib') continue
      routeFiles(full, out)
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(relative(API_DIR, full).replace(/\\/g, '/'))
    }
  }
  return out
}

const ROUTES = routeFiles()
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const

const load = (rel: string) => import(/* @vite-ignore */ `../${rel}`)

/**
 * Generous, because the subject is the export shape and not the clock. `cron/sync-wordlist.ts`
 * pulls in the zip patcher and SheetJS on first import and timed out at the 5s default, which
 * reported "no default export" for a module that has one.
 */
const SLOW = 30_000

/** A request the route will refuse cheaply — the subject is the SHAPE, not the business logic. */
const req = (method: string, rel: string) =>
  new Request(`https://example.test/api/${rel.replace(/\.ts$/, '').replace(/\/index$/, '')}`, {
    method,
    ...(method === 'GET' ? {} : { body: '{}', headers: { 'content-type': 'application/json' } }),
  })

const read = async (res: Response) => ({
  status: res.status,
  type: (res.headers.get('content-type') || '').split(';')[0],
  body: await res.text(),
})

beforeEach(() => {
  process.env.REVIEW_API = 'true'
  __setStoreForTests(memoryStore())
})

describe('deployed route shape', () => {
  it('there are routes to check — without this the suite is vacuous', () => {
    // The control. An empty list would make every `it.each` below pass by never running.
    expect(ROUTES.length).toBeGreaterThan(0)
    expect(ROUTES).toContain('dictionary/index.ts')
    expect(ROUTES).toContain('sync-wordlist.ts')
  })

  it('no test file is in the deployable set', () => {
    // Vercel's documented exclusion from becoming a function is a DOT prefix, not an
    // underscore. Test files under `api/` import vitest, which is a devDependency and is not
    // installed in the deployment — so they must not be uploaded. `.vercelignore` does that;
    // this asserts they are at least not in the set this suite calls routes.
    expect(ROUTES.filter((r) => r.includes('.test.'))).toEqual([])
  }, SLOW)

  it.each(ROUTES)('%s exports a default { fetch }', async (rel) => {
    const mod = await load(rel)
    expect(typeof mod.default, `${rel} has no default export`).toBe('object')
    expect(typeof mod.default?.fetch, `${rel} default export has no fetch`).toBe('function')
  }, SLOW)

  it.each(ROUTES)('%s exports at least one named HTTP method', async (rel) => {
    const mod = await load(rel)
    const found = METHODS.filter((m) => typeof mod[m] === 'function')
    expect(found.length, `${rel} exports no HTTP method`).toBeGreaterThan(0)
  }, SLOW)

  it.each(ROUTES)('%s — fetch and the named method give the same answer', async (rel) => {
    const mod = await load(rel)
    for (const method of METHODS) {
      if (typeof mod[method] !== 'function') continue
      // Both shapes, same request, compared on what a client would actually observe.
      const direct = await read(await mod[method](req(method, rel)))
      __setStoreForTests(memoryStore())
      const viaFetch = await read(await mod.default.fetch(req(method, rel)))
      expect(viaFetch, `${rel} ${method}`).toEqual(direct)
      expect(direct.type, `${rel} ${method} must answer JSON`).toBe('application/json')
    }
  }, SLOW)

  it.each(ROUTES)('%s answers JSON 405 for a method it does not implement', async (rel) => {
    const mod = await load(rel)
    const unsupported = METHODS.find((m) => typeof mod[m] !== 'function')
    if (!unsupported) return
    const res = await mod.default.fetch(req(unsupported, rel))
    expect(res.status).toBe(405)
    expect((res.headers.get('content-type') || '').split(';')[0]).toBe('application/json')
    expect((await res.json()).allowed).toBeInstanceOf(Array)
  }, SLOW)

  it.each(ROUTES)('%s answers JSON 404 while REVIEW_API is unset', async (rel) => {
    // The disabled path is the one a misconfigured deployment takes, so it is the one most
    // likely to be hit and the one that must not produce an HTML or plain-text error page.
    process.env.REVIEW_API = ''
    const mod = await load(rel)
    const method = METHODS.find((m) => typeof mod[m] === 'function')!
    const res = await mod.default.fetch(req(method, rel))
    expect(res.status).toBe(404)
    expect((res.headers.get('content-type') || '').split(';')[0]).toBe('application/json')
  }, SLOW)
})
