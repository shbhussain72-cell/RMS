/**
 * Element identification and re-resolution.
 *
 * Capture records every identifier an element has. Resolution walks them strongest-first and
 * takes the first that lands on exactly one laid-out element. A remark is orphaned only when
 * ALL of them fail — see types.ts for why capture-all beats picking a tier.
 *
 * ── OVER-EAGER ORPHANING IS THE FAILURE THAT MATTERS ─────────────────────────────────
 *
 * A reviewer who sees correct remarks flagged as orphaned stops trusting the flag, and then
 * the real orphans go unread too. So every ambiguity here resolves toward "still anchored":
 *
 *   · An element that MOVED but is still findable re-anchors silently. The structural path
 *     is the thing that breaks on a move; a stronger identifier is tried first precisely so
 *     that a move does not read as a break.
 *   · Multiple matches are not a failure. This app renders mobile and desktop variants of the
 *     same content simultaneously and hides one with CSS, so a selector matching two nodes is
 *     normal — the laid-out one wins, matching TourOverlay's existing `findEl`.
 *   · A zero-size or display:none match is skipped, not failed, so a collapsed accordion does
 *     not orphan its contents.
 */
import type { Lang } from '../components/Bidi'
import { STRATEGIES, type Identifiers, type Remark, type Resolution, type Strategy } from './types'

/** Marks the tool's own DOM so remarks can never be attached to remarks chrome. */
export const CHROME_ATTR = 'data-remark-chrome'

const MAX_TEXT = 120

/** Is this element laid out? Mirrors TourOverlay.findEl — same dual-render problem. */
function isLaidOut(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 1 && r.height > 1
}

/** Is this node part of the remarks tool itself? */
export function isChrome(el: Element | null): boolean {
  return !!el?.closest(`[${CHROME_ATTR}]`)
}

function cssEscape(v: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(v)
  return v.replace(/["\\\]]/g, '\\$&')
}

/**
 * Structural CSS path — the always-available fallback.
 *
 * Built from `:nth-child` and tag names only. Class names are deliberately NOT used: this is
 * a Tailwind codebase where a class list is a styling decision that changes constantly, so a
 * class-bearing selector would break on edits that do not move the element at all.
 *
 * The walk stops early at the nearest ancestor carrying a stable attribute, anchoring the
 * path to something meaningful and keeping it short. A path rooted at `body` breaks whenever
 * anything above the target gains or loses a wrapper; a path rooted three levels up survives.
 */
export function structuralPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el

  while (node && node !== document.body && node.nodeType === 1) {
    const stable = stableAnchorFor(node)
    if (stable && node !== el) {
      parts.unshift(stable)
      return parts.join(' > ')
    }

    const parent: Element | null = node.parentElement
    if (!parent) break
    const idx = Array.prototype.indexOf.call(parent.children, node) + 1
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${idx})`)
    node = parent
  }
  return parts.length ? `body ${parts.join(' > ')}`.replace('body ', 'body > ') : 'body'
}

/** A selector for this element based on a stable attribute, if it has one. */
function stableAnchorFor(el: Element): string | null {
  const id = el.getAttribute('id')
  if (id) return `#${cssEscape(id)}`
  for (const attr of ['data-testid', 'data-tour', 'data-name', 'data-node-id']) {
    const v = el.getAttribute(attr)
    if (v) return `[${attr}="${cssEscape(v)}"]`
  }
  return null
}

/** Visible text of an element, trimmed and capped. Recovery context and weakest matcher. */
export function elementTextOf(el: Element): string | undefined {
  const t = (el.textContent || '').replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT - 1) + '…' : t
}

/** Record EVERY identifier this element has. */
export function captureIdentifiers(el: HTMLElement, lang: Lang): Identifiers {
  const attr = (n: string) => el.getAttribute(n) || undefined
  return {
    remarkId: attr('data-remark-id'),
    id: attr('id'),
    testId: attr('data-testid'),
    tour: attr('data-tour'),
    name: attr('data-name'),
    nodeId: attr('data-node-id'),
    structural: structuralPath(el),
    tag: el.tagName.toLowerCase(),
    text: elementTextOf(el),
    textLang: lang,
  }
}

/** The strongest strategy this identifier set supports. */
export function bestStrategy(ids: Identifiers): Strategy {
  if (ids.remarkId) return 'remark-id'
  if (ids.id) return 'id'
  if (ids.testId) return 'test-id'
  if (ids.tour) return 'tour'
  if (ids.name) return 'name'
  if (ids.nodeId) return 'node-id'
  return 'structural'
}

/** Selector string for a given strategy, or null if this remark has no such identifier. */
function selectorFor(ids: Identifiers, s: Strategy): string | null {
  switch (s) {
    case 'remark-id': return ids.remarkId ? `[data-remark-id="${cssEscape(ids.remarkId)}"]` : null
    case 'id': return ids.id ? `#${cssEscape(ids.id)}` : null
    case 'test-id': return ids.testId ? `[data-testid="${cssEscape(ids.testId)}"]` : null
    case 'tour': return ids.tour ? `[data-tour="${cssEscape(ids.tour)}"]` : null
    case 'name': return ids.name ? `[data-name="${cssEscape(ids.name)}"]` : null
    case 'node-id': return ids.nodeId ? `[data-node-id="${cssEscape(ids.nodeId)}"]` : null
    case 'structural': return ids.structural || null
    case 'text': return null // handled separately — text is not a CSS selector
  }
}

function queryLaidOut(selector: string): HTMLElement | null {
  let nodes: HTMLElement[]
  try {
    nodes = Array.from(document.querySelectorAll<HTMLElement>(selector))
  } catch {
    return null // a stored selector from an older build may not parse
  }
  const usable = nodes.filter((n) => !isChrome(n))
  return usable.find(isLaidOut) ?? null
}

/**
 * Text match — SAME LANGUAGE ONLY.
 *
 * Refused outright when the current language differs from the capture language. The same
 * element reads "Register now" in `en` and Arabic script in `lsd`; a cross-language text
 * match is not a weak match, it is a wrong one, and it would re-anchor a remark to whatever
 * unrelated element happened to share the string.
 *
 * Also requires the match to be UNIQUE. "Continue" appears on most screens in this app, so
 * an ambiguous text match anchors the pin to an arbitrary button.
 */
function resolveByText(ids: Identifiers, currentLang: Lang): HTMLElement | null {
  if (!ids.text || ids.textLang !== currentLang) return null
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(ids.tag))
    .filter((n) => !isChrome(n) && isLaidOut(n) && elementTextOf(n) === ids.text)
  return candidates.length === 1 ? candidates[0] : null
}

/**
 * Does this structurally-matched element actually look like the one that was annotated?
 *
 * Two cheap checks, and the fall-through is the interesting part. When corroboration fails,
 * resolution does NOT orphan — it continues to the `text` strategy, which searches the whole
 * document for the captured string. So an element that MOVED (breaking its nth-child path but
 * keeping its text) is found again at its new location and re-anchors silently. That is the
 * near-miss case, and getting it wrong by orphaning is what makes reviewers stop trusting the
 * flag.
 *
 * Text is only compared when the language matches, per the same rule as `resolveByText` — and
 * when the captured text is absent or the language differs, the tag check stands alone rather
 * than blocking the match.
 */
function corroborates(el: HTMLElement, ids: Identifiers, currentLang: Lang): boolean {
  if (el.tagName.toLowerCase() !== ids.tag) return false
  if (!ids.text || ids.textLang !== currentLang) return true
  return elementTextOf(el) === ids.text
}

/**
 * Resolve a remark against the live DOM.
 *
 * `onRoute` decides whether a failure means anything. Off-route, nothing is expected to
 * resolve, so nothing is orphaned — that distinction is the difference between a useful flag
 * and a list where every remark is permanently red.
 */
export function resolveRemark(remark: Remark, currentLang: Lang, onRoute: boolean): Resolution {
  for (const strategy of STRATEGIES) {
    const el = strategy === 'text'
      ? resolveByText(remark.identifiers, currentLang)
      : (() => {
          const sel = selectorFor(remark.identifiers, strategy)
          if (!sel) return null
          const hit = queryLaidOut(sel)
          // A structural path is an INDEX, and an index survives its element being deleted.
          // Reorder two siblings and `div:nth-child(3)` still matches — a different element.
          // Silently moving a remark onto the wrong element is worse than orphaning it,
          // because nothing about the pin looks wrong. So a structural hit has to corroborate.
          if (hit && strategy === 'structural' && !corroborates(hit, remark.identifiers, currentLang)) return null
          return hit
        })()

    if (el) {
      const capturedRank = STRATEGIES.indexOf(remark.capturedStrategy)
      const nowRank = STRATEGIES.indexOf(strategy)
      return { el, resolvedBy: strategy, degraded: nowRank > capturedRank, orphaned: false }
    }
  }
  return { el: null, resolvedBy: null, degraded: false, orphaned: onRoute }
}
