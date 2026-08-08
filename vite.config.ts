import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { existsSync } from 'node:fs'
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
