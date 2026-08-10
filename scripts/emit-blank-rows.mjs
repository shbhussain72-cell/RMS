/**
 * emit-blank-rows.mjs — the class-C queue, as an .xlsx patch with EMPTY LSD cells.
 *
 *   node scripts/emit-blank-rows.mjs            # write docs/wordlist-patch.xlsx
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
 * ── IT MERGES. IT USED TO REGENERATE, AND THAT WAS A WIPE ────────────────────────
 *
 * This script used to stage the keys as overrides, ask the `/__lsd/patch.xlsx` dev-server
 * handler for a workbook, and write those bytes over docs/wordlist-patch.xlsx. The handler emits
 * every LSD cell EMPTY — correct for what it is, the dictionary editor's Export button, which
 * hands back only the rows you staged.
 *
 * Written over a file the wordlist owner has been typing into, it is a wipe. When this was
 * found the patch held 91 authored translations and the sanctioned command for adding one row
 * to it would have destroyed all 91, then printed `wrote ./docs/wordlist-patch.xlsx` and exited
 * 0. Nothing in the output said anything was gone. The comment that used to sit here argued the
 * design was right because it avoided a second implementation of the row shape, which was true
 * and beside the point.
 *
 * It now reads the file, merges the missing keys in as blank rows, and keeps the write only if
 * it can prove — against the file on disk, re-read after writing — that no row was dropped, no
 * existing LSD value changed, and every row it added is blank. Any of those failing restores
 * the original bytes. That lives in `scripts/lib/patch-merge.mjs` and is unit-tested there,
 * including the case where the merge IS destructive, so the checker is known to fire.
 *
 * The dev server is gone with it: it existed only to shape three columns, and a spawn plus a
 * staged `wordlist-overrides.json` (which fails `vite build` by design if a crash leaves one
 * behind) is a lot of machinery to produce `['', key, '']`.
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
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeIntoPatch } from './lib/patch-merge.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN = resolve(ROOT, 'artifacts/audit/routes-final.json')
// docs/, NOT artifacts/. The patch is a DELIVERABLE — it is the wordlist owner's queue and the
// one output here that no rerun can reconstruct once the translations are typed into it. It used
// to live in artifacts/audit/, which is a directory scripts delete; `shoot.mjs` opened with
// `rmSync(artifacts/audit)` and taking screenshots silently destroyed it. `deliverables.test.mjs`
// asserts that no script can delete a path containing this file — or, since the wipe described
// above, overwrite one either. `scripts/lib/patch-merge.mjs` is its single declared exception.
const OUT = resolve(ROOT, 'docs/wordlist-patch.xlsx')
const LIST_ONLY = process.argv.includes('--list')

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

// ── 3. merge them in as blank rows ──
//
// A run with nothing to add says so and writes nothing. "0 rows added" and "the sources
// returned nothing" are different facts and the first one alone reads as success.
if (!keys.length) {
  console.log('\nnothing to add — both sources came back empty.')
  console.log('that is either a finished queue or a broken scan; check the two counts above.')
  process.exit(0)
}

const wordlist = JSON.parse(readFileSync(resolve(ROOT, 'src/i18n/lsd.json'), 'utf8'))
const r = mergeIntoPatch(OUT, keys, wordlist)

console.log(`\n${OUT.replace(ROOT, '.')}: ${r.rowsBefore} -> ${r.rowsAfter} rows (+${r.added.length})`)
console.log(`  ${r.filled} translated, ${r.blank} awaiting translation`)
if (r.alreadyPresent.length) console.log(`  ${r.alreadyPresent.length} already in the file, left untouched`)
if (r.inWordlist.length) {
  console.log(`  ${r.inWordlist.length} skipped — the wordlist already has them, so a blank row`)
  console.log('    would overwrite a real translation on paste. Usually a stale routes-final.json:')
  for (const k of r.inWordlist) console.log(`      ${JSON.stringify(k)}`)
}
for (const k of r.added) console.log(`  + ${JSON.stringify(k)}`)
console.log('\nEvery row this ADDED has an empty LSD cell, and nothing already in the file was')
console.log('changed. Paste the new rows into the wordlist, fill them there, and run')
console.log('`npm run build:lsd`.')
