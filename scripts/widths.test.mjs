/**
 * widths.test.mjs — no script writes its own viewport list.
 *
 * `shoot.mjs` and `check-layout.mjs` each carried an independent
 * `[390, 768, 1024, 1440]`. They agreed with each other and disagreed with the runbook, so
 * 1150 went unmeasured for four sessions while both scripts reported complete runs against
 * their own lists. Nothing could have caught that except comparing the two literals by hand.
 *
 * So the literals are banned. A width array now comes from `widths.mjs` or the test fails,
 * which turns "these two agree" from something a reader has to verify into something that
 * cannot be otherwise.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_WIDTHS, NARROW_WIDTHS } from './widths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/** Any array literal of two or more bare numbers. */
const NUMBER_ARRAY = /\[\s*\d{2,4}\s*(?:,\s*\d{2,4}\s*){1,8}\]/g

const files = readdirSync(HERE)
  .filter((f) => /\.(mjs|cjs)$/.test(f) && f !== 'widths.mjs' && !f.endsWith('.test.mjs'))
  .map((f) => join(HERE, f))

describe('viewport widths', () => {
  it('is one list, not several', () => {
    expect(CANONICAL_WIDTHS).toEqual([390, 768, 1024, 1150, 1440])
    expect(NARROW_WIDTHS.every((w) => CANONICAL_WIDTHS.includes(w))).toBe(true)
  })

  it('no script defines its own width array', () => {
    const offenders = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(NUMBER_ARRAY)) {
        const nums = m[0].match(/\d+/g).map(Number)
        // A width list is one that mentions the phone width and at least one desktop width.
        // Other numeric arrays in these scripts (timeouts, sizes, tolerances) do not.
        if (!nums.includes(390)) continue
        if (!nums.some((n) => n >= 1024)) continue
        const line = src.slice(0, m.index).split(String.fromCharCode(10)).length
        offenders.push(`scripts/${file.split(/[\\/]/).pop()}:${line}  ${m[0]}  — import from widths.mjs instead`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('every script that sweeps widths imports the shared list', () => {
    // The other half of the rule: banning the literal is useless if a script simply stops
    // having a width list and silently sweeps one size. Scoped to scripts that actually LOOP
    // over widths — a probe that deliberately measures at one size is not in scope, and failing
    // it would be a rule nobody could satisfy without adding a sweep that does nothing.
    const sweeps = files.filter((f) => /for \(const width of|const WIDTHS =/.test(readFileSync(f, 'utf8')))
    const missing = sweeps.filter((f) => !/from '\.\/widths\.mjs'/.test(readFileSync(f, 'utf8')))
      .map((f) => `scripts/${f.split(/[\\/]/).pop()}`)
    expect(missing).toEqual([])
  })
})
