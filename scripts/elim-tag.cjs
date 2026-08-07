/**
 * elim-tag.cjs — add/remove a temporary `data-elim="N"` marker on every CENTRING site.
 *
 *   node scripts/elim-tag.cjs --add
 *   node scripts/elim-tag.cjs --strip
 *
 * The elimination pass replaces one direction-independent centring mechanism with another,
 * so "correct" means the element lands on exactly the same pixels. Class strings change as
 * part of the edit, so they cannot key a before/after comparison — a stable marker can.
 * Ids are assigned from the census order and stay attached across the edit.
 */
const fs = require('fs')
const path = require('path')
const { census } = require('./centring-census.cjs')

const ADD = process.argv.includes('--add')
const ROOT = path.resolve(__dirname, '..')

if (process.argv.includes('--strip')) {
  let n = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx$/.test(p)) {
        const src = fs.readFileSync(p, 'utf8')
        // Consume TRAILING whitespace, never leading: the marker is inserted immediately
        // before `className`, so eating what precedes it swallows the newline and indent of a
        // multi-line JSX attribute and silently reformats the file. Round-tripping a
        // measurement marker must leave the source byte-identical.
        const out = src.replace(/data-elim="\d+"\s*/g, '')
        if (out !== src) { fs.writeFileSync(p, out); n++ }
      }
    }
  }
  walk(path.join(ROOT, 'src'))
  console.log(`stripped markers from ${n} file(s)`)
  process.exit(0)
}

if (!ADD) { console.error('pass --add or --strip'); process.exit(1) }

const rows = census().filter((r) => r.kind === 'CENTRING')
// Group by file and apply by DESCENDING offset so earlier insertions do not shift later ones.
const byFile = {}
rows.forEach((r, i) => { (byFile[r.f] = byFile[r.f] || []).push({ ...r, elim: i }) })

let added = 0
for (const [file, list] of Object.entries(byFile)) {
  const abs = path.join(ROOT, file)
  let src = fs.readFileSync(abs, 'utf8')
  const edits = []
  for (const r of list) {
    // Find the className occurrence whose captured value equals this row's class string.
    const re = /\w*[cC]lassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g
    let m
    while ((m = re.exec(src))) {
      const cls = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
      if (cls === r.cls) { edits.push({ at: m.index, elim: r.elim }); break }
    }
  }
  edits.sort((a, b) => b.at - a.at)
  for (const e of edits) {
    src = `${src.slice(0, e.at)}data-elim="${e.elim}" ${src.slice(e.at)}`
    added++
  }
  fs.writeFileSync(abs, src)
}
console.log(`tagged ${added} of ${rows.length} centring sites`)
