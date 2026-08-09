/**
 * store.persist.test.ts — a saved session from an older build must not crash the new one.
 *
 * ── THE FAILURE THIS EXISTS TO CATCH ─────────────────────────────────────────────────
 *
 * zustand's default `merge` is a shallow spread of persisted state over initial state. `flow`
 * is a single key, so a persisted `flow` REPLACES the whole object and every field added to
 * `RegistrationFlow` since that browser last saved is absent — not defaulted, absent.
 *
 * `/miqaats/:id/people` reads `flow.questionnaire` and `validateQuestionnaire` dereferences
 * `q.needsAccommodation` on its first line, so the route threw
 * `TypeError: Cannot read properties of undefined` for anyone whose saved state predated the
 * questionnaire. It reproduced only on a COLD load — a session that built its own state always
 * had every field — which is why it read as intermittent, and why a round of `family.find`
 * guards did not touch it. Those hardened the roster; the roster was never the problem.
 *
 * ── WHY IT ENUMERATES THE FIELDS ─────────────────────────────────────────────────────
 *
 * A test for `questionnaire` alone would pass for the next year and fail the same way the day
 * someone adds field N+1. The suite derives the field list from `emptyFlow` itself, drops each
 * one from a saved state in turn, and asserts the merge puts it back. A field added tomorrow is
 * covered without anyone remembering this file exists.
 *
 * The subject is the merged STATE — what a component would read — not the fact that a `merge`
 * option is configured.
 */
import { describe, expect, it } from 'vitest'
import { EMPTY_FLOW, mergePersisted, normaliseFlow, useStore, type StoreState } from './store'

/** The store as it is built before any rehydration — the `current` half of a merge. */
const baseState = (): StoreState => useStore.getState()

const FLOW_KEYS = Object.keys(EMPTY_FLOW) as (keyof typeof EMPTY_FLOW)[]

describe('a saved session missing fields the current build reads', () => {
  it('there are fields to check — without this the loop is vacuous', () => {
    expect(FLOW_KEYS.length).toBeGreaterThan(15)
    expect(FLOW_KEYS).toContain('questionnaire')
  })

  it.each(FLOW_KEYS)('restores flow.%s when the saved state does not have it', (key) => {
    const saved = { ...EMPTY_FLOW }
    delete (saved as Record<string, unknown>)[key]
    const merged = mergePersisted({ flow: saved }, baseState())
    expect(merged.flow[key], `flow.${key} came back undefined`).not.toBeUndefined()
  })

  it('restores the questionnaire field by field, not just the object', () => {
    // The actual crash: the object existed in later saves but an older one had fewer answers
    // in it, and `validateQuestionnaire` reads them without a null check.
    const merged = mergePersisted({ flow: { ...EMPTY_FLOW, questionnaire: { mobile: '123' } } }, baseState())
    expect(merged.flow.questionnaire.mobile).toBe('123')          // the saved answer survives
    expect(merged.flow.questionnaire.needsAccommodation).toBeNull()  // the missing one is defaulted
    expect(Object.keys(merged.flow.questionnaire).sort())
      .toEqual(Object.keys(EMPTY_FLOW.questionnaire).sort())
  })

  it('reproduces the exact throw without the merge, and not with it', () => {
    // Asserting the OUTCOME the user saw: reading the field the route reads. Without the merge
    // a saved state with no questionnaire hands `undefined` to the validator, which is the
    // TypeError; with it, the read is safe.
    const savedWithoutQuestionnaire = { ...EMPTY_FLOW } as Record<string, unknown>
    delete savedWithoutQuestionnaire.questionnaire

    const naive = { ...baseState(), flow: savedWithoutQuestionnaire } as unknown as StoreState
    expect(() => (naive.flow.questionnaire as { needsAccommodation: unknown }).needsAccommodation).toThrow(TypeError)

    const merged = mergePersisted({ flow: savedWithoutQuestionnaire }, baseState())
    expect(() => merged.flow.questionnaire.needsAccommodation).not.toThrow()
  })
})

describe('what the merge must NOT do', () => {
  it('keeps the saved values it does have', () => {
    const saved = { ...EMPTY_FLOW, submitted: true, referenceNumber: 'RMS-9', selectedMemberIds: ['m1', 'm4'] }
    const merged = mergePersisted({ flow: saved, loggedIn: true }, baseState())
    expect(merged.flow.submitted).toBe(true)
    expect(merged.flow.referenceNumber).toBe('RMS-9')
    expect(merged.flow.selectedMemberIds).toEqual(['m1', 'm4'])
    expect(merged.loggedIn).toBe(true)
  })

  it('normalises every registration, not only the live flow', () => {
    // `registrations` holds a full flow per miqaat and has exactly the same problem. A route
    // opened from the home screen reads one of these rather than `flow`.
    const stale = { ...EMPTY_FLOW } as Record<string, unknown>
    delete stale.questionnaire
    const merged = mergePersisted({ flow: EMPTY_FLOW, registrations: { 'ashara-1448': stale } }, baseState())
    expect(merged.registrations['ashara-1448'].questionnaire.needsAccommodation).toBeNull()
  })

  it('does not empty the demo registrations when the saved state has none', () => {
    // `{}` and "absent" are different: an older save with no registrations key must not wipe
    // the seeded ones, or the home screen comes back blank.
    const base = baseState()
    const merged = mergePersisted({ flow: EMPTY_FLOW }, base)
    expect(Object.keys(merged.registrations)).toEqual(Object.keys(base.registrations))
  })

  it('survives a saved state that is empty, or not an object at all', () => {
    for (const junk of [undefined, null, {}, 'nonsense', 42]) {
      const merged = mergePersisted(junk, baseState())
      expect(merged.flow.questionnaire.needsAccommodation).toBeNull()
      expect(merged.flow.selectedMemberIds).toEqual([])
    }
  })

  it('normaliseFlow leaves a complete flow untouched', () => {
    expect(normaliseFlow(EMPTY_FLOW)).toEqual(EMPTY_FLOW)
  })
})
