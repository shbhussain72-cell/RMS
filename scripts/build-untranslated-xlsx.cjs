/**
 * Collect every user-visible English string that has NO usable LSD translation yet, and
 * write it to a fresh workbook for translation.
 *
 * Two sources, because they miss different things:
 *
 *   1. DATA VALUES from src/data/seed.ts — person names, relations, genders, city names
 *      and regions, zone names, miqaat titles, and the date/time labels. These never
 *      appear as literals in JSX (they come from the store), so a source scan cannot see
 *      them, yet they are on screen constantly.
 *   2. UI COPY from the source scan — the same detector the build gate uses, so the two
 *      always agree on what counts as an outstanding string.
 *
 * Anything already carrying a non-empty LSD value in lsd.json is EXCLUDED, so the output
 * is purely what still needs work. Rows with an existing-but-empty cell are included and
 * marked, since those need typing too.
 *
 * Output columns match the master wordlist (`Page | English name | LSD name`) plus a
 * `Category` column, so filled rows can be pasted straight back into the master list.
 *
 * Usage: node scripts/build-untranslated-xlsx.cjs
 */
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'RMS_untranslated_TO_TRANSLATE.xlsx')

const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/lsd.json'), 'utf8'))
const norm = (s) => String(s ?? '').replace(/[۞۩]/g, '').replace(/\s+/g, ' ').trim()
/** Already translated = a row exists AND its LSD cell is non-empty. */
const translated = new Set(
  Object.entries(dict).filter(([k, v]) => k !== '//' && v.lsd).map(([k]) => norm(k)),
)
const knownBlank = new Set(
  Object.entries(dict).filter(([k, v]) => k !== '//' && !v.lsd).map(([k]) => norm(k)),
)

const rows = []
const seen = new Set()
const add = (category, english, page = '') => {
  const s = norm(english)
  if (!s || s.length < 1) return
  if (translated.has(s)) return           // already has LSD — nothing to do
  if (seen.has(s)) return
  seen.add(s)
  rows.push({
    Page: page,
    'English name': s,
    'LSD name': '',
    Category: category + (knownBlank.has(s) ? ' (row exists, cell empty)' : ''),
  })
}

// ── 1. data values, read straight out of the seed file ────────────────────────
const seed = fs.readFileSync(path.join(ROOT, 'src/data/seed.ts'), 'utf8')
const grab = (re, fn) => { let m; while ((m = re.exec(seed))) fn(m) }

grab(/name: '([^']+)', relation: '([^']+)', gender: '([^']+)'/g, (m) => {
  add('Person name', m[1], 'seed.ts family')
  add('Relationship', m[2], 'seed.ts family')
  add('Gender', m[3], 'seed.ts family')
})
grab(/\{ id: '[^']+', name: '([^']+)', region: '([^']+)', type: '([^']+)' \}/g, (m) => {
  add('City name', m[1], 'seed.ts liveCities')
  add('Region / country', m[2], 'seed.ts liveCities')
})
grab(/title: '([^']+)',\s*\n\s*titleArabic:/g, (m) => add('Miqaat name', m[1], 'seed.ts miqaats'))
grab(/dateLabel: '([^']+)'/g, (m) => add('Date label', m[1], 'seed.ts miqaats'))
grab(/timeLabel: '([^']+)'/g, (m) => add('Time label', m[1], 'seed.ts miqaats'))
grab(/deadlineLabel: '([^']+)'/g, (m) => add('Deadline text', m[1], 'seed.ts miqaats'))
grab(/account = \{\s*\n\s*name: '([^']+)'/g, (m) => add('Person name', m[1], 'seed.ts account'))

// Zone names are GENERATED (`Zone A - Main Hall`), so they are rebuilt here rather than
// matched — the literals do not exist anywhere in the source.
const suffixes = (seed.match(/const ZONE_SUFFIXES[^=]*=\s*\[([\s\S]*?)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
for (let i = 0; i < 22; i++) {
  const letter = String.fromCharCode(65 + (i % 26))
  const suffix = suffixes.length ? suffixes[i % suffixes.length] : ''
  add('Zone name', suffix ? `Zone ${letter} - ${suffix}` : `Zone ${letter}`, 'seed.ts genZones')
}
for (const s of suffixes) add('Zone suffix', s, 'seed.ts ZONE_SUFFIXES')

// Calendar vocabulary — rendered by the timeline/calendar, never present as literals.
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_MIN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HIJRI = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Akhir', 'Jumada al-Ula',
  'Jumada al-Ukhra', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah']
DAYS_LONG.forEach((d) => add('Day name', d, 'calendar'))
DAYS_SHORT.forEach((d) => add('Day (short)', d, 'calendar'))
DAYS_MIN.forEach((d) => add('Day (min)', d, 'calendar'))
MONTHS_LONG.forEach((m) => add('Month name', m, 'calendar'))
MONTHS_SHORT.forEach((m) => add('Month (short)', m, 'calendar'))
HIJRI.forEach((m) => add('Hijri month', m, 'calendar'))
;['AM', 'PM', 'IST', 'Today', 'Yesterday', 'Tomorrow', 'Earlier'].forEach((x) => add('Time word', x, 'calendar'))
;['DAYS', 'HOURS', 'MIN', 'SEC', 'Days', 'Hours', 'Min', 'Sec', 'd', 'h', 'm left']
  .forEach((x) => add('Countdown unit', x, 'countdown'))

// ── 2. UI copy still outstanding, from the same scan the gate uses ────────────
const NOISE = [
  /^[MmLlHhVvCcSsQqTtAaZz][\s\d.,-]/, /^[\d\s.,%#:/-]+$/,
  /serif|sans-serif|system-ui|Segoe UI|Amiri|Marcellus|Mulish|Kanz/i,
  /^(https?:)?\//, /^#[0-9a-fA-F]{3,8}$/,
  /rgba?\(|linear-gradient|url\(|data:|calc\(|var\(/i, /^[a-z-]+:\s/,
  /(^|\s)(flex|grid|absolute|relative|rounded|border|bg-|text-\[|size-\[|mt-\[|px-\[|py-\[|w-\[|h-\[)/,
  /^\p{Lu}?[a-z]+([A-Z][a-z]+)+$/u, /^\d{1,2}:\d{2}/,
]
const FRAGMENT = /\s(a|an|the|in|on|to|of|and|or|for|with|is|are|at|by|your|their)$/i
const isCopy = (s) => s.length >= 3 && s.length <= 200 && /[A-Za-z]{2}/.test(s) && /^[A-Z]/.test(s)
  && (s.match(/[A-Za-z]/g) || []).length / s.length > 0.5
  && !NOISE.some((re) => re.test(s)) && !FRAGMENT.test(s)

const walk = (d, o = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (e.name !== 'i18n') walk(p, o) }
    else if (/\.tsx$/.test(e.name)) o.push(p)
  }
  return o
}
for (const file of walk(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const near = (i, dir) => {
    for (let j = i + dir; j >= 0 && j < lines.length; j += dir) {
      const s = lines[j].trim()
      if (s && !/^(\/\/|\*|\/\*)/.test(s)) return s
    }
    return ''
  }
  lines.forEach((raw, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(raw)) return
    const push = (t) => { if (isCopy(norm(t))) add('UI copy', t, `${rel}:${i + 1}`) }
    for (const m of raw.matchAll(/\b(?:tx|t|td|tdText|tdAuthored)\(\s*'((?:[^'\\]|\\.){3,}?)'/g)) {
      push(m[1].replace(/\\(['"\\])/g, '$1'))
    }
    for (const m of raw.matchAll(/>([^<>{}\n]{3,})</g)) push(m[1])
    const solo = raw.trim()
    if (solo && !/[<>{}=]/.test(solo) && near(i, -1).endsWith('>') && near(i, 1).startsWith('<')) push(solo)
    for (const m of raw.matchAll(
      /(?:label|title|placeholder|aria-label|desc|subtitle|sub|text|message|heading|cta|status|body|hint|caption|empty|error)\s*[:=]\s*'([^']{3,})'/g,
    )) push(m[1])
  })
}

// ── write ─────────────────────────────────────────────────────────────────────
const ORDER = ['Person name', 'Relationship', 'Gender', 'City name', 'Region / country',
  'Zone name', 'Zone suffix', 'Miqaat name', 'Date label', 'Time label', 'Deadline text',
  'Day name', 'Day (short)', 'Day (min)', 'Month name', 'Month (short)', 'Hijri month',
  'Time word', 'Countdown unit', 'UI copy']
const rank = (c) => { const i = ORDER.findIndex((o) => c.startsWith(o)); return i < 0 ? 99 : i }
rows.sort((a, b) => rank(a.Category) - rank(b.Category) || a['English name'].localeCompare(b['English name']))

const wb = XLSX.utils.book_new()
const ws = XLSX.utils.json_to_sheet(rows, { header: ['Page', 'English name', 'LSD name', 'Category'] })
ws['!cols'] = [{ wch: 28 }, { wch: 70 }, { wch: 40 }, { wch: 30 }]
XLSX.utils.book_append_sheet(wb, ws, 'To translate')

const summary = Object.entries(rows.reduce((m, r) => {
  const k = r.Category.replace(' (row exists, cell empty)', '')
  m[k] = (m[k] ?? 0) + 1; return m
}, {})).sort((a, b) => rank(a[0]) - rank(b[0])).map(([Category, Count]) => ({ Category, Count }))
summary.push({ Category: 'TOTAL', Count: rows.length })
const ws2 = XLSX.utils.json_to_sheet(summary)
ws2['!cols'] = [{ wch: 30 }, { wch: 10 }]
XLSX.utils.book_append_sheet(wb, ws2, 'Summary')

XLSX.writeFile(wb, OUT)
console.log(`${rows.length} untranslated strings → ${path.basename(OUT)}`)
for (const s of summary) console.log(`  ${String(s.Count).padStart(4)}  ${s.Category}`)
