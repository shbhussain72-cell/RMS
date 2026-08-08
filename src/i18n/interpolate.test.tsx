/**
 * Interpolation and plural selection.
 *
 * The case that matters is WORD ORDER. `{n} spots left` and a translation that puts the number
 * last must both work from the same call site — that is the whole reason these are parameterised
 * keys rather than template strings, and the reason `left 42` reached the screen before.
 */
import { describe, expect, it } from 'vitest'
import { plural } from './index'

describe('plural', () => {
  it('never returns the plural form for one', () => {
    expect(plural(1, '{n} member', '{n} members')).toBe('{n} member')
  })

  it('returns the plural form for zero and for many', () => {
    expect(plural(0, '{n} member', '{n} members')).toBe('{n} members')
    expect(plural(2, '{n} member', '{n} members')).toBe('{n} members')
    expect(plural(11, '{n} member', '{n} members')).toBe('{n} members')
  })

  // The regression. `1 + dependents.length` with no dependents rendered "1 members".
  it('the AddPeople case: one registrant, no dependents', () => {
    const n = 1 + 0
    expect(plural(n, '{n} member', '{n} members')).toBe('{n} member')
  })
})
