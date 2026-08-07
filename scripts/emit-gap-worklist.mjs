/**
 * emit-gap-worklist.mjs — append the class-C worklist to docs/lsd-gaps.md.
 *
 *   node scripts/emit-gap-worklist.mjs
 *
 * The audit script reports on rows that EXIST in the wordlist. This reports the opposite
 * gap: strings the app renders that have no row at all, so the owner can add them. The two
 * halves live in one document because the owner should not have to know which tool produced
 * which section.
 *
 * Written into a marker block so re-running is idempotent and `audit-lsd.mjs --write`
 * (which rewrites the rest of the file) cannot clobber it.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = resolve(ROOT, 'docs/lsd-gaps.md')

const sweep = JSON.parse(
  execFileSync('node', [resolve(ROOT, 'scripts/static-sweep.mjs'), '--json'], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  }),
)

const rendered = sweep.hits.filter((h) => h.kind !== 'data')
const classC = rendered.filter((h) => h.cls === 'C').sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : 1))
const dataC = sweep.hits.filter((h) => h.kind === 'data' && h.cls === 'C')
const dataA = sweep.hits.filter((h) => h.kind === 'data' && h.cls === 'A')

const esc = (s) => String(s).replace(/\|/g, '\\|')
const clip = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const lines = [
  '<!-- WORKLIST_START -->',
  '',
  `## 6. Strings with no wordlist row (${classC.length})`,
  '',
  '**This is the list to translate.** Each of these is rendered on screen and has no row in',
  'the wordlist at all, so the app falls back to English. Add a row for each and the string',
  'starts working with no code change.',
  '',
  'Counted once per distinct string. `Seen` is how many places in the code render it — a high',
  'number means the string appears all over the app, so it is worth doing first.',
  '',
  '| Seen | English string | First occurrence |',
  '|---:|---|---|',
  ...classC.map((h) => `| ${h.count} | ${esc(clip(h.text))} | \`${esc(h.sites[0])}\` |`),
  '',
  `## 7. Data constants that reach the UI indirectly (${dataA.length + dataC.length})`,
  '',
  'These are English strings held in lookup tables and config arrays rather than written',
  'directly into a screen — country names, status labels, option lists. They **do** appear on',
  'screen, but through a render site somewhere else.',
  '',
  'They are listed separately because they cannot be wired mechanically: wrapping the value in',
  'a lookup table would translate the key the table is searched by and break the lookup. Each',
  'needs a person to find the place it is displayed and wrap it there.',
  '',
  `- **${dataA.length}** already have a correct translation waiting in the wordlist (no owner action needed — developer work).`,
  `- **${dataC.length}** have no row yet and are included in the translation ask below.`,
  '',
  '| Seen | English string | Defined at | Wordlist |',
  '|---:|---|---|---|',
  ...[...dataA, ...dataC]
    .sort((a, b) => b.count - a.count || (a.text < b.text ? -1 : 1))
    .slice(0, 120)
    .map((h) => `| ${h.count} | ${esc(clip(h.text, 70))} | \`${esc(h.sites[0])}\` | ${h.cls === 'A' ? 'has translation' : '**needs one**'} |`),
  '',
  ...(dataA.length + dataC.length > 120 ? ['_Truncated to the 120 most-used; run `node scripts/static-sweep.mjs --json` for the rest._', ''] : []),
  '<!-- WORKLIST_END -->',
]

const block = lines.join('\n')
let md = readFileSync(DOC, 'utf8')
md = /<!-- WORKLIST_START -->[\s\S]*<!-- WORKLIST_END -->/.test(md)
  ? md.replace(/<!-- WORKLIST_START -->[\s\S]*<!-- WORKLIST_END -->/, block)
  : `${md.trimEnd()}\n\n${block}\n`
writeFileSync(DOC, md, 'utf8')

console.log(`class C (rendered, no row) : ${classC.length}`)
console.log(`data constants             : ${dataA.length + dataC.length} (${dataA.length} translated, ${dataC.length} not)`)
console.log('patched docs/lsd-gaps.md')
