/**
 * zip.ts — read a .zip, replace named parts, write it back, and leave everything else alone.
 *
 * ── WHY THIS EXISTS AND NOT `XLSX.writeFile` ─────────────────────────────────────────
 *
 * Because `XLSX.writeFile` silently destroys the wordlist. Measured on the real file: a
 * SheetJS read→write round trip returns `styles.xml` with **Calibri alone** — Kanz-al-Lulu,
 * the font every cell in the sheet is set in, is gone from all 1085 rows — and drops
 * `sharedStrings.xml` entirely, rewriting every cell as an inline string. Every VALUE is
 * still correct, so every assertion about values still passes, and the LSD column renders in
 * a fallback face. See `docs/dictionary-editing.md` for the measurement.
 *
 * So untouched parts are never re-encoded. They are copied at the COMPRESSED level: the
 * bytes that came out of the archive go back into the archive without being inflated first.
 * "Every other part is byte-identical" is therefore true by construction rather than by
 * care — there is no code path that could alter them — and `api/_lib/sync.test.ts` asserts
 * it anyway, because a property that is only true by construction is one refactor from being
 * true by nothing.
 *
 * ── WHAT IS DELIBERATELY NOT SUPPORTED ───────────────────────────────────────────────
 *
 * Zip64, encryption, and data descriptors (the streaming mode where sizes trail the data)
 * all THROW rather than being handled approximately. Excel does not produce any of them for
 * a file this size. An archive that needs them is an archive this module has not been tested
 * against, and a wrong guess here corrupts the source of truth for the whole translation.
 */
import { deflateRawSync, inflateRawSync } from 'node:zlib'

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50

export interface ZipEntry {
  name: string
  /** Compressed bytes exactly as they sat in the source archive. Never re-encoded. */
  raw: Uint8Array
  method: number
  crc: number
  compressedSize: number
  uncompressedSize: number
  flags: number
  modTime: number
  modDate: number
  versionMadeBy: number
  versionNeeded: number
  internalAttrs: number
  externalAttrs: number
  /** Verbatim, both copies — some writers put different bytes in each. */
  localExtra: Uint8Array
  centralExtra: Uint8Array
  comment: Uint8Array
}

export class ZipError extends Error {}

// ── CRC-32 ───────────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── read ─────────────────────────────────────────────────────────────────────────────

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

/** Where the End Of Central Directory record starts. Scanned backwards — it carries a comment. */
function findEocd(buf: Uint8Array): number {
  const min = Math.max(0, buf.length - 0xffff - 22)
  for (let i = buf.length - 22; i >= min; i--) if (u32(buf, i) === EOCD_SIG) return i
  throw new ZipError('not a zip archive: no end-of-central-directory record')
}

export function readZip(buf: Uint8Array): ZipEntry[] {
  const eocd = findEocd(buf)
  const count = u16(buf, eocd + 10)
  const cdSize = u32(buf, eocd + 12)
  const cdOffset = u32(buf, eocd + 16)
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ZipError('zip64 archives are not supported')
  }

  const entries: ZipEntry[] = []
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (u32(buf, p) !== CENTRAL_SIG) throw new ZipError(`central directory entry ${i} has a bad signature`)
    const flags = u16(buf, p + 8)
    // Bit 0 is encryption; bit 3 puts the sizes in a trailing data descriptor. Neither is
    // something Excel emits, and both would make the sizes read below wrong.
    if (flags & 0x1) throw new ZipError('encrypted archives are not supported')
    if (flags & 0x8) throw new ZipError('archives with data descriptors are not supported')

    const nameLen = u16(buf, p + 28)
    const extraLen = u16(buf, p + 30)
    const commentLen = u16(buf, p + 32)
    const localOffset = u32(buf, p + 42)
    const compressedSize = u32(buf, p + 20)
    const uncompressedSize = u32(buf, p + 24)
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ZipError('zip64 entries are not supported')
    }

    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nameLen)).toString('utf8')

    if (u32(buf, localOffset) !== LOCAL_SIG) throw new ZipError(`local header for ${name} has a bad signature`)
    const localNameLen = u16(buf, localOffset + 26)
    const localExtraLen = u16(buf, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen

    entries.push({
      name,
      raw: buf.subarray(dataStart, dataStart + compressedSize),
      method: u16(buf, p + 10),
      crc: u32(buf, p + 16),
      compressedSize,
      uncompressedSize,
      flags,
      modTime: u16(buf, p + 12),
      modDate: u16(buf, p + 14),
      versionMadeBy: u16(buf, p + 4),
      versionNeeded: u16(buf, p + 6),
      internalAttrs: u16(buf, p + 36),
      externalAttrs: u32(buf, p + 38),
      localExtra: buf.subarray(localOffset + 30 + localNameLen, dataStart),
      centralExtra: buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen),
      comment: buf.subarray(p + 46 + nameLen + extraLen, p + 46 + nameLen + extraLen + commentLen),
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** The decompressed bytes of one part. Read-only: nothing here writes back through it. */
export function partBytes(entry: ZipEntry): Uint8Array {
  if (entry.method === 0) return Uint8Array.from(entry.raw)
  if (entry.method === 8) return new Uint8Array(inflateRawSync(Buffer.from(entry.raw)))
  throw new ZipError(`${entry.name}: unsupported compression method ${entry.method}`)
}

export const partText = (entry: ZipEntry): string => Buffer.from(partBytes(entry)).toString('utf8')

export const findPart = (entries: ZipEntry[], name: string): ZipEntry | undefined =>
  entries.find((e) => e.name === name)

/**
 * A copy of `entries` with one part's contents replaced.
 *
 * The replaced entry is the ONLY one that gets re-encoded; every other object in the returned
 * array is the same object, still carrying its original compressed bytes. Throws if the part
 * is not there — a sync that silently added a part Excel had never written is worse than one
 * that stops.
 */
export function replacePart(entries: ZipEntry[], name: string, data: Uint8Array): ZipEntry[] {
  const idx = entries.findIndex((e) => e.name === name)
  if (idx === -1) throw new ZipError(`cannot replace ${name}: it is not in the archive`)
  const old = entries[idx]
  const deflated = new Uint8Array(deflateRawSync(Buffer.from(data), { level: 9 }))
  const next: ZipEntry = {
    ...old,
    raw: deflated,
    method: 8,
    crc: crc32(data),
    compressedSize: deflated.length,
    uncompressedSize: data.length,
  }
  return entries.map((e, i) => (i === idx ? next : e))
}

// ── write ────────────────────────────────────────────────────────────────────────────

const w16 = (b: Uint8Array, o: number, v: number) => { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff }
const w32 = (b: Uint8Array, o: number, v: number) => {
  b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; b[o + 2] = (v >>> 16) & 0xff; b[o + 3] = (v >>> 24) & 0xff
}

export function writeZip(entries: ZipEntry[]): Uint8Array {
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let at = 0

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const head = new Uint8Array(30 + name.length + e.localExtra.length)
    w32(head, 0, LOCAL_SIG)
    w16(head, 4, e.versionNeeded)
    w16(head, 6, e.flags)
    w16(head, 8, e.method)
    w16(head, 10, e.modTime)
    w16(head, 12, e.modDate)
    w32(head, 14, e.crc)
    w32(head, 18, e.compressedSize)
    w32(head, 22, e.uncompressedSize)
    w16(head, 26, name.length)
    w16(head, 28, e.localExtra.length)
    head.set(name, 30)
    head.set(e.localExtra, 30 + name.length)

    offsets.push(at)
    chunks.push(head, e.raw)
    at += head.length + e.raw.length
  }

  const cdStart = at
  entries.forEach((e, i) => {
    const name = Buffer.from(e.name, 'utf8')
    const rec = new Uint8Array(46 + name.length + e.centralExtra.length + e.comment.length)
    w32(rec, 0, CENTRAL_SIG)
    w16(rec, 4, e.versionMadeBy)
    w16(rec, 6, e.versionNeeded)
    w16(rec, 8, e.flags)
    w16(rec, 10, e.method)
    w16(rec, 12, e.modTime)
    w16(rec, 14, e.modDate)
    w32(rec, 16, e.crc)
    w32(rec, 20, e.compressedSize)
    w32(rec, 24, e.uncompressedSize)
    w16(rec, 28, name.length)
    w16(rec, 30, e.centralExtra.length)
    w16(rec, 32, e.comment.length)
    w16(rec, 34, 0)                    // disk number
    w16(rec, 36, e.internalAttrs)
    w32(rec, 38, e.externalAttrs)
    w32(rec, 42, offsets[i])
    rec.set(name, 46)
    rec.set(e.centralExtra, 46 + name.length)
    rec.set(e.comment, 46 + name.length + e.centralExtra.length)
    chunks.push(rec)
    at += rec.length
  })

  const eocd = new Uint8Array(22)
  w32(eocd, 0, EOCD_SIG)
  w16(eocd, 8, entries.length)
  w16(eocd, 10, entries.length)
  w32(eocd, 12, at - cdStart)
  w32(eocd, 16, cdStart)
  chunks.push(eocd)

  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return out
}
