/**
 * Addendum workbook: what is STILL not translated after the v4 merge.
 *
 * Three sources the earlier pass missed:
 *   1. src/tour/steps.ts — the in-app guide. Scanners walked only `.tsx`, so every guide
 *      title/description/note was invisible to both the gate and the extraction script.
 *   2. Rows present in the wordlist whose LSD value is still LATIN (English text sitting
 *      in the LSD column), which renders as English even though the row "exists".
 *   3. Rows with an empty LSD cell.
 *
 * Deliberately intentional Latin (ITS, PDF, zone, AM/PM/IST, unit letters) is excluded —
 * those are loanwords/units by decision, not gaps.
 */
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'RMS_remaining_TO_TRANSLATE.xlsx')
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/i18n/lsd.json'), 'utf8'))
const norm = (s) => String(s ?? '').replace(/[۞۩]/g, '').replace(/\s+/g, ' ').trim()

const hasArabic = (s) => /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(s)
const INTENTIONAL = new Set(['its', 'its id', 'login', 'pdf', 'zone', 'mm/dd/yyyy', 'sms', 'otp',
  'ok', 'am', 'pm', 'ist', 'd', 'h', 'm', 's'])

const rows = []
const seen = new Set()
const add = (category, english, current, page) => {
  const s = norm(english)
  if (!s || seen.has(s)) return
  seen.add(s)
  rows.push({ Page: page, 'English name': s, 'LSD name': '', 'Current value': current || '', Category: category })
}

// 1. guide / tour content (and any other .ts holding UI copy)
const walkTs = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'i18n') walkTs(p, out) }
    else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p)
  }
  return out
}
for (const f of walkTs(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  const src = fs.readFileSync(f, 'utf8')
  for (const field of ['title', 'description', 'note', 'cta', 'label', 'body', 'message']) {
    const re = new RegExp(field + ":\\s*'((?:[^'\\\\]|\\\\.)*?)'", 'g')
    let m
    while ((m = re.exec(src))) {
      const s = norm(m[1].replace(/\\'/g, "'"))
      if (s.length < 3 || !/^[A-Z]/.test(s) || !/[A-Za-z]{2}/.test(s)) continue
      const e = dict[s]
      if (e && e.lsd) continue
      add(rel.includes('tour') ? 'Guide / walkthrough' : 'UI copy (.ts file)', s, e ? e.lsd : '', rel)
    }
  }
}

// 2 + 3. wordlist rows that are blank, or still hold Latin text
for (const [k, v] of Object.entries(dict)) {
  if (k === '//') continue
  const val = String(v.lsd ?? '').trim()
  if (!val) { add('Empty LSD cell', k, '', v.page || ''); continue }
  if (val.toLowerCase() === 'remove') continue
  if (!/[A-Za-z]/.test(val) || hasArabic(val)) continue
  if (INTENTIONAL.has(val.toLowerCase())) continue
  if (/^[\d\s.,]+\s*(kb|mb|gb|px|%)$/i.test(val) || /^[\d\s./:-]+$/.test(val)) continue
  add('LSD cell still English', k, val, v.page || '')
}

rows.sort((a, b) => a.Category.localeCompare(b.Category) || a['English name'].localeCompare(b['English name']))

const wb = XLSX.utils.book_new()
const ws = XLSX.utils.json_to_sheet(rows, { header: ['Page', 'English name', 'LSD name', 'Current value', 'Category'] })
ws['!cols'] = [{ wch: 26 }, { wch: 80 }, { wch: 40 }, { wch: 26 }, { wch: 24 }]
XLSX.utils.book_append_sheet(wb, ws, 'Remaining')
XLSX.writeFile(wb, OUT)

const per = rows.reduce((m, r) => (m[r.Category] = (m[r.Category] ?? 0) + 1, m), {})
console.log(`${rows.length} remaining → ${path.basename(OUT)}`)
for (const [k, v] of Object.entries(per)) console.log(`  ${String(v).padStart(3)}  ${k}`)
