/**
 * The member meta line — `Wife · Female · Age 28 · ITS 30412787`.
 *
 * ── WHY THIS IS ONE MODULE AND NOT SIXTEEN TEMPLATE STRINGS ──────────────────────────
 *
 * This exact line was assembled by hand in sixteen places:
 *
 *     isolateRuns(`${tdText(m.relation)} · ${tdText(m.gender)} · ${t('Age')} ${age} · ${t('ITS')} ${its}`)
 *
 * Every one of those is four separate dictionary lookups glued together in an order the
 * template literal has already decided. A translator can change what `Age` says; they cannot
 * change where the number goes, whether the separator belongs between those two parts, or
 * whether the relation leads. In Lisan al-Dawat the answer to at least one of those is not
 * the English answer, and no wordlist row can express it — the sentence does not exist in the
 * dictionary, only its crumbs do.
 *
 * So the whole line is ONE key with named holes. The wordlist owner sees a sentence, moves
 * `{age}` wherever it belongs, and the code does not care.
 *
 * ── WHY FOUR KEYS ────────────────────────────────────────────────────────────────────
 *
 * The parts are optional at different call sites — a search result has no relation, an
 * invitee has neither relation nor gender. Interpolating an empty string would leave a
 * stranded ` · ` in the middle of the sentence, and making the separator conditional inside
 * the value would put punctuation logic back in the format. One key per shape instead: each
 * one reads as a sentence, and each one is independently translatable.
 *
 * ── WHAT STAYS LATIN ─────────────────────────────────────────────────────────────────
 *
 * `age` and `its` arrive as STRINGS and are interpolated verbatim. An ITS ID is an identifier
 * printed on a card people cross-check against, and the age is zero-padded at the call site
 * so a two-digit column does not jump between `9` and `10`. Neither is prose, so neither goes
 * through the numeral formatter; the numeric CSS rule keeps them left-to-right. `relation`
 * and `gender` ARE language and are translated before they are interpolated.
 */
import type { ReactNode } from 'react'
import { isolateRuns } from './Bidi'
import { useT } from '../i18n'

export interface MemberMetaParts {
  /** Already translated — it is a data value (`Wife`, `Son`) and goes through `td`/`tNow`. */
  relation?: string
  /** Already translated, same reason. */
  gender?: string
  /** Pre-formatted at the call site, so existing zero-padding is preserved exactly. */
  age: string
  its: string
}

/** A translate function with interpolation — both `useT().t` and `tNow` satisfy this. */
type Translate = (english: string, vars?: Record<string, string | number>) => string

/**
 * The composed line, isolated. `isolateRuns` is applied HERE rather than by the caller: the
 * result is a single text node mixing Arabic and Latin, so nothing wrapping the element can
 * isolate the Latin inside it.
 */
export function memberMeta(parts: MemberMetaParts, tr: Translate): ReactNode {
  const { relation, gender, age, its } = parts
  const key = relation && gender ? '{relation} · {gender} · Age {age} · ITS {its}'
    : relation ? '{relation} · Age {age} · ITS {its}'
    : gender ? '{gender} · Age {age} · ITS {its}'
    : 'Age {age} · ITS {its}'
  return isolateRuns(tr(key, { relation: relation ?? '', gender: gender ?? '', age, its }))
}

/** The same line inside a component, where the hook is available. */
export function MemberMeta(parts: MemberMetaParts) {
  const { t } = useT()
  return <>{memberMeta(parts, t)}</>
}
