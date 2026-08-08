/**
 * emit-blank-rows.mjs — the class-C queue, as an .xlsx patch with EMPTY LSD cells.
 *
 *   node scripts/emit-blank-rows.mjs            # write artifacts/audit/wordlist-patch.xlsx
 *   node scripts/emit-blank-rows.mjs --list     # just print what it would emit
 *
 * ── WHAT A BLANK ROW IS FOR ──────────────────────────────────────────────────────
 *
 * A string with no wordlist row is INVISIBLE. It is not in the spreadsheet, so it is not in
 * anyone's queue, and the only thing that knows it exists is a scanner nobody runs daily. A row
 * with an empty LSD cell is the opposite: it sits in the file the wordlist owner already works
 * in, in the same list as everything else, obviously unfinished.
 *
 * Nothing here authors a translation. Every LSD cell this emits is empty and always will be —
 * the point of the exercise is to make the gap visible to the person who fills it, not to guess.
 *
 * ── WHY IT GOES THROUGH THE DEV SERVER ───────────────────────────────────────────
 *
 * The workbook is built by the `/__lsd/patch.xlsx` handler in vite.config.ts, and this script
 * drives that handler rather than re-implementing it. Two implementations of "what shape is a
 * patch row" is one implementation too many; the one in the plugin already carries the rails
 * (never overwrite an existing row's LSD value, never emit more rows than were staged) and it
 * is the one the dictionary editor's own Export button uses.
 *
 * The queue file it reads, `wordlist-overrides.json`, is written here and DELETED before this
 * script exits — a staged queue makes `vite build` fail by design, and leaving one behind would
 * break the build for a reason that has nothing to do with the build.
 *
 * ── WHERE THE LIST COMES FROM ────────────────────────────────────────────────────
 *
 * Two sources, unioned, because neither is sufficient:
 *
 *   artifacts/audit/routes-final.json   what a walk of every route actually PAINTED in LSD.
 *                                       Misses anything behind a state the walk never entered.
 *   scripts/check-lsd-coverage.mjs      the build gate's NO_ROW list, read from source. Sees
 *                                       unreachable states, cannot know what renders.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OVERRIDES = resolve(ROOT, 'wordlist-overrides.json')
const SCAN = resolve(ROOT, 'artifacts/audit/routes-final.json')
const OUT = resolve(ROOT, 'artifacts/audit/wordlist-patch.xlsx')
const LIST_ONLY = process.argv.includes('--list')

if (existsSync(OVERRIDES)) {
  console.error('wordlist-overrides.json already exists — refusing to clobber a queue someone is')
  console.error('part-way through. Export or clear it in the dictionary editor first.')
  process.exit(1)
}

// ── 1. what the route walk saw ──
const fromScan = new Map()
if (existsSync(SCAN)) {
  const scan = JSON.parse(readFileSync(SCAN, 'utf8'))
  for (const r of scan.routes) {
    for (const s of r.strings) {
      if (s.detail === 'C') fromScan.set(s.text, (fromScan.get(s.text) ?? new Set()).add(r.route))
    }
  }
} else {
  console.error(`no ${SCAN.replace(ROOT, '.')} — run scripts/scan-routes.mjs first`)
  process.exit(1)
}

// ── 2. what the build gate blocks on ──
const gate = spawnSync('node', [resolve(ROOT, 'scripts/check-lsd-coverage.mjs')], { cwd: ROOT, encoding: 'utf8' })
// The gate prints its FAILURES on stderr and only its summary on stdout, so both are read. An
// earlier version read stdout alone and silently found nothing, which looks exactly like "the
// gate is clean" — the failure mode this whole script exists to avoid.
const gateText = [gate.stdout ?? '', gate.stderr ?? ''].join('\n')
const fromGate = new Set(
  [...gateText.matchAll(/\[NO_ROW\][^"]*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
)
if (gate.status !== 0 && fromGate.size === 0 && /NO_ROW/.test(gateText)) {
  console.error('the gate reported NO_ROW entries but none could be parsed — refusing to emit a')
  console.error('patch that would silently be missing them')
  process.exit(1)
}

const keys = [...new Set([...fromScan.keys(), ...fromGate])].sort()
console.log(`class C on screen (route walk) : ${fromScan.size}`)
console.log(`NO_ROW from the build gate      : ${fromGate.size}`)
console.log(`union to emit                   : ${keys.length}`)

if (LIST_ONLY) {
  for (const k of keys) {
    const where = fromScan.has(k) ? [...fromScan.get(k)].sort().join(' ') : '(source only)'
    console.log(`  ${JSON.stringify(k)}\n      ${where}`)
  }
  process.exit(0)
}

// ── 3. stage them as blank-row requests and let the plugin build the workbook ──
const at = new Date().toISOString()
writeFileSync(OVERRIDES, `${JSON.stringify(
  Object.fromEntries(keys.map((k) => [k, { lsd: '', at, newRow: true }])), null, 2,
)}\n`)

let server
try {
  const PORT = await new Promise((ok) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => { const pt = s.address().port; s.close(() => ok(pt)) })
  })
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('dev server did not start')), 60_000)
    const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 1200) } }
    server.stdout.on('data', w); server.stderr.on('data', w)
    server.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
  })

  const res = await fetch(`http://localhost:${PORT}/__lsd/patch.xlsx`)
  if (!res.ok) throw new Error(`patch endpoint returned ${res.status}: ${await res.text()}`)
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, buf)
  console.log(`\nwrote ${OUT.replace(ROOT, '.')} (${buf.length} bytes)`)
  console.log('Every LSD cell in it is empty. Paste the rows into the wordlist, fill them there,')
  console.log('and run `npm run build:lsd`.')
} finally {
  server?.kill()
  // Always — a staged queue fails `vite build` on purpose, and this script did not stage it on
  // anyone's behalf.
  if (existsSync(OVERRIDES)) unlinkSync(OVERRIDES)
}
