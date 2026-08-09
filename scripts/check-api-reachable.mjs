/**
 * check-api-reachable.mjs — do requests to /api reach a FUNCTION on the deployed site?
 *
 *   node scripts/check-api-reachable.mjs [baseUrl]
 *   npm run check:api                            (defaults to DEPLOY_URL, then the live URL)
 *
 * ── THE FAILURE THIS EXISTS TO CATCH ─────────────────────────────────────────────────
 *
 * `vercel.json` carried a catch-all SPA rewrite:
 *
 *     { "source": "/(.*)", "destination": "/index.html" }
 *
 * which matches `/api/...` as happily as `/roster`. Every API call was answered by the app
 * shell: status 200, a page of HTML, and no function ever ran. The client is built for that —
 * `transport.ts` throws `NotJson` rather than returning — but the reviewer sees "shared store
 * unreachable", which reads as an outage rather than as a routing rule, and a write silently
 * joins the outbox to be retried against a server that will never answer.
 *
 * Nothing inside the app can distinguish this from the store being down. Nothing in the build
 * can see it at all: `vercel.json` is configuration, and the only place it becomes true or
 * false is a deployment. So this check runs against a URL, over the network, after a deploy.
 *
 * ── WHAT IT ASSERTS, AND WHY IT IS NOT A CONFIG CHECK ────────────────────────────────
 *
 * Reading `vercel.json` and confirming the pattern contains `(?!api/)` would be asserting the
 * mechanism: it would pass on a repo that was never deployed, on a deploy that failed, and on
 * a project where the functions did not build. The subject is the RESPONSE — its content type,
 * and whether its body parses as JSON.
 *
 * Every `/api` handler is wrapped in `handler()`, which answers JSON in every case including
 * the disabled one (404 `{"error":"not found"}`). So JSON coming back is proof the request
 * reached a function, whatever the status code. HTML coming back is proof it did not.
 *
 * ── THE CONTROL ──────────────────────────────────────────────────────────────────────
 *
 * `/` must come back as HTML. Without that, a wrong URL, a DNS failure or a site that is
 * simply down would make every "is this JSON?" assertion fail identically to the routing bug,
 * and the report would name the wrong cause. The control also tells Deployment Protection
 * apart from the defect: a protected deployment answers the CONTROL with a challenge too, and
 * that is a different sentence — "I could not see the site" rather than "the site is broken".
 *
 * For a protected deployment, set a Protection Bypass for Automation secret in Vercel
 * (Settings → Deployment Protection) and pass it as VERCEL_AUTOMATION_BYPASS_SECRET.
 */

const BASE = (process.argv[2] || process.env.DEPLOY_URL || 'https://rmsxmumin.vercel.app').replace(/\/$/, '')
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || ''

/** Routes whose GET is a plain read. Any of them answering JSON proves routing works. */
const API_ROUTES = ['/api/dictionary', '/api/remarks', '/api/sync-wordlist']

let failures = 0
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failures++ }
const pass = (msg) => console.log(`  ok    ${msg}`)
const note = (msg) => console.log(`        ${msg}`)

const headers = BYPASS
  ? { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' }
  : {}

async function probe(path) {
  const url = `${BASE}${path}`
  try {
    const res = await fetch(url, { headers, redirect: 'follow' })
    const body = await res.text()
    return {
      ok: true,
      status: res.status,
      type: (res.headers.get('content-type') || '').toLowerCase(),
      body,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Vercel's SSO challenge is HTML served with 200 or 401 and is indistinguishable from the app
 * shell by content type alone. These markers are what separates "I am locked out" from "the
 * routing is wrong", and getting that wrong sends someone to fix the rewrite that is already
 * correct.
 */
const isProtection = (r) =>
  r.status === 401
  || /vercel[^<]{0,40}(authentication|sso)/i.test(r.body)
  || /_vercel\/sso/i.test(r.body)

const looksLikeAppShell = (r) => /^\s*<!doctype html/i.test(r.body) || /<div id="root"/.test(r.body)

console.log(`\nAPI reachability — ${BASE}\n`)

// ── CONTROL ──────────────────────────────────────────────────────────────────────────
const root = await probe('/')
if (!root.ok) {
  fail(`the site did not answer at all: ${root.error}`)
  note('Nothing below can mean anything if the site is unreachable. Check the URL.')
  process.exit(1)
}
if (isProtection(root)) {
  fail(`the deployment is behind Deployment Protection (status ${root.status})`)
  note('This check cannot see the site, which is NOT the same finding as the API being broken.')
  note('Vercel → Settings → Deployment Protection → Protection Bypass for Automation,')
  note('then re-run with VERCEL_AUTOMATION_BYPASS_SECRET=<secret>.')
  process.exit(1)
}
if (!/text\/html/.test(root.type)) {
  fail(`control: / returned ${root.type || 'no content type'}, expected text/html`)
  note('The control is what proves this script can tell HTML from JSON at all.')
  process.exit(1)
}
pass(`control: / is served as HTML (${root.status})`)

// ── THE ASSERTION ────────────────────────────────────────────────────────────────────
for (const route of API_ROUTES) {
  const r = await probe(route)
  if (!r.ok) { fail(`${route} — no response: ${r.error}`); continue }

  if (looksLikeAppShell(r)) {
    fail(`${route} was answered with the APP SHELL (${r.status}, ${r.type || 'no content type'})`)
    note('The SPA rewrite is matching /api. In vercel.json the source must exclude it:')
    note('    { "source": "/((?!api/).*)", "destination": "/index.html" }')
    continue
  }
  if (!/application\/json/.test(r.type)) {
    fail(`${route} returned ${r.type || 'no content type'} (${r.status}), not application/json`)
    note(`first bytes: ${JSON.stringify(r.body.slice(0, 120))}`)
    continue
  }
  try {
    JSON.parse(r.body)
  } catch {
    fail(`${route} claims application/json but the body does not parse`)
    note(`first bytes: ${JSON.stringify(r.body.slice(0, 120))}`)
    continue
  }

  // Reaching a function is the property under test. A 404 from `handler()` when REVIEW_API is
  // unset is still a function answering, and saying so is more use than calling it a failure.
  const reached = r.status === 404
    ? `${route} reached a function — 404 JSON, which is what every handler returns while REVIEW_API is not "true"`
    : `${route} reached a function (${r.status}, application/json)`
  pass(reached)
}

console.log('')
if (failures) {
  console.error(`${failures} failing assertion(s) — /api is not reaching its functions.\n`)
  process.exit(1)
}
console.log('/api reaches its functions.\n')
