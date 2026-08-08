/**
 * Tests for the `rms-tour-seen` accessors.
 *
 * The case that matters is the NON-ARRAY one. A plain try/catch around `JSON.parse` looks like
 * it covers bad input, but the historical failure never threw inside the parse: the harness
 * seeded the string '1', which parses cleanly to the number 1 and escapes typed as string[].
 * The crash happened one line later at the call site — `getSeen().includes(key)` — inside a
 * useEffect, which unmounted the React tree and rendered every walkthrough route blank.
 *
 * So asserting "getSeen never throws" is too weak; it never threw. The assertion that prevents
 * the regression is that the RETURN VALUE is always a real array of strings, because that is
 * what the callers (`.includes`, `new Set(...)`) actually require.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { getSeen, markSeen } from './seen'
import { TOUR_SEEN_KEY } from './steps'

/** Minimal in-memory Storage — the test env is `node`, so there is no real localStorage. */
function installStorage(): Map<string, string> {
  const map = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
  return map
}

let store: Map<string, string>
beforeEach(() => {
  store = installStorage()
})

describe('getSeen', () => {
  it('returns [] when the key is absent', () => {
    expect(getSeen()).toEqual([])
  })

  it('round-trips a normal array', () => {
    store.set(TOUR_SEEN_KEY, JSON.stringify(['list', 'city']))
    expect(getSeen()).toEqual(['list', 'city'])
  })

  // The regression. '1' is what the screenshot harness used to seed.
  it.each(['1', '"list"', 'true', 'null', '{"list":true}'])(
    'returns an array for the non-array value %s',
    (raw) => {
      store.set(TOUR_SEEN_KEY, raw)
      const seen = getSeen()
      expect(Array.isArray(seen)).toBe(true)
      // The two operations the callers perform must both be safe.
      expect(() => seen.includes('list')).not.toThrow()
      expect(() => new Set(seen)).not.toThrow()
    },
  )

  it('returns [] on malformed JSON', () => {
    store.set(TOUR_SEEN_KEY, '{not json')
    expect(getSeen()).toEqual([])
  })

  it('drops non-string entries but keeps the string ones', () => {
    store.set(TOUR_SEEN_KEY, JSON.stringify(['list', 3, null, { a: 1 }, 'zone']))
    expect(getSeen()).toEqual(['list', 'zone'])
  })
})

describe('markSeen', () => {
  it('appends without duplicating', () => {
    markSeen('list')
    markSeen('city')
    markSeen('list')
    expect(getSeen()).toEqual(['list', 'city'])
  })

  // Previously `new Set(1)` threw here ("number is not iterable"), so a corrupt key also broke
  // every attempt to dismiss a walkthrough — the user could not clear the bad state by using it.
  it('recovers from a corrupt existing value instead of throwing', () => {
    store.set(TOUR_SEEN_KEY, '1')
    expect(() => markSeen('list')).not.toThrow()
    expect(getSeen()).toEqual(['list'])
  })
})
