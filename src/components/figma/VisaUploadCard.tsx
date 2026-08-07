import { useRef, useState } from 'react'
import { useStore, journeyFor, type VisaDocument } from '../../store'
import { useT } from '../../i18n'

const MUL = 'Mulish, system-ui, sans-serif'
const MAX_VISA_BYTES = 4 * 1024 * 1024 // 4MB — kept small since the file is base64-stored in localStorage

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadedAt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function PdfFileIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} className="shrink-0">
      <path d="M6 2.5h8l4.5 4.5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5Z" stroke="#c0392b" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 2.5V7h4.5" stroke="#c0392b" strokeWidth="1.6" strokeLinejoin="round" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#c0392b" fontFamily="Mulish, system-ui, sans-serif">PDF</text>
    </svg>
  )
}

function UploadCloudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="22" height="22" className="shrink-0">
      <path d="M7 17.5a4 4 0 0 1-.7-7.94A5 5 0 0 1 16.3 8.1 4.5 4.5 0 0 1 17.5 17.5H7Z" stroke="#a8843e" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 13.5V9M12 9l-2.3 2.3M12 9l2.3 2.3" stroke="#a8843e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Eligibility card — the user uploads their visa (PDF) as part of an event's eligibility check.
 *  Stored per-journey (`flow.visaDocument`) as a base64 data URL — there's no file backend in this
 *  prototype, so a real upload/download is simulated entirely client-side. Shared by Event Details
 *  (Eligibility card) and, in `compact` form, the Registration Questionnaire / "Other Details". */
export function VisaUploadCard({ miqaatId, compact = false }: { miqaatId: string; compact?: boolean }) {
  const { tx, td } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const flow = useStore((s) => journeyFor(s.flow, s.registrations, miqaatId))
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const setVisaDocument = useStore((s) => s.setVisaDocument)
  const clearVisaDocument = useStore((s) => s.clearVisaDocument)
  const visaDocument: VisaDocument | null = flow.visaDocument

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError('Please upload a PDF file.')
      return
    }
    if (file.size > MAX_VISA_BYTES) {
      setError(`File is too large — max ${formatBytes(MAX_VISA_BYTES)}.`)
      return
    }
    try {
      setBusy(true)
      const dataUrl = await readFileAsDataUrl(file)
      // Uploading edits THIS event's journey — make it active first so the document is saved
      // against the right journey even if a different event is currently being edited.
      setActiveMiqaat(miqaatId)
      setVisaDocument({ name: file.name, dataUrl, sizeLabel: formatBytes(file.size), uploadedAt: new Date().toISOString() })
    } catch {
      setError('Could not read that file — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = () => {
    setActiveMiqaat(miqaatId)
    clearVisaDocument()
    setError(null)
  }

  const body = (
    <>
      {visaDocument ? (
        <div className={`${compact ? 'mt-[8px]' : 'mt-[14px]'} flex items-center justify-between gap-[10px] rounded-[12px] border border-[#e7dfc9] bg-white px-[12px] py-[10px]`}>
          <div className="flex min-w-0 items-center gap-[10px]">
            <PdfFileIcon />
            <div className="min-w-0">
              <p className="truncate text-[13px] leading-[18px] text-[#23302a]" style={{ fontFamily: MUL, fontWeight: 700 }} {...td(visaDocument.name)} />
              <p className="text-[11px] leading-[16px] text-[#8a938e]" style={{ fontFamily: MUL }}>
                {visaDocument.sizeLabel} · Uploaded {formatUploadedAt(visaDocument.uploadedAt)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-[8px]">
            <a
              href={visaDocument.dataUrl}
              download={visaDocument.name}
              className="flex h-[30px] items-center justify-center rounded-[8px] border border-[#e7dfc9] px-[10px] text-[12px] text-[#1f5a44] transition-colors hover:border-[#c2a04e]"
              style={{ fontFamily: MUL, fontWeight: 700 }} {...tx('Download')} />
            <button
              type="button"
              onClick={handleRemove}
              className="flex h-[30px] items-center justify-center rounded-[8px] border border-[#f0d4d0] px-[10px] text-[12px] text-[#b0392b] transition-colors hover:bg-[#fdf1f0]"
              style={{ fontFamily: MUL, fontWeight: 700 }} {...tx('Remove')} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={`${compact ? 'mt-[8px]' : 'mt-[14px]'} flex w-full flex-col items-center justify-center gap-[6px] rounded-[12px] border-2 border-dashed border-[#e3cd96] bg-[#fdfaf1] px-[14px] py-[20px] transition-colors hover:border-[#c9a45c] disabled:opacity-60`}
        >
          <UploadCloudIcon />
          <span className="text-[13px] leading-[18px] text-[#1f5a44]" style={{ fontFamily: MUL, fontWeight: 700 }}>
            {busy ? 'Uploading…' : 'Tap to upload visa (PDF)'}
          </span>
          <span className="text-[11px] leading-[15px] text-[#8a938e]" style={{ fontFamily: MUL }}>
            Max {formatBytes(MAX_VISA_BYTES)}
          </span>
        </button>
      )}

      {error && (
        <p className="mt-[8px] text-[12px] leading-[17px] text-[#b0392b]" style={{ fontFamily: MUL, fontWeight: 600 }}>
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = '' }}
      />
    </>
  )

  // Compact — embedded inline within the questionnaire's numbered sections, which already provide
  // the bordered card + section heading, so this only contributes a field label + the upload control.
  if (compact) {
    return (
      <div>
        <p className="flex items-center text-[13px] font-bold uppercase tracking-[0.6px] text-[#a8843e]" style={{ fontFamily: MUL }} {...tx('Upload your visa')} />
        <p className="mt-[4px] text-[13px] leading-[19px] text-[#6a746e]" style={{ fontFamily: MUL }}>
          A valid visa copy (PDF) is required to confirm eligibility for this Miqaat.
        </p>
        {body}
      </div>
    )
  }

  return (
    <div className="w-full rounded-[18px] border-2 border-solid border-[#e7dfc9] bg-[#fffdf8] p-[16px] shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18),0px_2px_8px_-4px_rgba(21,64,47,0.1)]">
      <p className="text-[14px] leading-[20px] text-[#23302a]" style={{ fontFamily: MUL, fontWeight: 700 }} {...tx('Upload your visa')} />
      <p className="mt-[4px] text-[13px] leading-[19px] text-[#6a746e]" style={{ fontFamily: MUL }}>
        A valid visa copy (PDF) is required to confirm eligibility for this Miqaat.
      </p>
      {body}
    </div>
  )
}
