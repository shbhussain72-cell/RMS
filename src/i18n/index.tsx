/**
 * English ⇄ Lisan ud-Dawat (LSD) language layer.
 *
 * There was no i18n system in this app before — every string was hardcoded in JSX.
 * This is deliberately the smallest thing that works: a dictionary lookup keyed on the
 * ENGLISH STRING ITSELF, so converting a screen means wrapping its literals, never
 * inventing message ids or maintaining a parallel English catalogue.
 *
 *   const { t, tx } = useT()
 *   <p {...tx('Login to Continue')} />        ← element gets dir/lang + translated text
 *   <input placeholder={t('Enter your password')} />  ← attributes can't carry dir
 *
 * Lookup rules (must stay in lockstep with scripts/build-lsd-dict.mjs):
 *   · whitespace collapsed + trimmed on both sides
 *   · casing preserved — it is meaningful in the wordlist (LIVE, OPTIONAL, RAZA STATUS)
 *   · exact match only. A near-miss is reported as a gap, never silently fuzzy-matched.
 *
 * Fallback: a string with no entry (or an entry with an empty LSD value) renders its
 * ENGLISH text. Never blank, never a raw key.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import raw from './lsd.json'
import { isolateRuns } from '../components/Bidi'

export type Lang = 'en' | 'lsd'

interface Entry { lsd: string; page: string }

/** localStorage key. Matches the app's existing `rms-*` convention (see rms-tour-seen). */
const STORAGE_KEY = 'rms-lang'

/**
 * BCP-47 for the LSD side. Lisan ud-Dawat is Gujarati written in Arabic script, so
 * `gu-Arab` is the correct, standards-valid tag — there is no registered "lsd" subtag.
 * This drives font fallback and screen-reader pronunciation, not our own lookup.
 */
const LSD_BCP47 = 'gu-Arab'

/** Identical normalisation to the build script — both sides must agree or nothing matches. */
export const normKey = (s: string): string => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * The live dictionary. Kept as one Map that is refilled in place (never reassigned) so the
 * HMR hot-swap at the bottom of this file can replace its contents without every consumer
 * needing a new reference.
 */
const ENTRIES = new Map<string, Entry>()

/** (Re)fill ENTRIES from a raw lsd.json payload. The "//" key is the banner, not an entry. */
function loadEntries(payload: unknown): void {
  ENTRIES.clear()
  for (const [k, v] of Object.entries((payload ?? {}) as Record<string, unknown>)) {
    if (k === '//') continue
    if (v && typeof v === 'object' && typeof (v as Entry).lsd === 'string') {
      ENTRIES.set(normKey(k), v as Entry)
    }
  }
}
loadEntries(raw)

export const dictSize = (): number => ENTRIES.size

// Bumped when the dictionary is hot-swapped, so React re-renders with the new strings.
let dictVersion = 0
const dictListeners = new Set<() => void>()
function subscribeDict(fn: () => void): () => void {
  dictListeners.add(fn)
  return () => { dictListeners.delete(fn) }
}

// ─── Dev-only coverage tracking ───────────────────────────────────────────────
// The point of this feature is finding gaps between the wordlist and the live UI, so
// every lookup is recorded in dev: which dictionary entries actually got used, and which
// on-screen English strings had no entry at all.

const DEV = import.meta.env.DEV
const resolvedKeys = new Set<string>()
const missedStrings = new Map<string, number>()
/** Bumped on every miss so subscribed panels re-render without polling. */
let coverageVersion = 0
const coverageListeners = new Set<() => void>()
/**
 * Coverage notification is DEFERRED to a microtask — never called synchronously.
 *
 * `resolve()` runs during render (every `tx()` call is inside a component body), and it
 * records hits/misses. Notifying listeners from there sets state on CoveragePanelInner
 * while a different component is rendering, which React reports as:
 *   "Cannot update a component while rendering a different component"
 * It fired on essentially every screen.
 *
 * Buffering into a microtask moves the state update out of the render phase and also
 * collapses the hundreds of lookups in a single render into ONE notification.
 */
let coverageFlushQueued = false
const notifyCoverage = () => {
  coverageVersion++
  if (coverageFlushQueued) return
  coverageFlushQueued = true
  queueMicrotask(() => {
    coverageFlushQueued = false
    coverageListeners.forEach((fn) => fn())
  })
}

export function subscribeCoverage(fn: () => void): () => void {
  coverageListeners.add(fn)
  return () => { coverageListeners.delete(fn) }
}
export const getCoverageVersion = () => coverageVersion

export interface CoverageReport {
  dictionaryEntries: number
  resolvedInApp: number
  resolvedPct: number
  missCount: number
  /** On-screen English strings with no wordlist entry, most-seen first. */
  untranslated: { text: string; seen: number }[]
}

export function coverageReport(): CoverageReport {
  const untranslated = [...missedStrings.entries()]
    .map(([text, seen]) => ({ text, seen }))
    .sort((a, b) => b.seen - a.seen || a.text.localeCompare(b.text))
  const total = ENTRIES.size
  return {
    dictionaryEntries: total,
    resolvedInApp: resolvedKeys.size,
    resolvedPct: total ? Math.round((resolvedKeys.size / total) * 1000) / 10 : 0,
    missCount: untranslated.length,
    untranslated,
  }
}

function recordHit(key: string) {
  if (!DEV) return
  if (!resolvedKeys.has(key)) { resolvedKeys.add(key); notifyCoverage() }
}
function recordMiss(original: string) {
  if (!DEV) return
  const prev = missedStrings.get(original)
  missedStrings.set(original, (prev ?? 0) + 1)
  if (prev === undefined) notifyCoverage()
}

if (DEV && typeof window !== 'undefined') {
  const api = {
    report: coverageReport,
    /** The untranslated list alone, as plain strings — convenient to paste into the xlsx. */
    untranslated: () => coverageReport().untranslated.map((u) => u.text),
    /** Save lsd-coverage.json to the browser's download folder. */
    download() {
      const blob = new Blob([JSON.stringify(coverageReport(), null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'lsd-coverage.json'
      a.click()
      URL.revokeObjectURL(a.href)
    },
    reset() { resolvedKeys.clear(); missedStrings.clear(); notifyCoverage() },
  }
  ;(window as unknown as { __lsdCoverage: typeof api }).__lsdCoverage = api

  // Coverage is only meaningful once the user has actually walked the app, so the
  // summary is dumped on the way out rather than on some arbitrary timer.
  window.addEventListener('beforeunload', () => {
    const r = coverageReport()
    if (r.resolvedInApp === 0 && r.missCount === 0) return
    console.groupCollapsed(`[LSD coverage] ${r.resolvedInApp}/${r.dictionaryEntries} entries used (${r.resolvedPct}%) · ${r.missCount} untranslated`)
    if (r.untranslated.length) console.table(r.untranslated)
    console.info('window.__lsdCoverage.download() writes lsd-coverage.json')
    console.groupEnd()
  })
}

// ─── Translation ──────────────────────────────────────────────────────────────

/**
 * Marker appended to any on-screen string with no wordlist entry, so gaps are visible in
 * the running app without opening the coverage panel. LSD mode only — in English mode
 * every string would qualify, which would be noise rather than signal.
 *
 * To ship without it, set this to ''. Nothing else needs to change.
 */
export const MISSING_MARKER = '*'

/**
 * Zero-width direction controls. Stripped before comparing a value to its key: the build
 * step prefixes U+200F to mixed-script values, so a byte comparison would never match.
 */
const BIDI_MARKS = /[‎‏؜⁦-⁩‪-‮]/g

/**
 * Dev-only, deduplicated warning for a row that EXISTS but cannot translate anything —
 * an empty cell or a value identical to the English key.
 *
 * These are the quietest failure mode in the system: the lookup "succeeds", nothing is
 * reported as missing, and the screen renders English. Warning once per key surfaces them
 * during normal development without flooding the console on re-render.
 *
 * `DEV` is statically false in a production build, so both the Set and the call site are
 * dropped by the bundler.
 */
const warnedKeys = new Set<string>()
function warnUnusableEntry(key: string, value: string): void {
  if (!DEV || warnedKeys.has(key)) return
  warnedKeys.add(key)
  const why = value ? 'value is identical to the English key' : 'value is empty'
  console.warn(`[lsd] "${key}" resolves to nothing — ${why}. Row exists in the wordlist but renders English.`)
}

/**
 * A wordlist LSD cell containing exactly this word is a DIRECTIVE, not a translation: it
 * means "this string should not appear in LSD mode at all" — the element renders empty.
 * Matched case-insensitively after trimming.
 *
 * ⚠️ Consequence worth knowing: a string whose intended LSD really is the Latin word
 * "remove" cannot be expressed — it would be deleted instead. No current row relies on
 * that; if one ever does, give it a different casing/spelling or change this token.
 */
const REMOVE_DIRECTIVE = 'remove'

/**
 * Resolve one English string against the wordlist.
 *
 * `hit` is what callers use to decide direction: a resolved string is LSD and must render
 * RTL; a MISSED string is still English and must stay LTR — otherwise the bidi algorithm
 * pushes the trailing `*` to the left of the word ("*Status" instead of "Status*"), and
 * untranslated Latin copy would sit mirrored inside an RTL element.
 */
export function resolve(english: string, lang: Lang): { text: string; hit: boolean } {
  if (lang !== 'lsd') return { text: english, hit: false }
  const key = normKey(english)
  if (!key) return { text: english, hit: false }
  const entry = ENTRIES.get(key)
  if (entry && entry.lsd) {
    // "remove" = drop this string from the UI entirely. Counts as resolved (the wordlist
    // answered for it), so it is NOT reported as a gap and gets no missing-marker.
    if (entry.lsd.trim().toLowerCase() === REMOVE_DIRECTIVE) {
      recordHit(key)
      return { text: '', hit: true }
    }
    // A row can exist and still be unusable: an identity pass-through translates nothing.
    // Reported to the console (dev only) because it is invisible to the miss counter.
    const bare = String(entry.lsd).replace(BIDI_MARKS, '').trim()
    if (bare === key) warnUnusableEntry(key, bare)
    recordHit(key)
    return { text: entry.lsd, hit: true }
  }
  // An entry whose LSD cell is EMPTY is a gap, not a translation — same handling as a row
  // that doesn't exist: keep the English text and report it.
  //
  // The missing-marker is NOT concatenated here. A miss returns ENGLISH text, and English
  // inside an RTL node makes the bidi algorithm throw leading/trailing punctuation to the
  // wrong end — "*Use your ITS credentials…" and ".Left unallocated" were both this bug.
  // `tx()` renders the marker as its own node and forces the fallback run LTR instead.
  if (entry) warnUnusableEntry(key, '')   // row present, cell blank
  recordMiss(english)
  return { text: english, hit: false }
}

/**
 * The language the app is currently showing, mirrored at module scope.
 *
 * Exists for helpers that are NOT React components and therefore cannot call `useT()` —
 * e.g. the module-level `familyMeta()` builders that compose a member's meta line. Kept in
 * sync by `applyRootLang()`, which runs at module load and on every language change.
 *
 * Prefer `useT()` inside components: it subscribes to the context and re-renders on
 * change. `tNow()` does not subscribe — it is safe here only because a language switch
 * re-renders the whole tree through the provider, so these helpers are re-invoked anyway.
 */
let currentLang: Lang = 'en'

/** Translate outside a component. See the caveat on {@link currentLang}. */
export const tNow = (english: string): string => translate(english, currentLang)

/** Text-only form of {@link resolve}, for attributes that cannot carry direction. */
export function translate(english: string, lang: Lang): string {
  return resolve(english, lang).text
}

/**
 * Names that ship with their own authored LSD text in the app's data, keyed by the English
 * form: miqaat `title` → `titleArabic`. Registered once at startup (see main.tsx) rather
 * than imported here, so this module keeps no dependency on the data layer.
 *
 * These are NOT translations this layer invented — they were authored alongside the
 * English and were already on screen as the Arabic subtitle. Registering them lets any
 * call site render the LSD name with just the English string in hand.
 */
const AUTHORED = new Map<string, string>()

export function registerAuthoredNames(pairs: Iterable<readonly [string, string]>): void {
  for (const [english, lsd] of pairs) {
    const key = normKey(english)
    const value = String(lsd ?? '').trim()
    if (key && value) AUTHORED.set(key, value)
  }
}

/**
 * Wordlist lookup with NO coverage side-effects.
 *
 * Used by callers that carry their own authored LSD text and therefore cannot produce a
 * gap — recording a miss for them would report a problem that does not exist on screen.
 * A hit is still recorded, because the entry genuinely was used.
 */
export function lookupLsd(english: string): string | undefined {
  const key = normKey(english)
  const entry = ENTRIES.get(key)
  if (!entry || !entry.lsd) return undefined
  recordHit(key)
  return entry.lsd.trim().toLowerCase() === REMOVE_DIRECTIVE ? '' : entry.lsd
}

/**
 * Is this string marked for DELETION in LSD?
 *
 * The wordlist owner writes the literal word `remove` in an LSD cell to mean "this string
 * should not appear in LSD at all". `resolve()` honours that by returning an empty string,
 * which blanks the TEXT — but an empty `<li>` still draws its bullet, an empty row still
 * takes its padding, and a separator either side of it still renders. "Remove completely"
 * means the ELEMENT goes, and only the call site can do that.
 *
 * So list-rendering sites filter on this first:
 *
 *   {RULES.filter((r) => !isRemoved(r)).map(…)}
 *
 * Deliberately distinct from `t(x) === ''`, which happens to be true today but conflates
 * two different states: a row marked `remove` (intentional deletion) and a row whose LSD
 * cell is merely EMPTY (an untranslated gap, which must fall back to English and stay
 * visible). Testing the directive directly keeps those apart.
 *
 * Language-independent by design — it reports what the WORDLIST says. Callers that render
 * in both languages gate on `isLsd` themselves; English never removes anything.
 */
export function isRemoved(english: string): boolean {
  const entry = ENTRIES.get(normKey(english))
  return !!entry && String(entry.lsd ?? '').trim().toLowerCase() === REMOVE_DIRECTIVE
}

/**
 * Inspect a key WITHOUT touching coverage state.
 *
 * The DOM scanner classifies hundreds of strings per scan and must not perturb the very
 * numbers it is measuring — `lookupLsd()` records a hit, `resolve()` records a miss.
 * This is the read-only view for tooling.
 */
export function inspectKey(english: string): { exists: boolean; value: string; identity: boolean } {
  const key = normKey(english)
  const entry = ENTRIES.get(key)
  if (!entry) return { exists: false, value: '', identity: false }
  const value = String(entry.lsd ?? '').replace(BIDI_MARKS, '').trim()
  return { exists: true, value, identity: value !== '' && value === key }
}

/** Design-PDF page reference for an English string, for the coverage report. Not used for lookup. */
export function pageFor(english: string): string | undefined {
  return ENTRIES.get(normKey(english))?.page
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  toggle: () => void
  /** Increments on every dev hot-swap of the wordlist; forces consumers to re-translate. */
  dictVersion: number
}

const LangContext = createContext<LangContextValue | null>(null)

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'lsd' ? 'lsd' : 'en'
  } catch {
    return 'en' // private mode / storage disabled — English is the safe default
  }
}

/**
 * Write language onto <html>. Direction is deliberately NOT written here.
 *
 * Sets `dir="rtl"` on <html> in LSD, `dir="ltr"` in English.
 *
 * ⚠️ HISTORY — this has flipped twice, so read before changing it again.
 * The app was first built LTR-only; LSD then ran WITHOUT a root `dir`, applying direction
 * only at the leaf via `tx()`, because full mirroring was explicitly not wanted. The
 * requirement has since changed to a genuinely right-to-left app, so the root carries
 * direction again.
 *
 * What that means in practice: `dir="rtl"` on the root reverses flex/grid item order, swaps
 * every logical property (`ms-*`, `pe-*`, `start-*`, `inset-inline-*`), and mirrors
 * `text-align: start`. That is now INTENDED. It also means any surviving PHYSICAL utility
 * (`ml-*`, `left-*`, `text-left`) will sit on the wrong side — those must be migrated to
 * logical equivalents, or explicitly kept physical with an `rtl:` variant when a visual
 * detail genuinely must not mirror.
 *
 * `data-lang="lsd"` is a separate hook, used by index.css for the Kanz al-Lulu font; it
 * carries no direction of its own.
 */
function applyRootLang(lang: Lang): void {
  currentLang = lang
  const html = document.documentElement
  // Always written explicitly, never just removed, so a stale value from an older build or
  // a previous session can't survive a toggle.
  if (lang === 'lsd') {
    html.setAttribute('dir', 'rtl')
    html.setAttribute('data-lang', 'lsd')
    html.setAttribute('lang', LSD_BCP47)
  } else {
    html.setAttribute('dir', 'ltr')
    html.removeAttribute('data-lang')
    html.setAttribute('lang', 'en')
  }
}

// Applied at MODULE LOAD, before React's first paint, so a persisted LSD choice never shows
// a frame of LTR/Latin before the provider's effect runs.
if (typeof document !== 'undefined') applyRootLang(readStoredLang())

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)
  // Re-render the whole tree when the wordlist is hot-swapped in dev, so an Excel edit
  // shows up immediately without a page reload.
  const [version, setVersion] = useState(dictVersion)
  useEffect(() => subscribeDict(() => setVersion(dictVersion)), [])

  // Keep <html> in sync on every language change (see applyRootLang above, which also runs
  // once at module load to prevent an LTR flash on a persisted LSD choice).
  useEffect(() => { applyRootLang(lang) }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* storage disabled — session-only */ }
  }, [])

  const toggle = useCallback(() => { setLang(lang === 'lsd' ? 'en' : 'lsd') }, [lang, setLang])

  const value = useMemo(
    () => ({ lang, setLang, toggle, dictVersion: version }),
    [lang, setLang, toggle, version],
  )
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within <LangProvider>')
  return ctx
}

/** Never-throwing accessor, for components that may render outside the provider. */
export function useLangSafe(): Lang {
  return useContext(LangContext)?.lang ?? 'en'
}

export interface TxProps {
  /** ReactNode, not string: a MISSED lookup renders the English text plus a separate
   *  <sup> gap marker, so the children can be an array rather than a bare string. */
  children: ReactNode
  dir?: 'rtl' | 'ltr'
  lang?: string
}

export function useT() {
  const ctx = useContext(LangContext)
  const lang = ctx?.lang ?? 'en'
  // `dictVersion` is an intentional dependency, not dead weight: it is what re-runs every
  // lookup after a live wordlist edit.
  const version = ctx?.dictVersion ?? 0
  return useMemo(() => {
    /** Translated string only — for attributes (placeholder, aria-label, title). */
    const t = (english: string): string => translate(english, lang)

    /**
     * Spread onto the element that ALREADY wraps the text:
     *   <p className="…" style={…} {...tx('Login to Continue')} />
     * No extra DOM node is introduced (this app positions text absolutely in places, so
     * an inserted <span> would shift layout). In English mode this returns only
     * `children`, leaving the element's attributes untouched.
     *
     * In LSD mode EVERY routed element gets `dir="rtl"`, including untranslated English
     * fallbacks — the page must read consistently right-to-left like an Arabic site, rather
     * than having stray left-aligned rows wherever a translation is still missing. The bidi
     * algorithm keeps the Latin run itself readable; only its alignment moves.
     */
    const tx = (english: string): TxProps => {
      const { text, hit } = resolve(english, lang)
      if (lang !== 'lsd') return { children: text }
      // HIT  → real LSD text, rendered RTL in the LSD language.
      // MISS → still English. Rendering it RTL reorders its own punctuation, so the node
      //        stays LTR/en and the gap marker is appended as a SEPARATE element rather
      //        than glued onto the string (which is what moved the `*` to the wrong side).
      // `isolateRuns` wraps each Latin/numeric run inside the value in its own <bdi>. That
      // has to happen HERE and not at the call site: a value like
      // `‏Registration 5 June 2026 نا روز … 11:59 وگے بند تھاسے.` is a single text node, so
      // nothing wrapping the element can isolate the Latin *inside* it. Doing it once, at
      // the point the string becomes children, covers all 1080 wordlist values at a stroke.
      if (hit) return { children: isolateRuns(text), dir: 'rtl', lang: LSD_BCP47 }
      return {
        children: MISSING_MARKER
          ? [text, createElement('sup', { key: 'lsd-gap', 'aria-hidden': 'true', className: 'lsd-gap' }, MISSING_MARKER)]
          : text,
        dir: 'ltr',
        lang: 'en',
      }
    }

    /**
     * DATA values — person names, city names, zone names, miqaat names, relations.
     *
     * Mechanically identical to `tx`; it exists as a separate name because the rule it
     * follows is the opposite of what it used to be, and a reader needs to see which one
     * a call site meant. Data used to be deliberately EXCLUDED from the lookup (so the
     * coverage report measured UI copy only, and a city name could never be starred).
     * The requirement now is that LSD shows no Latin script anywhere, data included — a
     * miqaat's English name must not survive alongside its LSD one — so data resolves
     * through the same wordlist and an unlisted value is reported as a gap like any other.
     */
    const td = tx
    /** String-only form of `td`, for attributes and composed strings. */
    const tdText = t

    /**
     * A data value that ships with its OWN authored LSD text alongside the English —
     * miqaat titles are the case this exists for: every entry in seed.ts carries both
     * `title` and `titleArabic`.
     *
     * In LSD the English name is not shown at all (no bilingual pair, no subtitle, no
     * parenthetical) — the LSD name replaces it in the same slot at the same size, so the
     * two languages occupy identical space.
     *
     * Resolution order, and nothing is ever invented:
     *   1. the wordlist, when it has a row — the Excel stays authoritative
     *   2. the authored value: the `authored` argument, else the startup registry
     *   3. English + the missing-marker, if somehow neither exists
     *
     * `authored` is optional because the registry already holds every miqaat name, so
     * most call sites only need the English string they already have.
     */
    const tdAuthored = (english: string, authored?: string): TxProps => {
      if (lang !== 'lsd') return { children: english }
      const fallback = authored?.trim() || AUTHORED.get(normKey(english))
      const value = lookupLsd(english) ?? (fallback || translate(english, lang))
      // Miqaat titles carry a Hijri year (`عشرہ مبارکہ ١٤٤٨ھ`) and sometimes a Latin token,
      // so they need the same per-run isolation as any other translated string.
      return { children: isolateRuns(value), dir: 'rtl', lang: LSD_BCP47 }
    }

    /** `dir`/`lang` for an element whose text comes from elsewhere (e.g. an <input>). */
    const dirProps: { dir?: 'rtl'; lang?: string } =
      lang === 'lsd' ? { dir: 'rtl', lang: LSD_BCP47 } : {}

    /**
     * `remove`-directive test, curried to the active language: English never deletes a
     * string, so call sites can filter unconditionally without an `isLsd` check of their own.
     */
    const removed = (english: string): boolean => lang === 'lsd' && isRemoved(english)

    return { lang, isLsd: lang === 'lsd', t, tx, td, tdText, tdAuthored, dirProps, removed }
  }, [lang, version])
}

// ─── Live wordlist reload (dev only) ──────────────────────────────────────────
// vite.config.ts watches RMS_Mumineen_LSD_wordlist_v4.xlsx and regenerates lsd.json on
// save; this accepts that JSON update and swaps the dictionary in place, so the page
// re-renders with the new strings WITHOUT a reload — you keep your screen, your scroll
// position and your app state. Accepting here also stops Vite from walking up the import
// graph and force-reloading the whole page instead.
if (import.meta.hot) {
  import.meta.hot.accept('./lsd.json', (mod) => {
    if (!mod) return
    loadEntries((mod as { default?: unknown }).default ?? mod)
    // The dictionary changed, so previously-recorded hits and misses no longer describe
    // it — a string that just gained an entry must stop being reported as a gap.
    resolvedKeys.clear()
    missedStrings.clear()
    dictVersion++
    dictListeners.forEach((fn) => fn())
    notifyCoverage()
    console.info(`[lsd] wordlist reloaded — ${ENTRIES.size} entries`)
  })
}
