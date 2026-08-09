/**
 * syncApi.ts — the wordlist sync, from the editor's side.
 *
 * The sync is the step that turns a pending override into a row in the spreadsheet. Its
 * outcome has to be visible HERE, in the panel, because every abort it can produce is
 * something a person has to act on — a value that came through as mojibake, a run that would
 * have rewritten a fifth of the sheet, a spreadsheet somebody edited by hand while the cron
 * was running. An abort that only reaches a server log is an abort nobody knows about, and
 * the pending count would sit there climbing with no explanation.
 *
 * Nothing here decides anything. It reads a status and asks for a run; the rails all live on
 * the server, where they cannot be skipped by calling a different endpoint.
 */
import { ApiError, apiFetch } from './transport'

export interface SyncStatus {
  at: string
  ok: boolean
  commit?: string
  updated: string[]
  appended: string[]
  alreadyThere: number
  skipped: { key: string; why: string }[]
  aborts: string[]
  rowsBefore: number
  rowsAfter: number
  trigger: 'cron' | 'manual'
}

export async function fetchSyncStatus(): Promise<SyncStatus | null> {
  const { data } = await apiFetch<{ status: SyncStatus | null }>('/api/sync-wordlist')
  return data.status ?? null
}

/**
 * Run it now.
 *
 * An abort comes back as a 4xx/5xx carrying the same status record as a success, so it is
 * unwrapped rather than thrown: "the sync ran and refused" is a result to display, not an
 * error to swallow. A response with no status record at all IS an error and is rethrown —
 * that is the case where something upstream of the sync failed and there is nothing to show.
 */
export async function runSyncNow(force = false): Promise<SyncStatus> {
  try {
    const { data } = await apiFetch<{ status: SyncStatus }>('/api/sync-wordlist', {
      method: 'POST',
      body: JSON.stringify({ force }),
    })
    return data.status
  } catch (err) {
    const body = err instanceof ApiError ? (err.body as { status?: SyncStatus } | undefined) : undefined
    if (body?.status) return body.status
    throw err
  }
}

/** True when the only thing stopping the run is the change-share rail, which `force` overrides. */
export const isForceable = (status: SyncStatus | null): boolean =>
  !!status && !status.ok && status.aborts.some((a) => a.includes('limit'))
