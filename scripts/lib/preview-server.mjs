/**
 * preview-server.mjs — start and STOP a `vite preview`, without leaving one behind.
 *
 * ── WHY THIS IS SHARED CODE AND NOT A LINE IN EACH SUITE ─────────────────────────────
 *
 * `check-bidi` was "the slow suite" for several sessions. It was not slow. It completed its
 * measurement in about six minutes and then never exited, so anything running it under a
 * timeout killed it after the work was done and reported a timeout, and anyone running it by
 * hand sat at a blank prompt until they gave up. It was fixed in place, with a long docblock.
 *
 * `check-cold-load` then did exactly the same thing on the 11 Aug completion sweep: it printed
 * `every route survives a saved session from an older build` and was killed at 900 seconds. Its
 * teardown was `server.kill()`, the same line `check-bidi` had.
 *
 * A fix that lives in one suite fixes one suite. Four suites in this repo spawn a preview
 * server; this is the one place that knows how to stop one.
 *
 * ── WHY `kill()` DOES NOT KILL IT ────────────────────────────────────────────────────
 *
 * Two things combine, and either alone is enough to hang the process:
 *
 *   1. vite is spawned with `shell: true`, so the child is cmd.exe and the real node server is
 *      ITS child. `proc.kill()` kills the shell and orphans the server, which goes on holding
 *      the port — which is why these suites needed a port-freeing routine at all.
 *   2. The orphan's stdout is piped and has a listener attached, so the event loop never
 *      empties and node never exits on its own, even with no work left.
 *
 * So: kill the TREE, then destroy the pipes, then unref. And the caller still has to reach an
 * explicit exit — see `finish()`.
 */
import { spawn, execSync } from 'node:child_process'
import { createServer } from 'node:net'

/** A port nothing is listening on, chosen by binding zero and reading it back. */
export async function freePort() {
  return new Promise((ok) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)) })
  })
}

/**
 * Kill whatever is LISTENING on `port` before binding it.
 *
 * `--strictPort` makes vite exit rather than quietly move, which is the behaviour these suites
 * want — a checker that silently measured a stale server would be worse than one that fails.
 * The cost is that one orphan from a killed run breaks every subsequent run, so the port is
 * cleared first and the suite stays re-runnable without a manual taskkill.
 *
 * No `-p tcp` on netstat: that flag restricts output to IPv4 and vite binds `[::1]`, so the
 * filtered form finds nothing and the port looks free while the socket is very much held.
 */
export function clearPort(port) {
  if (process.platform !== 'win32') return
  try {
    const out = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const pid of new Set([...out.matchAll(/\s(\d+)\s*$/gm)].map((m) => m[1]))) {
      if (pid !== '0') try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }) } catch { /* gone */ }
    }
  } catch {
    // findstr exits 1 when nothing matches — that is the good case.
  }
}

/**
 * Kill the process TREE and release everything holding the event loop open.
 *
 * Safe to call twice, and safe to call on a process that already died: every step is guarded,
 * because a teardown that throws leaves exactly the orphan it was written to prevent.
 */
export function stopServer(proc) {
  if (!proc?.pid) return
  if (process.platform === 'win32') {
    // /T takes the children with it — the entire point. /F because vite behind a shell does not
    // respond to a polite signal here.
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' }) } catch { /* already gone */ }
  }
  try { proc.kill() } catch { /* already gone */ }
  // Even a killed child leaves its pipes referenced, and a referenced pipe is enough on its own
  // to keep node alive with no work to do.
  proc.stdout?.destroy()
  proc.stderr?.destroy()
  try { proc.unref() } catch { /* already gone */ }
}

/**
 * Start `vite preview` on `port` and resolve once it is answering.
 *
 * `env` is merged rather than replaced so a caller can add VITE_* flags without losing PATH.
 */
export async function startPreview(port, { cwd, env = {} } = {}) {
  clearPort(port)
  const proc = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env },
  })
  await new Promise((ok, bad) => {
    const t = setTimeout(() => { stopServer(proc); bad(new Error('vite preview did not start within 90s')) }, 90_000)
    const w = (b) => { if (String(b).includes(String(port))) { clearTimeout(t); setTimeout(ok, 1200) } }
    proc.stdout.on('data', w)
    proc.stderr.on('data', w)
    proc.on('exit', (c) => { clearTimeout(t); bad(new Error(`vite preview exited (${c}) — is there a dist/ to serve?`)) })
  })
  return proc
}

/**
 * Stop the server and EXIT, in that order.
 *
 * `process.exitCode = n` and falling off the end is the tidier idiom and is what several of
 * these suites used. It only works if the loop empties, and after a spawned preview it does
 * not. A suite that has printed its verdict and cannot return to the shell is, to anything
 * running it, indistinguishable from one that hung before deciding — which is how the audit
 * recorded a finished cold-load run as a 900-second timeout.
 */
export function finish(proc, code) {
  stopServer(proc)
  // Give the already-queued stdout writes one tick to flush; `process.exit` truncates.
  setImmediate(() => process.exit(code))
}
