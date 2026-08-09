/**
 * github.ts — read and write one file in one repository, through the Contents API.
 *
 * Deliberately tiny. There is no client library here and no general-purpose wrapper: this
 * talks to exactly two endpoints, on a path taken from an env var, with a token that is
 * scoped to `contents:write` on a single repository. Anything broader would be a larger
 * blast radius than the job needs.
 *
 * ── THE SHA IS THE CONCURRENCY CONTROL ───────────────────────────────────────────────
 *
 * `PUT /contents` with a `sha` is a compare-and-swap: GitHub rejects it with 409 if the file
 * has moved since the GET. That is the only thing standing between a nightly cron and a human
 * committing an edited spreadsheet at the same moment, so the sha is always sent and a 409 is
 * always surfaced rather than retried. Retrying would mean re-reading a file somebody was
 * mid-way through changing.
 *
 * The token never reaches the client: `WORDLIST_SYNC_TOKEN` carries no `VITE_` prefix, so
 * Vite cannot inline it, and `scripts/check-dev-only.mjs` asserts its absence from `dist/`
 * rather than trusting the naming convention.
 */

const API = 'https://api.github.com'

export class GitHubError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'GitHubError'
  }
}

export interface RepoConfig {
  token: string
  /** `owner/name`. */
  repo: string
  branch: string
  path: string
}

/** Every env var this needs, read in one place so a missing one is one clear message. */
export function repoFromEnv(): RepoConfig {
  const token = process.env.WORDLIST_SYNC_TOKEN
  const repo = process.env.WORDLIST_REPO
  if (!token) throw new GitHubError('WORDLIST_SYNC_TOKEN is not set — the sync cannot commit', 500)
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new GitHubError('WORDLIST_REPO must be set to owner/name', 500)
  return {
    token,
    repo,
    branch: process.env.WORDLIST_BRANCH || 'main',
    path: process.env.WORDLIST_PATH || 'RMS_Mumineen_LSD_wordlist_v4.xlsx',
  }
}

const headers = (cfg: RepoConfig) => ({
  authorization: `Bearer ${cfg.token}`,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'rms-wordlist-sync',
})

export interface RepoFile {
  bytes: Uint8Array
  /** Blob sha. Must be sent back on write, or the write is unconditional. */
  sha: string
}

/**
 * The committed file, as bytes.
 *
 * A 404 is an error, never an invitation to create the file. The wordlist is the source of
 * truth for every translation in the app; a sync that "helpfully" created a fresh one from
 * the override store would replace 1085 curated rows with however many edits happened to be
 * pending, and the commit would look ordinary.
 */
export async function getFile(cfg: RepoConfig): Promise<RepoFile> {
  const url = `${API}/repos/${cfg.repo}/contents/${encodeURI(cfg.path)}?ref=${encodeURIComponent(cfg.branch)}`
  const res = await fetch(url, { headers: headers(cfg) })
  if (res.status === 404) {
    throw new GitHubError(`${cfg.path} is not in ${cfg.repo}@${cfg.branch} — refusing to create it`, 502)
  }
  if (!res.ok) throw new GitHubError(`could not read ${cfg.path}: GitHub returned ${res.status}`, 502)

  const body = (await res.json()) as { content?: string; encoding?: string; sha?: string; size?: number }
  if (!body.sha) throw new GitHubError(`GitHub returned no sha for ${cfg.path}`, 502)
  // Files over 1MB come back with an empty `content` and have to be fetched through the blobs
  // API. The wordlist is ~63kB, so this is a guard against a silent empty read rather than a
  // case to handle — an empty buffer would parse as "not a zip" and abort, but it would abort
  // with a confusing message.
  if (body.encoding !== 'base64' || !body.content) {
    throw new GitHubError(`GitHub returned ${cfg.path} without inline content (size ${body.size ?? '?'}) — too large for the Contents API`, 502)
  }
  return { bytes: new Uint8Array(Buffer.from(body.content, 'base64')), sha: body.sha }
}

/** Commit new bytes over the file. `sha` makes it a compare-and-swap; a 409 is surfaced. */
export async function putFile(cfg: RepoConfig, bytes: Uint8Array, sha: string, message: string): Promise<string> {
  const url = `${API}/repos/${cfg.repo}/contents/${encodeURI(cfg.path)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(cfg), 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(bytes).toString('base64'),
      sha,
      branch: cfg.branch,
    }),
  })
  if (res.status === 409) {
    throw new GitHubError(`${cfg.path} changed in ${cfg.repo} while the sync was running — nothing was committed. Run it again.`, 409)
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new GitHubError(`commit refused by GitHub (${res.status}): ${detail.slice(0, 200)}`, 502)
  }
  const body = (await res.json()) as { commit?: { sha?: string } }
  return body.commit?.sha ?? ''
}
