/**
 * measure-type.mjs — optical-size measurement for the LSD face against the English face.
 *
 *   node scripts/measure-type.mjs            # table + verdict
 *   node scripts/measure-type.mjs --json     # machine-readable
 *
 * ── WHY A SCRIPT AND NOT AN EYEBALL ──────────────────────────────────────────────
 *
 * "Arabic looks smaller than Latin at the same px" is a statement about the FONT'S
 * INTERNAL METRICS, not about the px size, and the two are independent. A face declares an
 * em box and then draws glyphs at whatever proportion of it the designer chose; two faces
 * set at 16px can differ by 30% in rendered height with both being "16px". So the only
 * honest way to size-match them is to render a glyph and measure the ink.
 *
 * `actualBoundingBoxAscent` is the ink measurement: distance from the alphabetic baseline to
 * the top of the rendered glyphs, in px. It is what "optically the same height" means.
 *
 * We report it for a Latin control (Mulish) and for the LSD face, at the same nominal size,
 * plus the ratio. `size-adjust` on the @font-face is then tuned until the ratio is ~1.
 *
 * ── WHY IT ALSO CHECKS THE NETWORK ───────────────────────────────────────────────
 *
 * A locally INSTALLED font and a correctly self-hosted webfont are indistinguishable on the
 * developer's own machine — the text looks right either way, and that is exactly how a build
 * ships that renders as tofu for everyone else. So the run also asserts that the browser
 * actually fetched the font file over HTTP, which can only happen if @font-face resolved to
 * a URL rather than to the local install.
 */
import { chromium } from 'playwright'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PORT = 4322
const argv = process.argv.slice(2)
const JSON_OUT = argv.includes('--json')
const SWEEP = argv.includes('--sweep')
/** Candidate size-adjust values, spanning the brief's 125–135% window and either side of it. */
const CANDIDATES = [100, 110, 115, 120, 125, 130, 135, 140, 150]

/** The LSD face and the English control, as named in src/index.css. */
const LSD = 'Kanz al-Lulu'
const LATIN = 'Mulish'
/**
 * A family that cannot exist, used as a FALLBACK CONTROL.
 *
 * Canvas silently substitutes a default face for an unknown family — it does not throw and it
 * does not tell you. So a measurement of 'Kanz al-Lulu' looks perfectly plausible even when
 * the face never loaded and the browser quietly drew the Arabic in a system face instead.
 * Measuring the same strings under a deliberately absent family gives the substitution's
 * numbers; if the real family matches them exactly, the measurement is meaningless.
 */
const BOGUS = 'ZzNoSuchFace-9271'
const SIZES = [16]

/**
 * Probe strings chosen so each isolates ONE vertical metric.
 *
 * Measuring a whole sentence conflates them: `الاهليت` contains alef and lam, whose ascenders
 * reach ~1.09em, so its ink box matches a Latin ascender string almost exactly and the face
 * looks correctly sized. The shortfall lives in the BODY of the script — the height of a
 * letter with no ascender — which is the Arabic analogue of Latin x-height and is what the eye
 * reads as "size". Comparing `س` against `x` is the measurement that matters.
 */
const SAMPLES = [
  { key: 'x-height', latin: 'x', arabic: 'س', note: 'body height — what the eye reads as size' },
  { key: 'cap/ascender', latin: 'H', arabic: 'ا', note: 'cap height vs alef ascender' },
  { key: 'real copy', latin: 'Registration details', arabic: 'ني تفاصيل', note: 'representative run' },
]

function freePort() {
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${PORT}`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const pid of new Set([...out.matchAll(/\s(\d+)\s*$/gm)].map((m) => m[1]))) {
      if (pid !== '0') try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }) } catch {}
    }
  } catch { /* nothing listening — the good case */ }
}

async function serve() {
  freePort()
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('dev server did not start')), 60_000)
    const w = (b) => { if (String(b).includes(String(PORT))) { clearTimeout(t); setTimeout(ok, 1500) } }
    proc.stdout.on('data', w); proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); fail(new Error(`dev server exited (${c})`)) })
  })
  return proc
}

/**
 * Runs in the page. Measures ink extents via canvas.
 *
 * The canvas 2D context resolves `font` through the SAME font set as the document, so a face
 * declared by @font-face and already loaded is measurable here — no DOM layout needed.
 */
const PROBE = ({ lsd, latin, bogus, samples, sizes }) => {
  const cv = document.createElement('canvas')
  const cx = cv.getContext('2d')
  const measure = (family, text, px) => {
    cx.font = `${px}px "${family}"`
    const m = cx.measureText(text)
    return {
      ascent: +m.actualBoundingBoxAscent.toFixed(2),
      descent: +m.actualBoundingBoxDescent.toFixed(2),
      width: +m.width.toFixed(2),
    }
  }
  const rows = []
  for (const px of sizes) {
    for (const s of samples) {
      const l = measure(latin, s.latin, px)
      const a = measure(lsd, s.arabic, px)
      const ctrl = measure(bogus, s.arabic, px)
      rows.push({
        px,
        key: s.key,
        note: s.note,
        latin: l,
        lsd: a,
        control: ctrl,
        // True when the LSD face is indistinguishable from the substituted default — i.e. the
        // webfont is NOT being used and every other number in this row is about a system face.
        suspectFallback: a.ascent === ctrl.ascent && a.width === ctrl.width,
        ratio: +(a.ascent / l.ascent).toFixed(3),
      })
    }
  }
  return { rows, loaded: document.fonts.check(`16px "${lsd}"`) }
}

const server = await serve()
const browser = await chromium.launch()
let result
const fontRequests = []

try {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } })
  const page = await ctx.newPage()
  // Record every font file the page pulls over HTTP. A self-hosted face MUST appear here;
  // a face resolved from a local install never will.
  page.on('response', (r) => {
    const u = r.url()
    if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) fontRequests.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status() })
  })
  // `domcontentloaded`, NOT `networkidle`: the dev server holds an HMR websocket open and the
  // PWA registers a service worker, so the network never actually goes idle here and the wait
  // hangs until the timeout.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // Force both faces to be exercised, then let the font set settle. Bounded: `fonts.load`
  // rejects for an unknown family on some builds and never settles on others, and a hung
  // measurement is worse than a reported one. The PROBE re-checks `fonts.check` anyway.
  await page.evaluate(
    async ({ lsd, latin }) => {
      const tryLoad = (f) => document.fonts.load(`16px "${f}"`).catch(() => {})
      await Promise.race([
        Promise.all([tryLoad(lsd), tryLoad(latin)]).then(() => document.fonts.ready).then(() => {}),
        new Promise((r) => setTimeout(r, 8000)),
      ])
    },
    { lsd: LSD, latin: LATIN },
  )
  result = await page.evaluate(PROBE, { lsd: LSD, latin: LATIN, bogus: BOGUS, samples: SAMPLES, sizes: SIZES })

  // `--sweep` registers the same font file under one synthetic family per candidate
  // size-adjust and measures them all in a single page. Editing the CSS and re-running the
  // whole harness per candidate costs minutes each and tempts you to stop at the first value
  // that looks plausible; a table makes the trade-off between body height and ascender
  // overshoot visible at a glance, which is the actual decision here.
  if (SWEEP) {
    result.sweep = await page.evaluate(
      async ({ candidates, latin, samples }) => {
        const cv = document.createElement('canvas')
        const cx = cv.getContext('2d')
        // Measured at 64px, not 16px. Ink extents come back rounded to whole pixels, so at
        // 16px the ratios quantise to steps of ~0.08 and neighbouring candidates read as
        // identical. Ratios are scale-invariant, so measuring large and dividing is the same
        // number with four times the resolution.
        const ink = (family, text, px = 64) => {
          cx.font = `${px}px "${family}"`
          return +cx.measureText(text).actualBoundingBoxAscent.toFixed(2)
        }
        const rows = []
        for (const pct of candidates) {
          const fam = `KanzSweep${pct}`
          const face = new FontFace(fam, 'url(/fonts/kanz-al-lulu.woff2)', {
            sizeAdjust: `${pct}%`, ascentOverride: '105%', descentOverride: '35%', lineGapOverride: '0%',
          })
          await face.load()
          document.fonts.add(face)
          const row = { pct }
          for (const s of samples) row[s.key] = +(ink(fam, s.arabic) / ink(latin, s.latin)).toFixed(3)
          rows.push(row)
        }
        return rows
      },
      { candidates: CANDIDATES, latin: LATIN, samples: SAMPLES },
    )
  }
  await ctx.close()
} finally {
  await browser.close()
  server.kill()
}

const payload = { ...result, fontRequests }

if (JSON_OUT) {
  console.log(JSON.stringify(payload, null, 2))
} else {
  console.log(`\n  face loaded in document : ${result.loaded ? 'yes' : 'NO — falling back'}`)
  const self = fontRequests.filter((r) => /kanz/i.test(r.url))
  console.log(`  fetched over HTTP       : ${self.length ? self.map((r) => `${r.url} (${r.status})`).join(', ') : 'NOTHING — not self-hosted, resolving from a local install'}`)
  console.log('')
  for (const r of result.rows) {
    console.log(`  ${r.px}px · ${r.key}  — ${r.note}`)
    console.log(`    ${LATIN.padEnd(14)} ascent ${String(r.latin.ascent).padStart(6)}`)
    console.log(`    ${LSD.padEnd(14)} ascent ${String(r.lsd.ascent).padStart(6)}${r.suspectFallback ? '   ⚠ IDENTICAL TO FALLBACK CONTROL — face not in use' : ''}`)
    console.log(`    ratio LSD/Latin        : ${r.ratio}   (target 1.00)`)
    console.log('')
  }
  if (result.sweep) {
    const keys = SAMPLES.map((s) => s.key)
    console.log('  size-adjust sweep — ratio of LSD ink to Latin ink (1.00 = optically equal)')
    console.log(`    ${'size-adjust'.padEnd(13)}${keys.map((k) => k.padStart(14)).join('')}`)
    for (const row of result.sweep) {
      console.log(`    ${`${row.pct}%`.padEnd(13)}${keys.map((k) => String(row[k]).padStart(14)).join('')}`)
    }
    console.log('')
  }
}
