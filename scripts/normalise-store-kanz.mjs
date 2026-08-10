/**
 * normalise-store-kanz.mjs — convert Kanz doubles already sitting in the shared store.
 *
 * `api/dictionary/[key].ts` now normalises at entry, so nothing NEW can arrive doubled. This is
 * for what was written before that: every head revision whose value still differs from its
 * converted form. Until each is rewritten it stays unretired and therefore stays APPLIED, and
 * `applySharedOverrides` puts the doubles back over the generated wordlist on every reload.
 *
 * ── APPENDS, NEVER EDITS ─────────────────────────────────────────────────────────────
 *
 * The store is append-only by design — six reviewers share it and none is authenticated, so
 * nothing is ever replaced in place. This writes the converted value as a NEW revision on top,
 * with a note saying what it did, which is the same route a person's edit takes. The doubled
 * revision stays in history where it can be read.
 *
 * ── DRY RUN BY DEFAULT ───────────────────────────────────────────────────────────────
 *
 *   node scripts/normalise-store-kanz.mjs --base https://<deployment>          # report only
 *   node scripts/normalise-store-kanz.mjs --base https://<deployment> --write  # rewrite
 *
 * `--base` is required and has no default: a migration that guesses which store it is rewriting
 * is one that eventually rewrites the wrong one. Deployment Protection means this needs whatever
 * the deployment requires to be reachable — pass it with `--header "Cookie: ..."` if so.
 */
import { kanzNormalised, normaliseKanz, describeKanzChanges } from '../src/i18n/kanzNorm.mjs'

/**
 * The decision, as a pure function so it can be tested without a store. Takes the heads the API
 * returns; gives back exactly those whose stored value is not its own converted form.
 */
export function doubledHeads(overrides) {
  const out = []
  for (const rev of overrides ?? []) {
    const value = String(rev.value ?? '')
    if (!value) continue                       // a blank-row request carries nothing to convert
    const converted = normaliseKanz(value)
    if (!converted.changed) continue
    out.push({ key: rev.key, from: value, to: converted.value, changes: describeKanzChanges(converted.changes), revisionId: rev.revisionId, author: rev.author })
  }
  return out
}

/** base64url of the normalised key — the path form the API takes. */
const encodeKey = (key) => Buffer.from(key.replace(/\s+/g, ' ').trim(), 'utf8')
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : undefined
}

// Run only when invoked directly, so the pure function above can be imported by a test.
if (process.argv[1] && process.argv[1].endsWith('normalise-store-kanz.mjs')) {
  const base = arg('--base')
  const write = process.argv.includes('--write')
  if (!base) {
    console.error('--base https://<deployment> is required')
    process.exit(2)
  }
  const headers = { 'content-type': 'application/json' }
  const h = arg('--header')
  if (h) { const i = h.indexOf(':'); headers[h.slice(0, i).trim()] = h.slice(i + 1).trim() }

  const res = await fetch(`${base.replace(/\/$/, '')}/api/dictionary`, { headers })
  if (!res.ok) {
    console.error(`GET /api/dictionary -> ${res.status} ${res.statusText}. Nothing was changed.`)
    process.exit(1)
  }
  const { overrides = [] } = await res.json()
  const doubled = doubledHeads(overrides)

  // The store size is printed FIRST and always, because "0 carry doubles" on its own cannot be
  // told apart from a run that read nothing. A reachable store with work already done says
  // "N override(s)" with N > 0; an empty or wrongly-read one says 0 and is called out.
  console.log(`${overrides.length} override(s) in the store`)
  if (!overrides.length) {
    console.log('the store returned NO overrides at all — that is not the same as nothing to do.')
    console.log('check the --base URL and that the request was authorised before reading this as clean.')
  }
  console.log(`${doubled.length} carry Kanz doubles`)
  for (const d of doubled) {
    console.log(`  ${JSON.stringify(d.key).slice(0, 56)}`)
    console.log(`     ${JSON.stringify(d.from)}  ->  ${JSON.stringify(d.to)}   (${d.changes}; ${d.author})`)
  }
  if (!doubled.length) { console.log('\nnothing to do'); process.exit(0) }
  if (!write) { console.log('\ndry run — pass --write to append the converted values'); process.exit(0) }

  let ok = 0
  const failed = []
  for (const d of doubled) {
    const r = await fetch(`${base.replace(/\/$/, '')}/api/dictionary/${encodeKey(d.key)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        value: d.to,
        author: 'kanz-normalisation',
        kind: 'edit',
        baseRevisionId: d.revisionId,
        note: `converted Kanz keyboard output (${d.changes})`,
      }),
    })
    if (r.ok) ok++
    else failed.push(`${d.key}: ${r.status}`)
  }
  console.log(`\n${ok} rewritten, ${failed.length} failed`)
  for (const f of failed) console.log(`  FAIL ${f}`)

  // OUTCOME, not "the POSTs returned 2xx": read the store back and ask whether any doubles
  // remain. A 201 for each write is not the same claim as a store with nothing left to convert.
  const after = await fetch(`${base.replace(/\/$/, '')}/api/dictionary`, { headers })
  const remaining = after.ok ? doubledHeads((await after.json()).overrides) : null
  if (remaining === null) console.log('could not read the store back — the count above is unverified')
  else console.log(`re-read: ${remaining.length} override(s) still carry doubles`)
  process.exit(failed.length || (remaining && remaining.length) ? 1 : 0)
}
