/**
 * target.ts — pointing a note at something, without storing a way to find it again.
 *
 * ── THE ONE DECISION THIS FILE EXISTS TO HOLD ────────────────────────────────────────
 *
 * A target is `{ label, tag }`. The label is the element's trimmed visible text; the tag is a
 * PREFERENCE used when several elements carry that text. There is no selector here, no path, no
 * nth-child index, no anchor and no fallback strategy — and adding one "just in case" is the
 * change this file is written to prevent.
 *
 * `src/remarks` stored a selector and resolved it later, and about two thirds of that subsystem
 * exists to cope with the gap between those two moments: capture strategies, degradation levels,
 * orphan states, an ambiguity rule, corroboration, and a fixture to test the recovery. Every one
 * of them is a consequence of the SAME choice — that a stored reference must keep meaning
 * something after the page it referred to has changed.
 *
 * Resolution here happens exactly once, at capture time, against the page already open in front
 * of the person pressing the button. Nothing is resolved on load, on navigation, or on read, and
 * nothing is ever written back. So there is no interval during which a target can go stale:
 * either the text is on the screen being photographed or it is not, and "is not" is an ordinary
 * outcome with an ordinary rendering — the note appears in the list without a marker.
 *
 * That is why a label is enough. A selector would be more precise about an element that no longer
 * exists, which is precision spent on the only case where it cannot help.
 *
 * ── WHY POINTING IS OPTIONAL ─────────────────────────────────────────────────────────
 *
 * Of the 48 recovered notes, the ones that mattered most are about the screen: "add a popup",
 * "remove countdowns from smaller miqaat", "D - Either remove or align to left". Requiring a
 * target would make somebody choose an element for a note that is not about one, and every
 * arbitrary choice degrades the markers that ARE meaningful — a screen with nine badges where
 * four are decorative is a screen a reader stops trusting. A note with no target is a note.
 */
import type { Note, NoteTarget } from './types'

/**
 * The dev chrome: the docks and the board.
 *
 * Nothing inside it can be pointed AT and nothing inside it can be a MATCH. Both directions
 * matter — the board renders every note's text, so without this exclusion a note would resolve
 * to its own row on the board and the capture would mark the tool rather than the app.
 */
export const CHROME = '[data-devdock], [data-notes]'

/**
 * An element's label: its text, whitespace-collapsed and trimmed.
 *
 * The SAME function is used when pointing and when resolving, so the two agree by construction
 * rather than by two definitions being kept in step. That is the whole reason it is exported
 * instead of being written twice.
 */
export function labelOf(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** What to store for an element, or null when it carries no text to match on later. */
export function targetFrom(el: Element): NoteTarget | null {
  const label = labelOf(el)
  if (!label) return null
  return { label, tag: el.tagName.toLowerCase() }
}

/**
 * Tag names, for telling ``input`` (a tag) from ``Done`` (a label).
 *
 * The 44 recovered notes that carry an `element` come in two shapes, and the second is only
 * distinguishable from the first by knowing what a tag name looks like:
 *
 *   `p` — "ITS ID"     26 of them — a tag, then the label
 *   `Done`             18 of them — the label alone, in the same backticks
 *
 * A set rather than `/^[a-z]+$/` because a one-word lowercase label is a real thing ("submitted")
 * and would otherwise be read as a tag and thrown away. Checked against the file: none of the 18
 * bare labels is a tag name, and all 26 tags are in here.
 */
const TAGS = new Set([
  'a', 'abbr', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote', 'button', 'canvas', 'caption',
  'cite', 'code', 'dd', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img',
  'input', 'label', 'legend', 'li', 'main', 'mark', 'nav', 'ol', 'option', 'output', 'p', 'pre',
  'section', 'select', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'svg', 'table',
  'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul',
])

const TAGGED = /^`([a-z][a-z0-9]*)`(?:\s*—\s*"([\s\S]*)")?$/
const BARE = /^`([\s\S]+)`$/

/**
 * A recovered note's `element` line, read as a target.
 *
 * DERIVED AT USE, NOT MIGRATED INTO STORAGE. Every browser that has already seeded holds the 48
 * notes with `element` and no `target`, and a migration would have to run there — which means a
 * version bump, a rewrite of somebody's stored board, and a second code path that only ever
 * executes once per browser and can therefore only be tested once per browser. Parsing on the way
 * past costs a regex on 48 short strings at capture time and has no such moment.
 */
export function targetFromElementNote(element?: string): NoteTarget | null {
  if (!element) return null
  const s = element.trim()

  const tagged = TAGGED.exec(s)
  if (tagged && TAGS.has(tagged[1])) {
    const label = (tagged[2] ?? '').replace(/\s+/g, ' ').trim()
    // A tag with no label — ``input`` — records only that it was an input. There is nothing
    // to match on, so there is no target: 3 of the 48 are in this state.
    return label ? { label, tag: tagged[1] } : null
  }

  const bare = BARE.exec(s)
  if (bare) {
    const label = bare[1].replace(/\s+/g, ' ').trim()
    // No tag recorded, so no tag preference. It resolves on text alone.
    return label ? { label } : null
  }
  return null
}

/** A note's target, whether it was pointed by hand or recovered from the old tool. */
export function targetOf(note: Note): NoteTarget | null {
  return note.target ?? targetFromElementNote(note.element)
}

export interface Resolution {
  note: Note
  target: NoteTarget | null
  /** The element to mark, or null. Null is an ordinary outcome, not a failure. */
  el: HTMLElement | null
  /** How many elements carry this label. More than one means the first was taken. */
  matches: number
}

/**
 * Elements whose text is exactly `label`, in document order, chrome excluded.
 *
 * ── WHY OFF-SCREEN ELEMENTS ARE NOT CANDIDATES ───────────────────────────────────────
 *
 * A `display: none` element has a zero rect at the origin, so marking one puts the badge in the
 * top corner pointing at nothing — a marker that is confidently wrong, which is the outcome the
 * whole "no fuzzy matching" rule is trying to avoid. This is not a loosened match: it is the
 * difference between text that is ON the screen being photographed and text that is merely in the
 * document. A capture cannot point at what it cannot show.
 */
function candidates(target: NoteTarget, root: ParentNode): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>('*')].filter((el) => {
    if (el.closest(CHROME)) return false
    if (labelOf(el) !== target.label) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 || r.height > 0
  })
  if (!all.length || !target.tag) return all
  // The tag is a PREFERENCE, not a filter: a label whose element changed from a <span> to a <div>
  // still resolves, it just stops being the tie-breaker it was recorded to be.
  const byTag = all.filter((el) => el.tagName.toLowerCase() === target.tag)
  return byTag.length ? byTag : all
}

/**
 * Resolve every note against the live page. Called once, from the capture.
 *
 * Linear in elements and, because each candidate reads its own subtree text, closer to linear in
 * total DOM text. On these screens that is a handful of milliseconds once per export, which is
 * the right place to spend it — the alternative shapes all involve keeping an index correct
 * between exports, and an index is a thing that can be wrong.
 */
export function resolveOnPage(notes: Note[], root: ParentNode = document.body): Resolution[] {
  return notes.map((note) => {
    const target = targetOf(note)
    if (!target) return { note, target: null, el: null, matches: 0 }
    const found = candidates(target, root)
    return { note, target, el: found[0] ?? null, matches: found.length }
  })
}

/** What a line has to say about its own target, beyond the note's text. */
export type LineCaveat =
  | { kind: 'none' }
  | { kind: 'missing'; label: string }
  | { kind: 'ambiguous'; label: string; count: number }

export interface PlannedLine {
  note: Note
  /** Its place in the ONE sequence that runs across the image and the list. */
  n: number
  /** Whether a badge carrying `n` is drawn on the page. */
  marked: boolean
  caveat: LineCaveat
}

/**
 * PURE. The numbering, in one sequence, and what each line must disclose.
 *
 * Marked notes come first so that badge ① is list line 1 and the reader can go from one to the
 * other without counting past entries that have no badge. Everything else keeps its relative
 * order and follows, still numbered — a page-level note is not a lesser note, it just has nowhere
 * on the screen to point.
 *
 * Pure, and returning a CAVEAT rather than a sentence, because the sentence needs `t()` and the
 * numbering does not. Testing "does the sixth line say the label is gone" should not require a
 * translation dictionary.
 */
export function planLines(res: Array<Omit<Resolution, 'el'> & { found: boolean }>): PlannedLine[] {
  const marked = res.filter((r) => r.found)
  const rest = res.filter((r) => !r.found)
  const out: PlannedLine[] = []

  marked.forEach((r) => out.push({
    note: r.note,
    n: out.length + 1,
    marked: true,
    caveat: r.matches > 1 && r.target
      ? { kind: 'ambiguous', label: r.target.label, count: r.matches }
      : { kind: 'none' },
  }))

  rest.forEach((r) => out.push({
    note: r.note,
    n: out.length + 1,
    marked: false,
    // A note that never pointed anywhere says nothing; one that pointed at text no longer on the
    // screen says SO. Those are different facts and a reader acts differently on them.
    caveat: r.target ? { kind: 'missing', label: r.target.label } : { kind: 'none' },
  }))

  return out
}
