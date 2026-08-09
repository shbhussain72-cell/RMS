/**
 * IdentityPrompt — asks for a name once, and says plainly what that name is worth.
 *
 * ── IT IS A LABEL, NOT A LOGIN ───────────────────────────────────────────────────────
 *
 * There is no password, no session and no server-side check. Anyone with the link can type
 * any name, including someone else's. That is acceptable for six known reviewers behind
 * Deployment Protection, and it stops being acceptable the moment somebody believes it is
 * authentication — so the disclaimer is not a tooltip or a help link. It renders next to the
 * field, every time, in both the first-run prompt and the settings row.
 *
 * That matters more here than it would elsewhere: this name ends up attached to dictionary
 * revisions, which anyone can now write. Implying the attribution is verified would make the
 * revision history look like an audit trail. It is a courtesy, and it should read as one.
 */
import { useState } from 'react'
import { SCANNER_IGNORE_ATTR } from '../i18n/domScan'
import { useT } from '../i18n'
import { IDENTITY_DISCLAIMER, getAuthor, setAuthor } from './identity'

const FONT = 'Mulish, system-ui, sans-serif'

/** Tool chrome: out of its own coverage counts, and out of the remark layer's hit testing. */
const chromeProps = { [SCANNER_IGNORE_ATTR]: '' }

export function IdentityDisclaimer() {
  const { tx } = useT()
  return (
    <p
      {...chromeProps}
      data-rmk="identity-note"
      className="mt-[6px] text-[10px] leading-[14px] text-[#8a938e]"
      style={{ fontFamily: FONT }}
      dir="ltr"
      {...tx(IDENTITY_DISCLAIMER)}
    />
  )
}

/**
 * Blocks writing until a name is given.
 *
 * Deliberately a gate rather than a default. Defaulting to "reviewer" would let six people
 * share one label, and the author field is the only attribution this design has — a shared
 * default makes every record's author meaningless while looking like it works.
 */
export function IdentityPrompt({ onDone }: { onDone: () => void }) {
  const { t, tx } = useT()
  const [value, setValue] = useState('')
  const clean = value.replace(/\s+/g, ' ').trim()

  return (
    <div {...chromeProps} data-rmk="identity-prompt" className="p-[12px]" style={{ fontFamily: FONT }}>
      <p className="text-[12px] font-bold text-[#23302a]" {...tx('What should your remarks be signed with?')} />
      <div className="mt-[8px] flex gap-[6px]">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && clean) { setAuthor(clean); onDone() } }}
          placeholder={t('Your name')}
          maxLength={80}
          className="min-w-0 flex-1 rounded-[6px] border border-[#e7dfc9] px-[8px] py-[5px] text-[12px] outline-none focus:border-[#1f5a44]"
          dir="auto"
        />
        <button
          type="button"
          data-rmk="identity-save"
          disabled={!clean}
          onClick={() => { setAuthor(clean); onDone() }}
          className="rounded-[6px] bg-[#1f5a44] px-[10px] py-[5px] text-[12px] font-bold text-white disabled:opacity-40"
        >
          {t('Continue')}
        </button>
      </div>
      <IdentityDisclaimer />
    </div>
  )
}

/** The settings row: change the name later, with the same disclaimer beside it. */
export function IdentityRow() {
  const { t } = useT()
  const [value, setValue] = useState(() => getAuthor())
  return (
    <div {...chromeProps} style={{ fontFamily: FONT }}>
      <input
        value={value}
        onChange={(e) => { setValue(e.target.value); setAuthor(e.target.value) }}
        placeholder={t('Your name')}
        maxLength={80}
        className="w-full min-w-0 rounded-[6px] border border-[#e7dfc9] px-[6px] py-[4px] text-[11px] outline-none focus:border-[#1f5a44]"
        dir="auto"
      />
      <IdentityDisclaimer />
    </div>
  )
}
