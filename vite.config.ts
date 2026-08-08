import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
// @ts-expect-error — plain .mjs build script, no type declarations by design
import { buildLsdDict, XLSX_PATH } from './scripts/build-lsd-dict.mjs'

/**
 * Live LSD wordlist → UI.
 *
 * Watches `RMS_Mumineen_LSD_wordlist_v4.xlsx` and regenerates `src/i18n/lsd.json` the
 * moment it is saved. Vite then HMR-updates the JSON module, and `src/i18n/index.tsx`
 * swaps the dictionary in place (see its `import.meta.hot` block), so translations change
 * in the running page without a rebuild, a restart, or losing where you were.
 *
 * Dev only (`apply: 'serve'`). Production builds regenerate via the `build:lsd` script
 * already chained into `npm run build`.
 *
 * Excel saves atomically — it writes a temp file then renames over the original — so a
 * single Ctrl+S can surface as unlink+add rather than change, and the file may be locked
 * for a moment afterwards. Hence: all three events are handled, the path is re-added after
 * an unlink, saves are debounced, and the read is retried.
 */
function lsdWordlistWatcher(): Plugin {
  return {
    name: 'lsd-wordlist-watcher',
    apply: 'serve',
    configureServer(server) {
      const target = XLSX_PATH as string
      server.watcher.add(target)

      let timer: ReturnType<typeof setTimeout> | undefined
      let building = false

      const rebuild = async () => {
        if (building) return
        building = true
        try {
          const r = await buildLsdDict({ retries: 6, retryDelayMs: 250 })
          server.config.logger.info(
            `\x1b[32m[lsd]\x1b[0m wordlist saved → ${r.count} entries regenerated`,
            { timestamp: true },
          )
          if (r.emptyLsd.length) {
            server.config.logger.warn(
              `\x1b[33m[lsd]\x1b[0m ${r.emptyLsd.length} entr${r.emptyLsd.length === 1 ? 'y has' : 'ies have'} an empty LSD value (falling back to English)`,
              { timestamp: true },
            )
          }
        } catch (err) {
          // A malformed edit must not kill the dev server. The previous good lsd.json is
          // still on disk and still loaded, so the app keeps working while you fix the cell.
          const message = err instanceof Error ? err.message : String(err)
          server.config.logger.error(
            `\x1b[31m[lsd]\x1b[0m wordlist rejected — dictionary left unchanged:\n  ${message}`,
            { timestamp: true },
          )
          server.ws.send({
            type: 'error',
            err: { message: `[lsd] wordlist rejected — dictionary unchanged\n\n${message}`, stack: '' },
          })
        } finally {
          building = false
        }
      }

      const onFsEvent = (file: string) => {
        if (file !== target) return
        // Re-add: after an atomic-save unlink chokidar can stop tracking the inode.
        server.watcher.add(target)
        clearTimeout(timer)
        timer = setTimeout(rebuild, 200)
      }

      server.watcher.on('change', onFsEvent)
      server.watcher.on('add', onFsEvent)
      server.watcher.on('unlink', onFsEvent)
    },
  }
}

/**
 * Staging file for dictionary edits made in the browser. Repo root, beside the .xlsx it will
 * eventually be pasted into, and git-ignored: it is a scratchpad between "I typed a
 * translation" and "I updated the wordlist", not a second source of truth.
 */
const OVERRIDES_PATH = resolvePath(fileURLToPath(new URL('.', import.meta.url)), 'wordlist-overrides.json')

/** Shape on disk: `{ "<english>": { "lsd": "<string>", "at": "<iso>" } }`. */
function readOverrides(): Record<string, { lsd: string; at: string }> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, { lsd: string; at: string }>
  } catch {
    return {}
  }
}

/**
 * Dev-only read/write endpoint for the dictionary editor.
 *
 * The editor runs in the browser and the staging file lives on disk, so something has to
 * bridge them. This is that bridge and nothing more: it reads and writes ONE path, it is
 * `apply: 'serve'`, and it never touches `src/i18n/lsd.json` or the .xlsx — those stay
 * generated-from and authoritative respectively, which is the whole reason the staging file
 * exists instead of the editor writing the wordlist directly.
 */
function lsdOverridesApi(): Plugin {
  return {
    name: 'lsd-overrides-api',
    apply: 'serve',
    configureServer(server) {
      /**
       * The staged edits as an .xlsx patch, matching the wordlist's own sheet and columns so
       * the rows paste straight in. Generated HERE, on the server, and not in the browser:
       * importing the `xlsx` package from a dev-only React component is exactly the shape of
       * leak that put the Remarks tool into a production bundle once already, and a
       * ~400kB spreadsheet library is not something to risk on tree-shaking.
       *
       * It is a patch to paste, never a merge — this endpoint reads the wordlist only to look
       * up each row's existing Page value, and writes nothing back to it.
       */
      server.middlewares.use('/__lsd/patch.xlsx', async (_req, res) => {
        const pending = readOverrides()
        const XLSX = await import('xlsx')
        const pageOf = new Map<string, string>()
        try {
          const wb = XLSX.readFile(XLSX_PATH as string)
          const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Word List'], { header: 1, defval: '' })
          for (const r of rows.slice(1)) {
            const english = String(r[1] ?? '').replace(/\s+/g, ' ').trim()
            if (english) pageOf.set(english, String(r[0] ?? ''))
          }
        } catch { /* a patch is still useful without page numbers */ }

        const aoa: string[][] = [['Page', 'English name', 'LSD name']]
        for (const [english, v] of Object.entries(pending)) {
          aoa.push([pageOf.get(english) ?? '', english, v.lsd])
        }
        const out = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(aoa), 'Word List')
        const buf: Buffer = XLSX.write(out, { type: 'buffer', bookType: 'xlsx' })
        res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        res.setHeader('content-disposition', 'attachment; filename="wordlist-patch.xlsx"')
        res.end(buf)
      })

      server.middlewares.use('/__lsd/overrides', (req, res) => {
        res.setHeader('content-type', 'application/json')
        if (req.method === 'GET') {
          res.end(JSON.stringify(readOverrides()))
          return
        }
        if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          try {
            const next = JSON.parse(body || '{}') as Record<string, { lsd: string; at: string }>
            // An empty map DELETES the file rather than leaving `{}` behind: the build gate
            // below reports "pending edits" by content, and a stale empty object is a file
            // sitting in the repo root claiming work that is already done.
            if (!Object.keys(next).length) { try { unlinkSync(OVERRIDES_PATH) } catch { /* already gone */ } }
            else writeFileSync(OVERRIDES_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
            server.config.logger.info(
              `\x1b[36m[lsd]\x1b[0m ${Object.keys(next).length} pending dictionary edit(s)`,
              { timestamp: true },
            )
            res.end(JSON.stringify({ ok: true, count: Object.keys(next).length }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
        })
      })
    },
  }
}

/**
 * Refuse to build while dictionary edits are still staged.
 *
 * The staging file exists so a translation can be tried in the running app before it is
 * committed to the wordlist. That is only safe if it cannot be forgotten: an override that
 * ships is a translation the .xlsx has never heard of, invisible to `build:lsd`, and gone
 * the moment someone regenerates. So a non-empty file fails the build and names the way out.
 */
function blockPendingOverrides(): Plugin {
  return {
    name: 'block-pending-overrides',
    apply: 'build',
    buildStart() {
      const pending = Object.keys(readOverrides())
      if (!pending.length) return
      const shown = pending.slice(0, 8).map((k) => `  - ${k}`)
      if (pending.length > 8) shown.push(`  ...and ${pending.length - 8} more`)
      this.error(
        [
          `${pending.length} dictionary edit(s) are still staged in wordlist-overrides.json:`,
          ...shown,
          '',
          `They exist only on this machine and would not survive \`npm run build:lsd\`.`,
          `Export the Excel patch from the dictionary editor, paste it into`,
          `  ${XLSX_PATH}`,
          `then clear the staged edits.`,
        ].join('\n'),
      )
    },
  }
}

/**
 * Fail the build loudly if the wordlist source is missing.
 *
 * `build:lsd` is chained into `npm run build`, so a production build regenerates
 * `src/i18n/lsd.json` from the .xlsx. On a CI runner (Vercel builds on Linux) that file
 * is only present if it is committed and the path case matches. Without this guard a
 * missing or mis-cased path can surface as an empty dictionary and a silently
 * all-English LSD build rather than a failed deploy.
 */
function requireWordlistSource(): Plugin {
  return {
    name: 'require-wordlist-source',
    apply: 'build',
    buildStart() {
      const target = XLSX_PATH as string
      if (!existsSync(target)) {
        this.error(
          `LSD wordlist source not found at:\n  ${target}\n\n` +
            `The production build regenerates src/i18n/lsd.json from this file.\n` +
            `Check that it is committed (git ls-files) and that the path case matches — ` +
            `Windows is case-insensitive, Linux CI is not.`,
        )
      }
    },
  }
}

export default defineConfig({
  server: { port: Number(process.env.PORT) || 3000 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // The bundle is comfortably over Vite's 500 kB default warning threshold and that is
    // an accepted trade for now. Raised rather than silenced so a genuine size regression
    // still surfaces.
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split the largest third-party deps out of the app chunk so a code change does not
        // invalidate the vendor bundle in reviewers' caches on every deploy.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  plugins: [
    requireWordlistSource(),
    blockPendingOverrides(),
    lsdOverridesApi(),
    lsdWordlistWatcher(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      // Precaching the woff2/woff faces matters more than usual here: without Kanz al-Lulu
      // the LSD UI falls back to a face with different metrics, so the font is functional
      // rather than decorative.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        // `**/*.png` sweeps in `figma/miqaat-card-bg.png`, which is 3.84 MB — past workbox's 2 MiB
        // per-asset precache limit, and a build error rather than a warning. It is a decorative
        // card background used on four screens and is fine to fetch on demand; raising the limit
        // instead would put 3.84 MB into every install for artwork nobody waits on. The fonts,
        // which are the reason this glob exists, are unaffected.
        globIgnores: ['**/figma/miqaat-card-bg.png'],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Miqaat Registration',
        short_name: 'Miqaat',
        description: 'Ashara Mubaraka participant registration portal',
        theme_color: '#15402f',
        background_color: '#fffdf8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
