/**
 * DOM scanner — finds English text that is actually on screen in LSD mode.
 *
 * WHY THIS EXISTS, and why the old number was wrong.
 *
 * The original coverage panel counted `resolve()` misses: strings that went through `t()`
 * and found nothing in the wordlist. That measures only the strings someone already wired
 * up. A hardcoded JSX literal — `<p>Register now</p>` — never calls `t()`, so it never
 * misses, so it was invisible. The panel could honestly report "60 untranslated" while a
 * screen was almost entirely English.
 *
 * This scanner asks the opposite question: of the text the browser has actually painted,
 * how much of it is still Latin? That is measurable regardless of how (or whether) the
 * string reaches the i18n layer, so it cannot be gamed by wiring alone.
 *
 * Each hit is classified by who has to act:
 *
 *   A  the dictionary HAS a real translation for this exact string — it simply is not
 *      wired to the lookup.                                          → developer
 *   B  a key exists, but its value is empty or an identity pass-through.
 *                                                                    → wordlist owner
 *   C  no key at all.                              → wordlist owner, then developer
 *
 * Deliberately NOT filtered by an allowlist. Latin is legitimate in places (ITS IDs, PDF,
 * email addresses) and those will show up as hits — that is fine. Classification is what
 * sorts them out; a hand-maintained "ignore these" list would rot and would quietly hide
 * real regressions.
 *
 * Dev-only. The single caller is CoveragePanel, which returns null when
 * `import.meta.env.DEV` is false, so this module is dropped from production bundles.
 */
import { inspectKey, normKey } from './index'

/** Latin word: two or more consecutive ASCII letters. Single letters are too noisy. */
const LATIN_WORD = /[A-Za-z]{2,}/
/** Any Arabic-script codepoint. Written as escapes — the ranges end at invisible characters. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

/**
 * Elements whose text is not user-facing copy.
 *
 * `code`/`pre` are required by spec. `script`/`style`/`noscript` hold no rendered text.
 * `svg` is excluded because its text nodes are glyph data, not sentences. `title` and
 * `option` are included on purpose — they ARE user-visible.
 */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'PATH', 'TEXTAREA'])

/** Marks the panel's own subtree so the scanner never reports itself. */
export const SCANNER_IGNORE_ATTR = 'data-lsd-scanner-ignore'

export type HitClass = 'A' | 'B' | 'C'

/**
 * The class as a PERSON has to act on it. `HitClass` answers "is there a usable row"; this
 * answers "whose desk does it land on", which is what the per-route report and the dictionary
 * editor are both actually asking. B splits because its two halves are opposites:
 *
 *   B1  the row is blank — the wordlist owner's queue.
 *   B2  the row holds the English word by policy (`src/i18n/loanword-policy.json`) — correct
 *       as it stands, and counting it as a gap would make the queue look permanently unfinished.
 *
 * Sentinel rows (the wordlist's `remove` marker) are their own state for the same reason: they
 * fall back to English deliberately, so they are neither a defect nor work outstanding.
 */
export type HitClassDetail = 'A' | 'B1' | 'B2' | 'C' | 'sentinel'

export interface ScanHit {
  text: string
  cls: HitClass
  /** The same verdict, split by who has to act. See `HitClassDetail`. */
  detail: HitClassDetail
  /** How many separate text nodes on this page carried the string. */
  count: number
  /** Nearest enclosing element's tag + any data-name, to locate it in the source. */
  where: string
  /** For class A/B: what the dictionary holds. */
  dictValue?: string
}

export interface ScanResult {
  route: string
  total: number
  A: number
  B: number
  C: number
  /** Per-actor counts. `B1 + B2 + sentinel` does not equal `B`: sentinels are not class B. */
  detail: Record<HitClassDetail, number>
  hits: ScanHit[]
}

/**
 * Sentinel is tested BEFORE `value`, because a sentinel row's value is blank and would
 * otherwise be indistinguishable from B1 — a queue item someone is waiting to translate.
 * It is not: it falls back to English on purpose.
 */
function detailOf(entry: ReturnType<typeof inspectKey>): HitClassDetail {
  if (!entry.exists) return 'C'
  if (entry.sentinel) return 'sentinel'
  if (entry.identity) return 'B2'
  if (!entry.value) return 'B1'
  return 'A'
}

/**
 * The same verdict for a string that is not on screen — the dictionary editor's Master list
 * needs it for rows nothing rendered. One implementation, so the editor's badges and the
 * per-route report can never disagree about what a string is.
 */
export function classifyDetail(text: string): HitClassDetail {
  return detailOf(inspectKey(text))
}

const describe = (node: Text): string => {
  const el = node.parentElement
  if (!el) return '?'
  const name = el.getAttribute('data-name') || el.getAttribute('data-tour') || ''
  const cls = (el.className && typeof el.className === 'string' ? el.className : '').split(/\s+/)[0] || ''
  return [el.tagName.toLowerCase(), name && `[${name}]`, cls && `.${cls}`].filter(Boolean).join('')
}

/**
 * Walk the rendered document and collect Latin-only text nodes.
 *
 * Uses TreeWalker with a filter rather than querySelectorAll + textContent: textContent
 * concatenates descendants, which would merge a translated label and an untranslated value
 * into one string and misreport both.
 */
export function scanDom(root: ParentNode = document.body): ScanResult {
  const byText = new Map<string, { count: number; where: string }>()

  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const text = node.nodeValue ?? ''
      if (!LATIN_WORD.test(text)) return NodeFilter.FILTER_REJECT
      if (ARABIC.test(text)) return NodeFilter.FILTER_REJECT

      for (let el = (node as Text).parentElement; el; el = el.parentElement) {
        if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT
        if (el.hasAttribute?.(SCANNER_IGNORE_ATTR)) return NodeFilter.FILTER_REJECT
        // An element explicitly marked LTR is data (ITS id, date, file size) rather than
        // untranslated copy — but it is still reported, just attributed accurately by the
        // classifier below. Nothing is suppressed here.
      }
      // Skip nodes that render nothing: whitespace, or hidden subtrees.
      const el = (node as Text).parentElement
      if (el && !el.isConnected) return NodeFilter.FILTER_REJECT
      if (el && el.offsetParent === null && getComputedStyle(el).position !== 'fixed') {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const raw = (n.nodeValue ?? '').replace(/\s+/g, ' ').trim()
    if (!raw) continue
    const prev = byText.get(raw)
    if (prev) prev.count++
    else byText.set(raw, { count: 1, where: describe(n as Text) })
  }

  const hits: ScanHit[] = []
  for (const [text, { count, where }] of byText) {
    const entry = inspectKey(text)
    let cls: HitClass
    if (!entry.exists) cls = 'C'
    else if (!entry.value || entry.identity) cls = 'B'
    else cls = 'A'
    hits.push({ text, cls, detail: detailOf(entry), count, where, ...(entry.exists ? { dictValue: entry.value } : {}) })
  }

  // Stable order: worst class first, then most-seen, then alphabetical — so two runs on the
  // same screen produce the same JSON and sessions can be diffed.
  const rank = { A: 0, B: 1, C: 2 } as const
  hits.sort((a, b) => rank[a.cls] - rank[b.cls] || b.count - a.count || (a.text < b.text ? -1 : 1))

  const detail: Record<HitClassDetail, number> = { A: 0, B1: 0, B2: 0, C: 0, sentinel: 0 }
  for (const h of hits) detail[h.detail]++

  return {
    route: typeof location !== 'undefined' ? location.pathname : '',
    total: hits.length,
    A: hits.filter((h) => h.cls === 'A').length,
    B: hits.filter((h) => h.cls === 'B').length,
    C: hits.filter((h) => h.cls === 'C').length,
    detail,
    hits,
  }
}

/**
 * Accumulator across routes.
 *
 * A single scan only sees the current screen; the baseline is the union over a walk of the
 * whole app. Keyed on the normalised string so the same literal on two screens counts once,
 * which is what makes the total comparable to the dictionary's entry count.
 */
const seen = new Map<string, ScanHit & { routes: Set<string> }>()

export function accumulate(result: ScanResult): void {
  for (const h of result.hits) {
    const key = normKey(h.text)
    const prev = seen.get(key)
    if (prev) {
      prev.count += h.count
      prev.routes.add(result.route)
      // A later scan may classify better (the dictionary can hot-reload).
      prev.cls = h.cls
      prev.detail = h.detail
      prev.dictValue = h.dictValue
    } else {
      seen.set(key, { ...h, routes: new Set([result.route]) })
    }
  }
}

export function cumulative() {
  const hits = [...seen.values()]
  const rank = { A: 0, B: 1, C: 2 } as const
  hits.sort((a, b) => rank[a.cls] - rank[b.cls] || b.count - a.count || (a.text < b.text ? -1 : 1))
  return {
    distinctStrings: hits.length,
    routesVisited: new Set(hits.flatMap((h) => [...h.routes])).size,
    A: hits.filter((h) => h.cls === 'A').length,
    B: hits.filter((h) => h.cls === 'B').length,
    C: hits.filter((h) => h.cls === 'C').length,
    detail: (['A', 'B1', 'B2', 'C', 'sentinel'] as const).reduce(
      (acc, c) => { acc[c] = hits.filter((h) => h.detail === c).length; return acc },
      { A: 0, B1: 0, B2: 0, C: 0, sentinel: 0 } as Record<HitClassDetail, number>,
    ),
    hits: hits.map((h) => ({
      text: h.text, cls: h.cls, detail: h.detail, count: h.count,
      routes: [...h.routes].sort(), where: h.where, dictValue: h.dictValue,
    })),
  }
}

export function resetCumulative(): void { seen.clear() }
