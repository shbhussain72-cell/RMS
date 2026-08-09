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
import { allEntries, inspectKey, LSD_BCP47, normKey } from './index'

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

/** Set by `isolateRuns()` on every Latin run it cuts out of a translated dictionary value. */
const ISOLATED_RUN_ATTR = 'data-lsd-run'

/** Set by `tx()` when interpolation made the rendered text differ from the dictionary key. */
const KEY_ATTR = 'data-lsd-key'

/**
 * Marks text that is not language in ANY language — avatar initials, the EN/LSD switcher.
 * See `src/components/NotLanguage.tsx` for why this is a marker on the SITE and not a list of
 * literals: `MH` has no Lisan al-Dawat form, but somewhere else `MH` might be real copy.
 */
const NOT_LANGUAGE_ATTR = 'data-lsd-not-language'

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

/**
 * Where the hit is, as `span.truncate < div.flex < td.px-[12px]`.
 *
 * Two ancestors, not just the parent. The immediate parent alone is frequently `span.truncate`
 * or `p.text-[14px]` — true of a dozen elements per screen and enough to find none of them.
 * Grepping for a class chain lands on the right JSX first time.
 */
const describe = (node: Text): string => {
  const parts: string[] = []
  for (let el = node.parentElement; el && parts.length < 3; el = el.parentElement) {
    const name = el.getAttribute('data-name') || el.getAttribute('data-tour') || ''
    const cls = (el.className && typeof el.className === 'string' ? el.className : '').split(/\s+/)[0] || ''
    parts.push([el.tagName.toLowerCase(), name && `[${name}]`, cls && `.${cls}`].filter(Boolean).join(''))
  }
  return parts.join(' < ') || '?'
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
        // A Latin run that `isolateRuns()` cut out of a TRANSLATED value. `‏Register كرنار`
        // and `‏zone ا - هال اعظم` are finished LSD strings whose Latin halves are loanwords
        // the policy keeps in Latin on purpose; the scanner reads text nodes, so it sees the
        // loanword and not the Arabic around it, and reports a translated string as English.
        // Without this the class-A count carries a floor no amount of wiring can remove.
        if (el.hasAttribute?.(ISOLATED_RUN_ATTR)) return NodeFilter.FILTER_REJECT
        if (el.hasAttribute?.(NOT_LANGUAGE_ATTR)) return NodeFilter.FILTER_REJECT
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
    const rendered = (n.nodeValue ?? '').replace(/\s+/g, ' ').trim()
    if (!rendered) continue
    // A parameterised key renders as a filled-in string — `Close in 00:42:11` for the row
    // `Close in {time}`. Looking up what the DOM says would report a class-C gap for a string
    // that changes every second and can never HAVE a row. `tx` records the key it came from,
    // and that is the thing the wordlist owner can actually act on.
    const raw = (n as Text).parentElement?.closest?.(`[${KEY_ATTR}]`)?.getAttribute(KEY_ATTR) || rendered
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

// ─────────────────────────────────────────────────────────────────────────────────────
// THE INVENTORY PASS
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Every string on the page, translated or not — as opposed to `scanDom`, which finds gaps.
 *
 * ── WHY BOTH EXIST ───────────────────────────────────────────────────────────────────
 *
 * `scanDom` rejects any text node containing Arabic and any node without a Latin word. That is
 * correct for what it is: a gap finder, answering "what on this screen is still English". But
 * the dictionary editor's Page tab was built on it, so the tab could only ever list strings
 * that are NOT yet translated — and the better the wordlist got, the emptier it became.
 *
 * Measured on the LSD build before this existed:
 *
 *     /miqaats                  142 visible strings ->  4 hits ->  3 rows listed
 *     /miqaats/ashara-1448       77 visible strings -> 10 hits ->  1 row listed
 *     /miqaats/ashara-1448/people 99 visible strings ->  7 hits
 *
 * A reviewer looking at a page of 142 strings was offered three. So this pass answers the other
 * question — "what is on this screen, and what does the dictionary say about each" — and the
 * Page tab reads it. `scanDom` is unchanged; the coverage numbers built on it still mean what
 * they meant.
 *
 * ── ATTRIBUTION, AND WHY IT IS RECORDED PER ROW ──────────────────────────────────────
 *
 * A row is only editable if the English key behind it is known, and the rendered text is not
 * that key once it has been translated. Three routes to it, in descending reliability:
 *
 *   data-lsd-key    `tx()` stamps it whenever interpolation changed the string. Authoritative.
 *   reverse-lookup  the element carries `lang="gu-Arab"`, which `tx()` sets on every HIT, so
 *                   its text IS a dictionary value; look the value up to get its key.
 *   identity        no dictionary marker — hardcoded JSX, or English that never called `t()`.
 *                   The rendered text is its own key, which is what makes it class C.
 *
 * `via` is on every hit because attribution can be wrong — two rows sharing a translation
 * collapse to whichever the reverse index saw first — and a wrong row a reviewer can see the
 * provenance of is arguable. One they cannot is just wrong.
 */
export type Attribution = 'data-lsd-key' | 'reverse-lookup' | 'identity'

export interface InventoryHit {
  /** The English key. What the editor edits. */
  english: string
  /** What this page is actually showing — the translation in LSD, the key itself in English. */
  rendered: string
  /** True when `rendered` came out of the dictionary rather than out of the JSX. */
  translated: boolean
  detail: HitClassDetail
  count: number
  where: string
  dictValue?: string
  via: Attribution
}

export interface InventoryResult {
  route: string
  /** Distinct visible text nodes, before merging. The ceiling the tab reconciles against. */
  visibleTextNodes: number
  /** Text nodes excluded by a NAMED rule, so the gap between the two is never a mystery. */
  excluded: { skipTag: number; ignored: number; notLanguage: number; blank: number }
  hits: InventoryHit[]
}

/** RLM/LRM and whitespace carry no meaning for matching a value back to its row. */
const forMatch = (s: string): string =>
  s.replace(/[\u200e\u200f]/g, '').replace(/\s+/g, ' ').trim()

/**
 * The nearest element whose `lang` marks IT as a translated string — never the document.
 *
 * `applyRootLang` puts `lang="gu-Arab"` on <html> so the PAGE is in LSD. That is the same
 * attribute and the same value `tx()` puts on a translated NODE, and `closest()` cannot tell
 * a document-level claim from a string-level one: in LSD it never returns null, so every text
 * node with no nearer marker resolved to the root and adopted `documentElement.textContent` —
 * the whole page, plus the dev server's injected <script> source — as its key. One row, every
 * string on the route inside it, and nothing a reviewer could edit.
 *
 * Measured on /miqaats/ashara-1448/people before this existed: 128 visible text nodes, 108 of
 * them owned by <html>, 27 rows, the first holding 87 nodes under a 172,923-character key.
 * The same route in Master: 96 nodes, none owned, 79 rows. Two languages disagreeing by 52
 * rows on one page is the shape of the bug.
 */
/**
 * A single node's text, attributed as best the dictionary allows.
 *
 * The reverse index is consulted on the NODE's own text and not only on an owner element's,
 * because most translated text on a page has no element of its own to carry the marker:
 * `t()` and `tdText()` return a bare string, so their output lands in whatever JSX the call
 * site already had. Measured on /miqaats/ashara-1448/people in LSD: one row in eighty-seven
 * reached its English key, and forty-two were keyed by their own Arabic — a row a reviewer
 * can read and cannot edit, because the thing the editor writes is the English key.
 *
 * Two keys sharing one translation collapse to whichever the index saw first. That is why
 * `via` is on every hit: an attribution a reviewer can see the provenance of is arguable, and
 * one they cannot is just wrong.
 */
const attributeWith = (byValue: Map<string, string>) => (text: string): { english: string; via: Attribution } => {
  const mapped = byValue.get(forMatch(text))
  return mapped ? { english: mapped, via: 'reverse-lookup' } : { english: text, via: 'identity' }
}

const stringOwner = (start: HTMLElement): HTMLElement | null => {
  for (let a: HTMLElement | null = start; a; a = a.parentElement) {
    if (a === document.documentElement || a === document.body) return null
    if (a.getAttribute?.('lang') === LSD_BCP47) return a
  }
  return null
}

export function inventoryDom(root: ParentNode = document.body): InventoryResult {
  // Rebuilt per scan rather than cached: an override applied since the last pass changes what a
  // value maps back to, and a stale index would attribute a row to the string it used to hold.
  const byValue = new Map<string, string>()
  for (const e of allEntries()) {
    const v = forMatch(e.lsd || '')
    if (v && !byValue.has(v)) byValue.set(v, e.english)
  }

  const attribute = attributeWith(byValue)

  const excluded = { skipTag: 0, ignored: 0, notLanguage: 0, blank: 0 }
  /** english -> hit under construction. Merged here so one value split across nodes is one row. */
  const byKey = new Map<string, InventoryHit>()
  let visibleTextNodes = 0

  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const rendered = (n.nodeValue ?? '').replace(/\s+/g, ' ').trim()
    // `forMatch` and not `trim` alone: `isolateRuns` leaves nodes holding nothing but an RLM,
    // which is not whitespace, so they survived as a row keyed by an invisible character —
    // an empty line in the tab that a reviewer cannot click, read or explain.
    if (!forMatch(rendered)) { excluded.blank++; continue }
    const el = (n as Text).parentElement
    if (!el || !el.isConnected) { excluded.blank++; continue }

    let drop: keyof typeof excluded | null = null
    for (let a: HTMLElement | null = el; a; a = a.parentElement) {
      if (SKIP_TAGS.has(a.tagName)) { drop = 'skipTag'; break }
      if (a.hasAttribute?.(SCANNER_IGNORE_ATTR)) { drop = 'ignored'; break }
      // Data, not copy: an ITS id, a file size, an authored proper noun. Excluded here for the
      // same reason `scanDom` excludes it — there is nothing for a translator to do with it —
      // but COUNTED, so the difference between "on screen" and "listed" is always accounted for.
      if (a.hasAttribute?.(NOT_LANGUAGE_ATTR)) { drop = 'notLanguage'; break }
    }
    if (drop) { excluded[drop]++; continue }
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') { excluded.blank++; continue }

    visibleTextNodes++

    // NOTE the order. `data-lsd-key` beats the language marker because an interpolated string
    // renders as `Close in 00:42:11` and its key is `Close in {time}` — the reverse index would
    // never find the rendered form, and the identity fallback would file a class-C gap for a
    // string that changes every second and can never have a row of its own.
    const keyed = el.closest?.(`[${KEY_ATTR}]`)
    const owner = stringOwner(el)
    let english: string
    let via: Attribution
    let shown = rendered
    if (keyed) {
      english = keyed.getAttribute(KEY_ATTR) || rendered
      via = 'data-lsd-key'
      shown = (keyed.textContent || rendered).replace(/\s+/g, ' ').trim()
    } else if (owner) {
      // The whole element's text, not this node's: `isolateRuns` splits a value with a Latin
      // loanword into several nodes, and three fragments of one translation are not three
      // strings a reviewer can act on.
      //
      // ONLY while that whole text is a value the dictionary knows. A miss does not mean "an
      // untranslated string" — it means this element is a CONTAINER holding several of them,
      // which `dirProps` produces on any element whose text comes from elsewhere. Adopting a
      // container's text made every node under it one row, keyed by their concatenation. So a
      // miss falls back to this node's own text, which is what Master does for all of them.
      const whole = (owner.textContent || rendered).replace(/\s+/g, ' ').trim()
      const mapped = byValue.get(forMatch(whole))
      if (mapped) { shown = whole; english = mapped; via = 'reverse-lookup' }
      else ({ english, via } = attribute(rendered))
    } else {
      ({ english, via } = attribute(rendered))
    }

    const prev = byKey.get(english)
    if (prev) { prev.count++; continue }
    const entry = inspectKey(english)
    byKey.set(english, {
      english,
      rendered: shown,
      // Came out of the dictionary. `data-lsd-key` alone does not say that — `tx()` stamps it
      // on an interpolated MISS too, and that node is still English under `lang="en"`.
      translated: via === 'reverse-lookup'
        || (via === 'data-lsd-key' && keyed?.getAttribute('lang') === LSD_BCP47),
      detail: detailOf(entry),
      count: 1,
      where: describe(n as Text),
      ...(entry.exists ? { dictValue: entry.value } : {}),
      via,
    })
  }

  const hits = [...byKey.values()]
  // Untranslated first — a reviewer opening the tab is usually looking for work — then by how
  // often the string appears, then alphabetically so two runs of one screen are diffable.
  const rank: Record<HitClassDetail, number> = { C: 0, B1: 1, A: 2, B2: 3, sentinel: 4 }
  hits.sort((a, b) => rank[a.detail] - rank[b.detail] || b.count - a.count || (a.english < b.english ? -1 : 1))

  return {
    route: typeof location !== 'undefined' ? location.pathname : '',
    visibleTextNodes,
    excluded,
    hits,
  }
}
