/**
 * Persistence for remarks — adapter interface plus the default localStorage implementation.
 *
 * The key is `rms-remarks`, matching the existing `rms-lang` and `rms-tour-seen`.
 *
 * Everything reading storage is defensive. A reviewer's browser may hold remarks written by
 * an older build of this tool, and a JSON parse failure or a shape change must not take the
 * app down or silently wipe the file — losing a reviewer's notes is the one unrecoverable
 * failure here. Unreadable entries are dropped from the returned list and left ON DISK, so a
 * later build with a migration can still find them.
 */
import type { Remark, RemarksAdapter } from './types'

export const REMARKS_KEY = 'rms-remarks'

/**
 * Which remarks have been exported, and at which revision.
 *
 * On a shared review URL every reviewer has their own private localStorage, so a remark that
 * has not been exported has not reached anybody — it is not "saved", it is stranded. The panel
 * needs to say so on the pill, at a glance, without the reviewer opening anything.
 *
 * Stored as id -> the `updatedAt` that was exported, not as a flag or a timestamp. A bare
 * "exported at 14:02" would call an edited remark exported, and editing is how a reviewer
 * sharpens a vague note into a useful one — exactly the version that must get out.
 */
export const EXPORTED_KEY = 'rms-remarks-exported'

export function readExported(): Record<string, string> {
  try {
    const raw = localStorage.getItem(EXPORTED_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

/** Records the exported revision of every remark in `list`. Merges, never replaces. */
export function markExported(list: Remark[]): Record<string, string> {
  const next = { ...readExported() }
  for (const r of list) next[r.id] = r.updatedAt
  try {
    localStorage.setItem(EXPORTED_KEY, JSON.stringify(next))
  } catch (err) {
    console.error('[remarks] could not record the export — the unexported count will over-report.', err)
  }
  return next
}

/** Remarks that have never been exported, or have been edited since they were. */
export function unexportedOf(list: Remark[], exported: Record<string, string>): Remark[] {
  return list.filter((r) => exported[r.id] !== r.updatedAt)
}

function readAll(): Remark[] {
  try {
    const raw = localStorage.getItem(REMARKS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Shape-check each entry rather than trusting the array. A single malformed record
    // should cost you that record, not the whole set.
    return parsed.filter((r): r is Remark => {
      if (!r || typeof r !== 'object') return false
      const c = r as Partial<Remark>
      return typeof c.id === 'string'
        && typeof c.remark === 'string'
        && typeof c.route === 'string'
        && !!c.identifiers
        && typeof c.identifiers.structural === 'string'
    })
  } catch {
    return []
  }
}

function writeAll(list: Remark[]): void {
  try {
    localStorage.setItem(REMARKS_KEY, JSON.stringify(list))
  } catch (err) {
    // Quota exceeded, or storage disabled (private mode). Surfacing this matters: the
    // reviewer just typed something and needs to know it did not persist.
    console.error('[remarks] could not save — your last remark is not persisted.', err)
  }
}

/** Default adapter. Synchronous under the hood, async at the boundary so it can be replaced. */
export const localStorageAdapter: RemarksAdapter = {
  async list() {
    return readAll()
  },
  async load(id) {
    return readAll().find((r) => r.id === id) ?? null
  },
  async save(remark) {
    const all = readAll()
    const i = all.findIndex((r) => r.id === remark.id)
    if (i >= 0) all[i] = remark
    else all.push(remark)
    writeAll(all)
  },
  async remove(id) {
    writeAll(readAll().filter((r) => r.id !== id))
  },
}

/**
 * Id generator.
 *
 * `crypto.randomUUID` where available, with a fallback for non-secure origins (a LAN dev
 * server reached by IP does not get `crypto` in some browsers, and a reviewer on another
 * machine is exactly the expected usage).
 */
export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* fall through */ }
  return `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
