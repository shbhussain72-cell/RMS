/**
 * Route the composed "member meta" lines through the lookup.
 *
 *   {member.relation} · {member.gender} · Age {age2(member.age)} · ITS {member.its}
 *
 * These are the most-repeated strings in the app — one under every person, on every
 * screen — and no earlier codemod could touch them: the element has many children, so the
 * "sole text child" rule declined it, and `relation`/`gender` are data read from the
 * store rather than literals.
 *
 * Each translatable TOKEN is wrapped individually, leaving the separators, the numbers
 * and the ITS digits exactly as they are:
 *
 *   {tdText(member.relation)} · {tdText(member.gender)} · {t('Age')} {age2(...)} · {t('ITS')} {...}
 *
 * `tdText`/`t` (string form) rather than `tx` — these sit inside a larger text node, so
 * there is no element to spread dir/lang onto. The surrounding node is already RTL from
 * the document root, and the numeric runs stay LTR via the `[data-numeric]` CSS rule.
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p, out) }
    else if (/\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}

// Order matters: the `${...}` template forms must run before the JSX `{...}` forms,
// otherwise the JSX pattern also matches inside a template literal and double-wraps.
const RULES = [
  // ── template-literal form: `${m.relation} · ${m.gender} · Age ${..} · ITS ${..}` ──
  [/\$\{([a-zA-Z_$][\w.$]*)\.relation\}/g, '${tdText($1.relation)}'],
  [/\$\{([a-zA-Z_$][\w.$]*)\.gender\}/g, '${tdText($1.gender)}'],
  [/(?<![\w'"`>])Age \$\{/g, '${t(\'Age\')} ${'],
  [/(?<![\w'"`>])ITS \$\{/g, '${t(\'ITS\')} ${'],
  // ── JSX form: {m.relation} · {m.gender} · Age {..} · ITS {..} ──
  [/\{([a-zA-Z_$][\w.$]*)\.relation\}/g, '{tdText($1.relation)}'],
  [/\{([a-zA-Z_$][\w.$]*)\.gender\}/g, '{tdText($1.gender)}'],
  [/(?<![\w'"`${])Age \{/g, '{t(\'Age\')} {'],
  [/(?<![\w'"`${])ITS \{/g, '{t(\'ITS\')} {'],
]

let files = 0, edits = 0
for (const file of walk(path.join(ROOT, 'src'))) {
  const src = fs.readFileSync(file, 'utf8')
  let out = src
  let n = 0
  for (const [re, to] of RULES) {
    out = out.replace(re, (m, ...rest) => {
      // Never double-wrap something already routed.
      if (/tdText\(|t\('/.test(m)) return m
      n++
      return to.replace('$1', rest[0])
    })
  }
  if (out === src) continue
  console.log(`${path.relative(ROOT, file).replace(/\\/g, '/')}: ${n}`)
  files++; edits += n
  if (!DRY) fs.writeFileSync(file, out)
}
console.log(`\n${edits} token(s) routed across ${files} file(s)`)
