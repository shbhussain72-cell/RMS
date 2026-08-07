/**
 * Remarks — shared types.
 *
 * ── THE SELECTOR MODEL ───────────────────────────────────────────────────────────────
 *
 * A remark captures EVERY identifier the element has, not the best one. Picking a single
 * tier at creation time bakes in a dependency: choosing `data-tour` would mean that renaming
 * a tour anchor orphans every remark attached to it, and the tour and the remarks tool would
 * then share a stability contract neither author knows about.
 *
 * Capturing all of them makes each identifier a HINT. Resolution walks them in priority order
 * and a remark is orphaned only when every candidate fails — so `data-tour` disappearing is
 * survivable as long as the structural path or the id still lands.
 *
 * The strategy that actually resolved is recorded on every load. A remark that used to
 * resolve by `id` and now only resolves structurally has not broken, but it is one edit away
 * from breaking; that DEGRADED state is surfaced in the list panel as an early warning
 * rather than waiting for the orphan.
 *
 * ── WHY elementText IS LANGUAGE-TAGGED ───────────────────────────────────────────────
 *
 * Text is the weakest signal in this app specifically: the same element reads "Register now"
 * in `en` and Arabic script in `lsd`, so a text match across languages is not a weak match,
 * it is a wrong one. The capture language is stored with the text and the matcher refuses to
 * run unless the current language is the same. Text is never used to match across languages.
 */
import type { Lang } from '../components/Bidi'

/**
 * Resolution strategies, in priority order — index IS the priority, so degradation is a
 * numeric comparison. Keep the array ordered from strongest to weakest.
 */
export const STRATEGIES = [
  'remark-id',   // data-remark-id — an explicit, deliberate anchor
  'id',          // #id
  'test-id',     // [data-testid]
  'tour',        // [data-tour]  — 35 in this repo, on exactly the elements reviewers care about
  'name',        // [data-name]  — from the Figma port
  'node-id',     // [data-node-id]
  'structural',  // generated nth-child path
  'text',        // exact text match, SAME LANGUAGE ONLY — last resort
] as const

export type Strategy = (typeof STRATEGIES)[number]

/** Every identifier an element had at capture time. All optional except the structural path. */
export interface Identifiers {
  remarkId?: string
  id?: string
  testId?: string
  tour?: string
  name?: string
  nodeId?: string
  /** Always present — generated, so it always exists even when nothing else does. */
  structural: string
  /** Tag name, lowercased. Recovery context for a human reading an orphan. */
  tag: string
  /** Trimmed visible text, capped. Recovery context, and the weakest matcher. */
  text?: string
  /** The language `text` was captured in. A text match is refused unless this matches. */
  textLang: Lang
}

export type RemarkStatus = 'open' | 'resolved'

export interface Remark {
  id: string
  /** Concrete pathname at capture, e.g. `/miqaats/ashara-1448/city`. */
  route: string
  /**
   * Matched React Router pattern, e.g. `/miqaats/:id/city`.
   *
   * Stored alongside the pathname because every interesting route here is parameterised.
   * Grouping the export by pathname alone would split one screen's remarks across every
   * miqaat id anyone happened to be looking at.
   */
  routePattern: string
  identifiers: Identifiers
  /**
   * Best strategy AVAILABLE at capture time. Compared against `resolvedBy` to detect
   * degradation — this is the "it used to resolve by id" baseline.
   */
  capturedStrategy: Strategy
  remark: string
  author: string
  status: RemarkStatus
  /** Captured automatically — most remarks on this app are language- or width-specific. */
  lang: Lang
  dir: 'ltr' | 'rtl'
  viewportWidth: number
  createdAt: string
  updatedAt: string
  /** ISO timestamp of the last successful resolution. Absent = never resolved since capture. */
  lastSeenAt?: string
}

/** Live, per-load resolution state. Derived — never persisted. */
export interface Resolution {
  el: HTMLElement | null
  /** Which strategy landed, or null when every candidate failed. */
  resolvedBy: Strategy | null
  /** Resolved, but by a weaker strategy than the one available at capture. */
  degraded: boolean
  /** Every candidate failed, ON THE MATCHING ROUTE. Not merely "not currently mounted". */
  orphaned: boolean
}

/**
 * Persistence adapter.
 *
 * The UI never touches localStorage directly, so swapping in a backend or a file-based
 * adapter later is a one-line change in the provider rather than a refactor. Async
 * throughout for exactly that reason — a synchronous interface would have to be rewritten
 * the moment the first adapter needed a network call, and the spec forbids network calls
 * *now*, not forever.
 */
export interface RemarksAdapter {
  list(): Promise<Remark[]>
  load(id: string): Promise<Remark | null>
  save(remark: Remark): Promise<void>
  remove(id: string): Promise<void>
}
