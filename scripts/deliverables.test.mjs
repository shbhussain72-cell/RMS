/**
 * deliverables.test.mjs — no script may delete a path containing a deliverable.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────────────
 *
 * `shoot.mjs` used to open by recursively clearing its whole output directory. The wordlist
 * owner's 104-row translation patch was sitting in that directory, because "audit output" was
 * where every other report went. Taking screenshots deleted the one file in the repo that no
 * rerun can reconstruct, and the run printed its usual success line afterwards. Nothing in the
 * output said a deliverable was gone.
 *
 * The fix to that script was to scope the delete to its own per-language subdirectories. That
 * is correct and it protects nothing else: the next script to want a clean output directory
 * starts from the same reasonable-looking premise. So the invariant is asserted here, over
 * every script at once, from the paths declared in `deliverables.json`.
 *
 * ── HOW ──────────────────────────────────────────────────────────────────────────────
 *
 * Static. Every destructive `fs` call in a script has its first argument resolved as far as
 * it can be — string literals, `resolve()`/`join()`, `import.meta.url`-relative bases, and
 * single-file `const` bindings — into repo-relative segments. An expression that cannot be
 * resolved becomes `*`, a segment that matches anything, so an UNANALYSABLE delete fails
 * rather than passes. That direction matters: a guard whose blind spots are silent is the
 * thing it was written against.
 *
 * A call fails when its path and a deliverable are prefixes of one another — deleting the
 * file, or any directory it lives in.
 *
 * There is deliberately no exception list. If a script genuinely needs to delete near a
 * deliverable, the fix is to narrow the path until this passes, which is the fix `shoot.mjs`
 * needed.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => relative(ROOT, p).split(sep).join('/')
const BACKSLASH = String.fromCharCode(92)
const NEWLINE = String.fromCharCode(10)

const declared = JSON.parse(readFileSync(resolve(ROOT, 'scripts/deliverables.json'), 'utf8'))
const segsOfPath = (p) => p.replace(/\/$/, '').split('/')
const DELIVERABLES = declared.paths.map((p) => ({ path: p, segs: segsOfPath(p) }))
const NEVER_OVERWRITE = declared.neverOverwrite.map((d) => ({ ...d, segs: segsOfPath(d.path) }))
const MAY_OVERWRITE = new Set(declared.mayOverwrite.map((m) => m.module))

// ── which files count as "a script" ──────────────────────────────────────────────────
// Anything that can run and delete: the scripts directory, plus the config files that carry
// plugin code. Not src/ — the app has no filesystem access.
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(mjs|cjs|js|ts)$/.test(p)) out.push(p)
  }
  return out
}
const FILES = [
  ...walk(resolve(ROOT, 'scripts')),
  ...['vite.config.ts', 'vitest.config.ts'].map((f) => resolve(ROOT, f)).filter(existsSync),
]

// ── the destructive calls we look for ────────────────────────────────────────────────
const DESTRUCTIVE = /(?:^|[^\w.])(?:fs\.|fsp\.|promises\.|await\s+)?(rmSync|rmdirSync|unlinkSync|rm|rmdir|unlink)\s*\(/g

/**
 * A WHOLE-FILE WRITE is destructive too, and it is how a deliverable was actually lost.
 *
 * The guard above reads DELETES. It did not catch `emit-blank-rows.mjs`, which built a fresh
 * workbook and wrote it over docs/wordlist-patch.xlsx: nothing was unlinked, 91 authored
 * translations were gone, and the run printed its usual success line.
 *
 * `renameSync`/`copyFileSync`/`cpSync` are here for the same reason — each replaces a
 * destination whole — and `XLSX.writeFile`, which is how the one deliverable that is a
 * spreadsheet gets written and would otherwise be the blind spot that matters most.
 *
 * See `overwriteNote` in deliverables.json for why this guard is narrower than the delete one,
 * and for the gap that narrowing leaves.
 */
const OVERWRITE = /(?:^|[^\w.])(?:fs\.|fsp\.|promises\.|XLSX\.|await\s+)?(writeFileSync|writeFile|copyFileSync|cpSync|renameSync|createWriteStream)\s*\(/g

/**
 * Blank out comments, keeping every byte position and every line break.
 *
 * Without this the guard reports itself: the prose in these files describes destructive calls
 * while explaining why they were wrong, and a matcher that reads comments cannot tell that
 * from a real call site.
 *
 * Regex literals have to be skipped as a unit, not scanned. `/path="([^"]+)"/g` in shoot.mjs
 * holds THREE double quotes; reading them as string delimiters leaves the tokeniser stuck
 * inside a string for the remaining 400 lines, which stops blanking comments — and the first
 * symptom is this file reporting a comment as a live call site.
 */
function stripComments(src) {
  let out = ''
  let i = 0
  let quote = null
  // A `/` starts a regex when the last meaningful character cannot end an expression.
  const REGEX_OK = /[([{,;:=!&|?+\-*%~^<>]$|\b(return|typeof|case|in|of|new|do|else)$/
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (quote) {
      out += c
      if (c === BACKSLASH) { out += next ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i++; continue }
    if (c === '/' && next !== '/' && next !== '*' && REGEX_OK.test(out.trimEnd())) {
      let j = i + 1
      let inClass = false
      for (; j < src.length; j++) {
        const r = src[j]
        if (r === BACKSLASH) { j++; continue }
        if (r === NEWLINE) break            // not a regex after all; bail rather than eat the file
        if (r === '[') inClass = true
        else if (r === ']') inClass = false
        else if (r === '/' && !inClass) break
      }
      if (src[j] === '/') { out += src.slice(i, j + 1); i = j + 1; continue }
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== NEWLINE) { out += ' '; i++ }
      continue
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      for (; i < stop; i++) out += src[i] === NEWLINE ? NEWLINE : ' '
      continue
    }
    out += c
    i++
  }
  return out
}

/** Source text of the first argument of a call whose `(` is at `open`. */
function firstArg(src, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === BACKSLASH) { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(' || c === '[' || c === '{') { depth++; continue }
    if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
      continue
    }
    if (c === ',' && depth === 1) return src.slice(open + 1, i)
  }
  return null
}

/** `const NAME = <expr>` bindings in one file, for a few levels of indirection. */
function constsOf(src) {
  const out = new Map()
  const decl = new RegExp(
    `(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=${BACKSLASH}n]+)?=\\s*([^${BACKSLASH}n]+?)\\s*$`,
    'gm',
  )
  for (const m of src.matchAll(decl)) {
    if (!out.has(m[1])) out.set(m[1], m[2].replace(/;$/, ''))
  }
  return out
}

/** Split an argument list on top-level commas. */
function splitArgs(src) {
  const out = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === BACKSLASH) { i++; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) { out.push(src.slice(start, i)); start = i + 1 }
  }
  out.push(src.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

/** Collapse `.` and `..`, so `<scripts>/..` is the repo root and not a literal segment. */
function normalise(segs) {
  const out = []
  for (const s of segs) {
    if (!s || s === '.') continue
    if (s === '..') { out.pop(); continue }
    out.push(s)
  }
  return out
}

const STRING_LITERAL = new RegExp(`^(['"])((?:${BACKSLASH}${BACKSLASH}.|(?!${BACKSLASH}1).)*)${BACKSLASH}1$`)
const PATH_JOINER = /^(?:\w+\.)?(\w*(?:resolve|join)\w*)\s*\(([\s\S]*)\)$/i
const DIRNAME = /^(?:\w+\.)?dirname\s*\(([\s\S]*)\)$/
const FILE_BASE = /import\.meta\.url|__dirname|__filename/

/**
 * Repo-relative segments of a path expression.
 *
 * Anything the resolver cannot read becomes `*`, a segment matching anything — so an
 * UNANALYSABLE delete is reported rather than waved through. A guard that fails open is
 * indistinguishable from no guard on exactly the day it matters.
 */
function segsOf(expr, consts, fileDirSegs, depth = 0) {
  const e = String(expr).trim()
  if (depth > 6) return ['*']

  const lit = STRING_LITERAL.exec(e)
  if (lit) return normalise(lit[2].split('/'))

  const joiner = PATH_JOINER.exec(e)
  if (joiner) {
    const segs = []
    for (const p of splitArgs(joiner[2])) segs.push(...segsOf(p, consts, fileDirSegs, depth + 1))
    return normalise(segs)
  }

  const dir = DIRNAME.exec(e)
  if (dir) return normalise([...segsOf(dir[1], consts, fileDirSegs, depth + 1), '..'])

  // Every spelling of "the directory this file is in", once the wrappers above are peeled off.
  // `fileURLToPath(import.meta.url)` is the FILE, but it is only ever used as a base to resolve
  // against, and treating it as the directory keeps the arithmetic in `dirname()` above honest.
  if (FILE_BASE.test(e)) return [...fileDirSegs]
  if (/^process\.cwd\(\)$/.test(e)) return []

  if (/^[A-Za-z_$][\w$]*$/.test(e)) {
    if (consts.has(e)) return segsOf(consts.get(e), consts, fileDirSegs, depth + 1)
    return ['*']
  }

  // Template literal, ternary, unknown call — opaque.
  return ['*']
}

/** True when `a` and `b` are prefixes of one another, `*` matching any single segment. */
function overlaps(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== '*' && b[i] !== '*' && a[i] !== b[i]) return false
  }
  return true
}

/** Every call site matching `pattern` in the repo's scripts, with its resolved path. */
function callSites(pattern = DESTRUCTIVE) {
  const sites = []
  for (const file of FILES) {
    const src = stripComments(readFileSync(file, 'utf8'))
    const consts = constsOf(src)
    // For a script at scripts/x.mjs this is ['scripts']; for vite.config.ts it is [].
    const fileDirSegs = normalise(rel(dirname(file)).split('/'))
    for (const m of src.matchAll(pattern)) {
      const open = src.indexOf('(', m.index + m[0].length - 1)
      const arg = firstArg(src, open)
      if (arg === null) continue
      const line = src.slice(0, m.index).split(NEWLINE).length
      sites.push({ file: rel(file), line, fn: m[1], arg: arg.trim(), segs: segsOf(arg, consts, fileDirSegs) })
    }
  }
  return sites
}

describe('deliverables', () => {
  it('every declared deliverable exists', () => {
    // A guard pointed at a renamed file protects nothing while still reporting green.
    const missing = DELIVERABLES.filter((d) => !existsSync(resolve(ROOT, d.path)))
    expect(missing.map((d) => d.path)).toEqual([])
  })

  it('no script deletes a path containing a deliverable', () => {
    const sites = callSites()
    // If this ever finds nothing, the matcher has stopped matching — which also reads as green.
    expect(sites.length).toBeGreaterThan(0)

    const violations = []
    for (const s of sites) {
      for (const d of DELIVERABLES) {
        if (!overlaps(s.segs, d.segs)) continue
        violations.push(
          `${s.file}:${s.line}  ${s.fn}(${s.arg})  →  ${s.segs.join('/') || '<repo root>'}  ` +
          `contains or is the deliverable ${d.path}`,
        )
      }
    }
    expect(violations).toEqual([])
  })

  it('every path in neverOverwrite exists, and every exempted module exists', () => {
    // A guard pointed at a renamed file protects nothing while still reporting green — and an
    // exemption for a module that is gone is an exemption held open for whatever takes its name.
    expect(NEVER_OVERWRITE.filter((d) => !existsSync(resolve(ROOT, d.path))).map((d) => d.path)).toEqual([])
    expect([...MAY_OVERWRITE].filter((m) => !existsSync(resolve(ROOT, m)))).toEqual([])
  })

  it('every exemption says what it verifies', () => {
    // The reason is the whole rail: an exemption is granted for re-reading and checking, not for
    // being inconvenient to fix. An empty `why` is an exemption nobody argued for.
    const thin = declared.mayOverwrite.filter((m) => (m.why ?? '').length < 80).map((m) => m.module)
    expect(thin).toEqual([])
  })

  it('no script overwrites a file whose content a human typed', () => {
    const sites = callSites(OVERWRITE)
    // If this ever finds nothing, the matcher has stopped matching — which also reads as green.
    expect(sites.length).toBeGreaterThan(0)

    const violations = []
    for (const s of sites) {
      if (MAY_OVERWRITE.has(s.file)) continue
      // Fully resolved only. Unlike a delete, an unanalysable WRITE target is the common case —
      // every codemod writes `file` inside a loop — and reporting those would bury the real
      // ones until someone deleted the guard. The cost of that choice is in deliverables.json.
      if (s.segs.includes('*')) continue
      for (const d of NEVER_OVERWRITE) {
        if (!overlaps(s.segs, d.segs)) continue
        violations.push(
          `${s.file}:${s.line}  ${s.fn}(${s.arg})  →  ${s.segs.join('/')}  overwrites ${d.path}. ` +
          `${d.why} Read it, merge, then re-read and verify — see scripts/lib/patch-merge.mjs — ` +
          `or add the module to mayOverwrite in deliverables.json with what it checks.`,
        )
      }
    }
    expect(violations).toEqual([])
  })

  it('the overwrite matcher can actually see a clobber', () => {
    // The inverted assertion. Every check above passes against a matcher that stopped matching,
    // so this asserts the one call site the guard exists for is still visible to it — and that
    // it is visible BECAUSE it is exempted, not because it went unnoticed.
    const seen = callSites(OVERWRITE).filter((s) => MAY_OVERWRITE.has(s.file))
    expect(seen.length).toBeGreaterThan(0)
    const targets = new Set(seen.map((s) => s.segs.join('/')))
    expect([...targets].some((t) => t.endsWith('.xlsx') || t.includes('*'))).toBe(true)
  })

  it('no script shells out to a recursive delete of a deliverable', () => {
    // The static resolver only reads fs calls. `rm -rf` inside a spawn() lands here instead.
    const hits = []
    for (const file of FILES) {
      stripComments(readFileSync(file, 'utf8')).split(NEWLINE).forEach((ln, i) => {
        if (!/\brm\s+-[rf]|rimraf|Remove-Item|\bdel\s+\/|rmdir\s+\/s/i.test(ln)) return
        for (const d of DELIVERABLES) {
          if (ln.includes(d.segs[0])) hits.push(`${rel(file)}:${i + 1}  ${ln.trim()}`)
        }
      })
    }
    expect(hits).toEqual([])
  })
})
