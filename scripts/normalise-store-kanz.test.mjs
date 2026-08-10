/**
 * The migration's decision, tested without a store.
 *
 * The script itself needs a reachable deployment; this is the part that decides WHAT it would
 * rewrite, which is the part that can be wrong quietly.
 */
import { describe, expect, it } from 'vitest'
import { doubledHeads } from './normalise-store-kanz.mjs'

const rev = (key, value) => ({ key, value, revisionId: `r-${key}`, author: 'Z' })

describe('doubledHeads', () => {
  it('selects a value holding Kanz doubles, and says what it becomes', () => {
    const [hit] = doubledHeads([rev('Register now', 'كك')])
    expect(hit.from).toBe('كك')
    expect(hit.to).toBe('گ')
    expect(hit.changes).toContain('گ')
  })

  it('leaves a converted value alone — the migration must be idempotent', () => {
    expect(doubledHeads([rev('Register now', 'گ')])).toEqual([])
    // And running it over its own output selects nothing, which is what makes a re-run safe.
    const once = doubledHeads([rev('k', 'مظظمان')])
    expect(doubledHeads([rev('k', once[0].to)])).toEqual([])
  })

  it('ignores a blank-row request, which has no value to convert', () => {
    expect(doubledHeads([rev('k', '')])).toEqual([])
  })

  it('does not touch mojibake, which is a different class and must be refused not repaired', () => {
    const damaged = 'Ø§Ù„Ø±Ø¶Ø§'
    expect(doubledHeads([rev('k', damaged)])).toEqual([])
  })

  it('selects only the doubled ones out of a mixed store', () => {
    const picked = doubledHeads([rev('a', 'گ'), rev('b', 'كك'), rev('c', ''), rev('d', 'مظظمان')])
    expect(picked.map((p) => p.key)).toEqual(['b', 'd'])
  })
})
