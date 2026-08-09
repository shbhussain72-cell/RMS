/**
 * Static source sweeps — invariants that are cheap to state and expensive to rediscover.
 *
 * These complement the DOM scanner rather than duplicating it. The scanner only sees what a
 * route actually PAINTED, so anything behind an unvisited state (an error banner, an empty
 * list, a modal, a "Full" capacity pill) is invisible to it. A static sweep sees the literal
 * regardless of whether the state was reachable in a headless run.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const NEWLINE = String.fromCharCode(10)
const rel = (p) => relative(ROOT, p).split(sep).join('/')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/** UI source only. src/data/* holds the seed strings these formatters CONSUME. */
const uiFiles = walk(resolve(ROOT, 'src')).filter((p) => {
  const name = rel(p)
  return !name.startsWith('src/data/') && name !== 'src/components/Bidi.tsx' && name !== 'src/components/DateLine.tsx'
})

describe('no hard-coded clock times in UI source', () => {
  /**
   * A literal like `09:00 AM IST` sitting in JSX is a bidi bug waiting to happen: in an RTL
   * paragraph the digits and the meridiem reorder into `AM IST ٠٩:٠٠`. `TimeLine`/`formatTime`
   * exist so the time is always one LTR isolate, and a raw literal bypasses them.
   *
   * Allowed: the string passed TO a formatter (`<TimeLine value="09:00 AM IST" />`), a string
   * routed through the dictionary (`tx('…2:00 PM today.')`), and prose in comments.
   */
  const TIME = /\b\d{1,2}:\d{2}\s*(?:AM|PM|Am|Pm|am|pm)\b/
  /**
   * Allowed contexts, in order: the string handed TO a formatter; a string routed through the
   * dictionary; a comment; and a bare catalogue entry — a line that is nothing but a quoted
   * string, as in the GUIDELINES_RULES array, whose members are passed to `tx()` at render.
   */
  const ALLOWED = [
    /(?:TimeLine|DateLine)\s+value=/,
    /\bt[dx]?\(\s*['"`]/,
    /^\s*(?:\*|\/\/)/,
    /^\s*['"`].*['"`],?\s*$/,
  ]

  it('routes every time through TimeLine, a formatter, or the dictionary', () => {
    const offenders = []
    for (const file of uiFiles) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (TIME.test(line) && !ALLOWED.some((re) => re.test(line))) {
          offenders.push(`${rel(file)}:${i + 1}  ${line.trim().slice(0, 90)}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('no LSD translations hard-coded in UI source', () => {
  /**
   * English mode must contain zero LSD text nodes. The way to guarantee that is for LSD copy
   * to live ONLY in the dictionary, where the language check gates it — never inline in a
   * screen, where nothing does.
   *
   * Three kinds of Arabic script are legitimate and are allowed by name below. The allowlist
   * is deliberately explicit rather than a pattern: "some Arabic is fine" is how a leaked
   * translation hides, so each exemption has to be argued for individually.
   */
  const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/

  /** Arabic that is NOT a translation and is shown identically in both languages. */
  const INTENTIONAL = [
    // Qur'anic inscription on the hero cards — scripture, rendered in Arabic for every user.
    '\u0648\u064e\u0627\u0639\u0652\u062a\u064e\u0635\u0650\u0645\u064f\u0648\u0627',
    // U+06DE ARABIC START OF RUB EL HIZB — a decorative divider glyph, not text.
    '\u06de',
  ]

  /** Files whose Arabic content is the feature, not a leak. */
  const EXEMPT_FILES = new Set([
    'src/i18n/hijri.ts',   // the Hijri month-name table
    'src/i18n/index.tsx',  // the BIDI_MARKS character class
    'src/i18n/domScan.ts', // the scanner's own Arabic character class
  ])

  const COMMENT = /^\s*(?:\*|\/\/)/

  it('keeps LSD copy in the dictionary, not in screens', () => {
    const offenders = []
    for (const file of uiFiles) {
      const name = rel(file)
      if (EXEMPT_FILES.has(name)) continue
      readFileSync(file, 'utf8').split(NEWLINE).forEach((line, i) => {
        if (!ARABIC.test(line)) return
        if (COMMENT.test(line)) return
        if (INTENTIONAL.some((frag) => line.includes(frag))) return
        offenders.push(`${name}:${i + 1}  ${line.trim().slice(0, 90)}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('directional CSS', () => {
  /**
   * The bug class this makes un-reintroducible.
   *
   * `left-<x>` + `-translate-x-1/2` is the CENTRING idiom: the offset puts one edge at the
   * midpoint, the translate pulls the element back by half its own width. It is
   * direction-INDEPENDENT — the same visual result is wanted in both languages — so the
   * physical property is correct there.
   *
   * Rewriting the offset to `start-` while leaving the translate physical produces
   * `right: 50%` under RTL with a translate that still moves LEFT, so the element lands
   * off-centre by its own width. A logical-properties codemod did this to four sites; the
   * fix was reverted, the codemod re-broke the same four, and only then did it stay fixed.
   * A comment would not have caught the second occurrence. This does.
   */
  /**
   * All FOUR className forms, matching scripts/centring-census.cjs.
   *
   * This pattern previously matched only `"…"` and `{`…`}`. It missed single-quoted strings
   * and `{expr}` — which is where every conditional class in this codebase lives
   * (`className={active ? 'pl-4' : 'pl-2'}`). A sweep that cannot see conditional classes is
   * blind to most of the interesting ones.
   */
  const CLASS_ATTR = /\w*[cC]lassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{([^}]*)\})/g

  it('never combines a logical inset with a physical translate-x', () => {
    const offenders = []
    for (const file of uiFiles) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(CLASS_ATTR)) {
        const cls = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
        const hasLogicalInset = /(?<![0-9A-Za-z_-])(start|end)-/.test(cls)
        const hasPhysicalTranslateX = /(?<![0-9A-Za-z_-])-?translate-x-/.test(cls)
        if (hasLogicalInset && hasPhysicalTranslateX) {
          const line = src.slice(0, m.index).split(NEWLINE).length
          offenders.push(`${rel(file)}:${line}  ${cls.slice(0, 80)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * Scoped to EVERY UI root, not just `src/screens/`.
   *
   * The Group 4 sweep was specified as `src/screens/`, so this assertion was too — which left
   * `src/components/figma/` (26 files: AppBar, Breadcrumb, StickyFooter, NotificationPanel —
   * most of the app's chrome), `src/components/questionnaire/`, `src/chat/` and `src/tour/`
   * unchecked. Chrome is exactly where directional layout lives, so the narrow scope was
   * excluding the tree that mattered most.
   *
   * The codemod itself always walked all of `src/`, so widening this found zero new
   * offenders — but it was enforcing a fraction of what had been swept, and the next physical
   * utility added to a component would not have been caught.
   */
  it('has no physical margin/padding/text-align utilities anywhere in UI source', () => {
    const offenders = []
    for (const file of uiFiles) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(CLASS_ATTR)) {
        const cls = m[1] ?? m[2] ?? m[3] ?? m[4] ?? ''
        const bad = cls.match(/(?<![0-9A-Za-z_-])(?:-?m[lr]-|p[lr]-|text-(?:left|right))(?![0-9A-Za-z_-]*:)[0-9A-Za-z_[]/g)
        if (bad) {
          const line = src.slice(0, m.index).split(NEWLINE).length
          offenders.push(`${rel(file)}:${line}  ${[...new Set(bad)].join(' ')}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('no unjustified fixed delays in scripts/', () => {
  /**
   * `page.waitForTimeout(n)` is banned unless the line carries a `sleep:` justification.
   *
   * ── WHY A BAN AND NOT A NOTE ───────────────────────────────────────────────────────
   *
   * A fixed delay produced three false findings in a single session:
   *
   *   check-dictionary sampled at 1200ms and reported the dictionary editor MISSING, on a cold
   *   dev server that simply had not finished transforming the panel's modules.
   *
   *   two live-edit probes sampled at 2500ms and reported "no dictionary value is rendered on
   *   this route" — indistinguishable from the real finding they were written to look for.
   *
   *   and then the assertion added to FIX that, in the same session, by the same author, one
   *   step after writing a shared `waitForApp` helper to prevent it, used waitForTimeout(1200)
   *   and failed while the behaviour under test was working correctly.
   *
   * The third one is why this is a test. It is not carelessness — a sleep is the shortest thing
   * to type when you want the page to have caught up, and it passes on the machine you write it
   * on. Documentation does not reach a reflex; a failing build does.
   *
   * ── THE ESCAPE HATCH ───────────────────────────────────────────────────────────────
   *
   * Some sleeps are legitimate. A CSS transition has no completion event Playwright can await;
   * an interval-driven pass has no "done" signal; and in `check-cold-load` waiting for content
   * would BEG THE QUESTION, because whether content arrives is the thing under test.
   *
   * So the rule is not "never sleep", it is "a sleep must say what it is waiting for, in a form
   * a reader can disagree with". Where the answer is "for the thing I am about to assert",
   * that is the bug, and writing the justification is what makes it obvious.
   *
   *     await page.waitForTimeout(150)   // sleep: popover open transition, no event to await
   *
   * A justification that is merely a restatement ("wait for it to be ready") is not one; there
   * is no way to test for that, and it is the reviewer's job. The length floor only stops an
   * empty marker being used to silence the rule.
   */
  // Dot-prefixed names are excluded: `scripts/.tmp-*` is gitignored scratch, not tooling, and a
  // throwaway probe should not have to argue for its sleeps. Anything committed here does.
  const scriptFiles = readdirSync(resolve(ROOT, 'scripts'))
    .filter((n) => !n.startsWith('.'))
    .filter((n) => /\.(mjs|cjs)$/.test(n) && !/\.test\.(mjs|cjs)$/.test(n))
    .map((n) => join(ROOT, 'scripts', n))

  const SLEEP_CALL = /\.waitForTimeout\s*\(/
  const JUSTIFIED = /\/\/\s*sleep:\s*(.{20,})/

  it('finds the scripts to sweep — without this the assertion is vacuous', () => {
    expect(scriptFiles.length).toBeGreaterThan(20)
  })

  it('every waitForTimeout carries a `// sleep: <reason>` justification', () => {
    const offenders = []
    for (const file of scriptFiles) {
      const lines = readFileSync(file, 'utf8').split(NEWLINE)
      lines.forEach((line, i) => {
        if (!SLEEP_CALL.test(line)) return
        // Same line, or the line immediately above — a long reason does not fit beside the call.
        if (JUSTIFIED.test(line) || (i > 0 && JUSTIFIED.test(lines[i - 1]))) return
        offenders.push(`${rel(file)}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders, `a fixed delay must say what it is waiting for:${NEWLINE}${offenders.join(NEWLINE)}`).toEqual([])
  })

  it('the rule can actually fail — a bare waitForTimeout is rejected', () => {
    // Guards the regex itself. A typo in SLEEP_CALL would make the sweep above pass on
    // everything, which is the failure mode this whole file exists to prevent.
    expect(SLEEP_CALL.test('await page.waitForTimeout(150)')).toBe(true)
    expect(JUSTIFIED.test('await page.waitForTimeout(150)')).toBe(false)
    expect(JUSTIFIED.test('await page.waitForTimeout(150) // sleep: too short')).toBe(false)
    expect(JUSTIFIED.test('await page.waitForTimeout(150) // sleep: popover open transition, no event to await')).toBe(true)
  })
})
