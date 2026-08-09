/**
 * GET /api/dictionary-export   the shared overrides as an .xlsx patch
 *
 * The wordlist .xlsx stays the source of truth. Nothing here — and nothing anywhere in this
 * tooling — writes to it, or to the generated `lsd.json`. An override is a proposal held in
 * front of the sheet; this is how it gets to the person who owns the sheet.
 *
 * Deliberately NOT under `api/dictionary/`: `[key].ts` is a dynamic route in that directory,
 * and a static sibling relying on route-precedence to beat it is the kind of thing that works
 * until it doesn't. `/api/dictionary-export` cannot be mistaken for a base64url key.
 *
 * Generated on the SERVER. `xlsx` is ~400kB and moved to `dependencies` for this function; it
 * is imported only here, and `sheet_to_json`/`SheetJS` are on check-dev-only's forbidden list
 * so the dependency move cannot follow it into the client bundle. A dev-only React component
 * importing a spreadsheet library is exactly the shape of leak that put the Remarks tool into
 * a production bundle once already.
 */
import { fail, handler, route } from './_lib/http'
import { currentOverrides } from './_lib/records'
import { storeFromEnv } from './_lib/store'
import generated from '../src/i18n/lsd.json'

interface Entry { lsd?: string; page?: string }
const DICT = generated as unknown as Record<string, Entry>

const norm = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** The generated dictionary, keyed the way `normKey` keys it, so lookups actually hit. */
const byKey = new Map<string, Entry>(
  Object.entries(DICT).filter(([k]) => k !== '//').map(([k, v]) => [norm(k), v]),
)

export const GET = handler(async () => {
  const revisions = await currentOverrides(storeFromEnv())
  if (!revisions.length) return fail(404, 'there are no overrides to export')

  const { utils, write } = await import('xlsx')

  const rows = revisions.map((r) => {
    const entry = byKey.get(norm(r.key))
    return {
      Key: r.key,
      Page: entry?.page ?? '',
      // Empty when the key has no row yet — which is the point of a `new-row` request, and is
      // visible in the sheet as a blank rather than invisible as a missing row.
      'Old value': entry?.lsd ?? '',
      'New value': r.value,
      Kind: r.kind,
      Author: r.author,
      'Changed at': r.createdAt,
      Note: r.note ?? '',
      'Revision id': r.revisionId,
    }
  })

  const sheet = utils.json_to_sheet(rows)
  const book = utils.book_new()
  utils.book_append_sheet(book, sheet, 'Overrides')
  const buf = write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const stamp = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="wordlist-overrides-${stamp}.xlsx"`,
      'cache-control': 'no-store',
    },
  })
})

/** Both shapes, one source of truth — see `route` in `_lib/http.ts`. */
export default route({ GET })
