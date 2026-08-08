import { createContext, useContext, type ReactNode } from 'react'
import type { FamilyMember } from '../../data/seed'
import { Iso, isolateRuns, toArabicDigits } from '../Bidi'
import type { QuestionnaireAnswers } from '../../store'
import { VisaUploadCard } from '../figma/VisaUploadCard'
import { useT } from '../../i18n'

const RADIO_ON = '/figma/radio-checked.svg'
const RADIO_OFF = '/figma/radio-unchecked.svg'
const CHECKBOX_BLANK = '/figma/checkbox-blank.svg'
const CHECKBOX_CHECKED = '/figma/checkbox-checked.svg'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, Georgia, serif'

const ACCOMMODATION_TYPES: Array<{ value: NonNullable<QuestionnaireAnswers['accommodationType']>; label: string }> = [
  { value: 'shared', label: 'Shared Accommodation' },
  { value: 'family_room', label: 'Family Room' },
  { value: 'hotel', label: 'Hotel (If Available)' },
]
const DIETARY_OPTIONS = [
  { value: 'diabetic', label: 'Diabetic Meals' },
  { value: 'low_salt', label: 'Low Salt' },
  { value: 'soft_diet', label: 'Soft Diet' },
  { value: 'other', label: 'Other' },
]
const TRAVEL_MODES: Array<{ value: NonNullable<QuestionnaireAnswers['travelMode']>; label: string }> = [
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'personal_vehicle', label: 'Personal Vehicle' },
]
const MEDICAL_OPTIONS = [
  { value: 'wheelchair', label: 'Wheelchair Assistance' },
  { value: 'medication', label: 'Regular Medication Support' },
  { value: 'oxygen', label: 'Oxygen Support' },
  { value: 'mobility', label: 'Mobility Assistance' },
  { value: 'emergency', label: 'Medical Emergency Support' },
]
const ACCESSIBILITY_OPTIONS = [
  { value: 'wheelchair_access', label: 'Wheelchair Access' },
  { value: 'elderly', label: 'Elderly Assistance' },
  { value: 'hearing', label: 'Hearing Assistance' },
  { value: 'vision', label: 'Vision Assistance' },
  { value: 'other', label: 'Other' },
]
const REGISTERING_FOR_LABEL: Record<NonNullable<QuestionnaireAnswers['registeringFor']>, string> = {
  myself: 'Myself', family: 'Family Members', mehmaan: 'Mehmaan (Guest)',
}

/* ── small amber "New" pill — flags an admin-added question until it's answered ── */
function NewBadge() {
  const { tx } = useT()
  return (
    <span
      className="ms-[8px] inline-flex h-[17px] items-center rounded-full bg-[#fbeecb] px-[8px] text-[10px] font-bold uppercase tracking-[0.4px] text-[#a9740f]"
      style={{ fontFamily: FONT_SANS }} {...tx('New')} />
  )
}

/* ── section field label (gold uppercase caption, same idiom as Login's field labels) ── */
function FieldLabel({ children, required, isNew }: { children: ReactNode; required?: boolean; isNew?: boolean }) {
  return (
    <p className="flex items-center text-[13px] font-bold uppercase tracking-[0.6px] text-[#a8843e]" style={{ fontFamily: FONT_SANS }}>
      {children}{required && <span className="text-[#c0392b]"> *</span>}
      {isNew && <NewBadge />}
    </p>
  )
}

/** Soft highlighted wrapper around an admin-added question — gives it a scroll-target id and a gold
 *  tinted background until the user answers it (drives auto-scroll on the edit-form screen). */
function NewFieldWrap({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return (
    <div id={id} className={active ? 'rounded-[12px] border border-[#f0d9a0] bg-[#fdf6e5] p-[12px]' : ''}>
      {children}
    </div>
  )
}

/** Small red hint under a required field once the user has attempted to continue and it's still
 *  empty — a visible complement to FieldLabel's red asterisk, so it's obvious which field to fix. */
function FieldError({ show, message = 'This field is required.' }: { show: boolean; message?: string }) {
  if (!show) return null
  return (
    <p className="mt-[6px] text-[12px] font-semibold text-[#b23b3b]" style={{ fontFamily: FONT_SANS }}>
      {message}
    </p>
  )
}

/* ── text input — same visual language as Login.tsx's ITS/password fields ── */
function TextInput({ value, onChange, placeholder, type = 'text', disabled = false, invalid = false }: {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
  invalid?: boolean
}) {
  return (
    <div className={`mt-[8px] h-[48px] overflow-clip rounded-[8px] border border-solid ${disabled ? 'bg-[#f6f4ef]' : 'bg-white'} ${invalid ? 'border-[#e0b0aa]' : 'border-[#e7dfc9]'}`}>
      <input
        type={type}
        value={value}
        readOnly={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent px-[15px] text-[16px] font-normal leading-normal text-[#23302a] outline-none placeholder:text-[#8a938e]"
        style={{ fontFamily: FONT_SANS }}
      />
    </div>
  )
}

/* ── single-choice row (Yes/No, accommodation type, travel mode, "who are you registering") ── */
function RadioRow({ label, active, onClick, invalid = false }: { label: string; active: boolean; onClick: () => void; invalid?: boolean }) {
  const { tx } = useT()
  return (
    <button type="button" onClick={onClick}
      className={`flex min-h-[52px] w-full items-center gap-[10px] rounded-[12px] border border-solid px-[14px] py-[10px] text-start transition-colors ${
        active ? 'border-[#1f5a44] bg-[#eef6f1]' : invalid ? 'border-[#e0b0aa] bg-[#fdf5f4] hover:border-[#d99c94]' : 'border-[#e7dfc9] bg-white hover:border-[#cdbf98] hover:bg-[#fdfbf4]'
      }`}>
      <img src={active ? RADIO_ON : RADIO_OFF} alt="" className="size-[22px] shrink-0" />
      <span className="text-[14px] leading-[20px] text-[#23302a]" style={{ fontFamily: FONT_SANS, fontWeight: active ? 700 : 400 }} {...tx(label)} />
    </button>
  )
}

/* ── multi-choice row (dietary, medical, accessibility) ── */
function CheckRow({ label, checked, onClick, invalid = false }: { label: ReactNode; checked: boolean; onClick: () => void; invalid?: boolean }) {
  const { tx } = useT()
  return (
    <button type="button" onClick={onClick}
      className={`flex min-h-[52px] w-full items-center gap-[10px] rounded-[12px] border border-solid px-[14px] py-[10px] text-start transition-colors ${
        checked ? 'border-[#1f5a44] bg-[#eef6f1]' : invalid ? 'border-[#e0b0aa] bg-[#fdf5f4] hover:border-[#d99c94]' : 'border-[#e7dfc9] bg-white hover:border-[#cdbf98] hover:bg-[#fdfbf4]'
      }`}>
      <img src={checked ? CHECKBOX_CHECKED : CHECKBOX_BLANK} alt="" className="size-[20px] shrink-0" />
      {/* `label` is ReactNode here — some callers pass composed JSX, which has no English
          string to look up. Only a plain string can be translated; anything else renders
          as given. */}
      <span
        className="text-[14px] leading-[20px] text-[#23302a]"
        style={{ fontFamily: FONT_SANS, fontWeight: checked ? 700 : 400 }}
        {...(typeof label === 'string' ? tx(label) : { children: label })}
      />
    </button>
  )
}

/* ── Yes/No pair — the recurring gating question ("Do you require…?") ── */
function YesNo({ value, onChange, invalid = false }: { value: 'yes' | 'no' | null; onChange: (v: 'yes' | 'no') => void; invalid?: boolean }) {
  const { t } = useT()
  return (
    <div className="mt-[8px] grid grid-cols-2 gap-[10px]">
      <RadioRow label={t('Yes')} active={value === 'yes'} onClick={() => onChange('yes')} invalid={invalid} />
      <RadioRow label={t('No')} active={value === 'no'} onClick={() => onChange('no')} invalid={invalid} />
    </div>
  )
}

/* Layout mode for the sections. `grid` (opt-in per caller) drops the section numbering and tightens
   spacing so the cards can sit in a full-width 2-column grid — the "application form" density. Default
   (single-column, numbered) is unchanged. Threaded via context so callers flip one flag and every
   Section (and QuestionnaireSummary's Sections, which never provide it) reacts without prop drilling. */
const SectionLayoutCtx = createContext<{ grid: boolean }>({ grid: false })

/* ── one section card. Numbered by default. In grid mode the number is dropped and a soft drop shadow
      is added — the cards stack full-width like an application form (see QuestionnaireSections). ── */
function Section({ id, number, title, children }: { id: string; number: number; title: string; children: ReactNode }) {
  const { grid } = useContext(SectionLayoutCtx)
  const { isLsd } = useT()
  return (
    <div id={id} className={`rounded-[16px] border border-solid border-[#e7dfc9] bg-white p-[18px] sm:p-[22px] ${grid ? 'shadow-[0_4px_18px_-10px_rgba(21,64,47,0.16)]' : ''}`}>
      {/* The section number is isolated separately from the title. Interpolating it into the
          string (`${number}. ${title}`) made one mixed text node — an ASCII digit followed by
          a full stop and then Arabic — and the bidi algorithm moved the "1." to the far side
          of the heading. Two isolates keep the ordinal where it belongs, in both scripts. */}
      <h3 className="text-[17px] leading-[24px] text-[#15402f]" style={{ fontFamily: FONT_SERIF }}>
        {grid ? (
          // The grid layout drops the ordinal, but the title still needs isolating — it was the
          // one branch left rendering the raw string, so `‏visa وثائق` reached the DOM as a
          // single mixed node on desktop while the mobile branch below was already correct.
          isolateRuns(title)
        ) : (
          <>
            <Iso>{isLsd ? `${toArabicDigits(String(number))}.` : `${number}.`}</Iso> {isolateRuns(title)}
          </>
        )}
      </h3>
      <div className="mt-[16px] flex flex-col gap-[16px]">{children}</div>
    </div>
  )
}

/** Validates the whole form top-to-bottom, returning the first problem found (message + the
 *  section id to scroll to) — mirrors the section order rendered by `QuestionnaireSections`.
 *  `idPrefix` must match whatever prefix that instance of `QuestionnaireSections` was given. */
export function validateQuestionnaire(q: QuestionnaireAnswers, idPrefix = '', skipIntro = false): { message: string; sectionId: string } | null {
  const sid = (n: number) => `${idPrefix}section-${n}`
  if (!skipIntro) {
    if (!q.mobile.trim()) return { message: 'Please enter your mobile number.', sectionId: sid(1) }
    if (!q.attending) return { message: 'Please select whether you will be attending.', sectionId: sid(2) }
    if (!q.registeringFor) return { message: 'Please select who you are registering.', sectionId: sid(2) }
  }
  if (!q.needsAccommodation) return { message: 'Please select whether you require accommodation.', sectionId: sid(3) }
  if (q.needsAccommodation === 'yes') {
    if (!q.accommodationCount.trim()) return { message: 'Please enter the number of people requiring accommodation.', sectionId: sid(3) }
    if (!q.accommodationType) return { message: 'Please select a preferred accommodation type.', sectionId: sid(3) }
  }
  if (!q.needsFood) return { message: 'Please select whether you require food arrangements.', sectionId: sid(4) }
  if (q.needsFood === 'yes' && !q.mealCount.trim()) return { message: 'Please enter the number of meals required.', sectionId: sid(4) }
  if (!q.needsTravel) return { message: 'Please select whether you require transportation.', sectionId: sid(5) }
  if (q.needsTravel === 'yes') {
    if (!q.arrivalDate) return { message: 'Please enter your arrival date.', sectionId: sid(5) }
    if (!q.departureDate) return { message: 'Please enter your departure date.', sectionId: sid(5) }
    if (!q.travelMode) return { message: 'Please select a mode of travel.', sectionId: sid(5) }
  }
  if (!q.needsMedical) return { message: 'Please select whether you require medical assistance.', sectionId: sid(6) }
  if (q.needsMedical === 'yes' && q.medicalNeeds.length === 0) return { message: 'Please select at least one medical assistance option.', sectionId: sid(6) }
  if (q.registeringFor === 'family') {
    if (!q.memberUnder10) return { message: 'Please answer whether any member is below 10 years of age.', sectionId: sid(8) }
    if (!q.needsGuardianFlag) return { message: 'Please answer whether any member requires a Guardian.', sectionId: sid(8) }
    if (!q.needsCaregiverFlag) return { message: 'Please answer whether any member requires a Caregiver.', sectionId: sid(8) }
  }
  if (!q.emergencyName.trim() || !q.emergencyRelation.trim() || !q.emergencyMobile.trim())
    return { message: 'Please complete all emergency contact fields.', sectionId: sid(9) }
  if (!q.confirmAccurate || !q.confirmGuidelines) return { message: 'Please confirm both statements to submit.', sectionId: sid(10) }
  return null
}

/* ── read-only answer row (label + saved value, no control) — Review & Register's view-only form ── */
function AnswerRow({ label, value }: { label: string; value: string }) {
  // Both halves arrive as plain strings from `t()`, so they carry no isolation of their own —
  // and an LSD value like `‏airport سي لئي جاوا ني مدد` is one mixed text node whose Latin run the
  // paragraph is free to move. Isolating here covers every AnswerRow at once.
  return (
    <div>
      <FieldLabel>{isolateRuns(label)}</FieldLabel>
      <p className="mt-[6px] text-[14px] leading-[20px] text-[#23302a]" style={{ fontFamily: FONT_SANS, fontWeight: 600 }}>
        {value ? isolateRuns(value) : '—'}
      </p>
    </div>
  )
}

const yesNoLabel = (v: 'yes' | 'no' | null) => (v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '—')
function optionLabel<T extends string>(options: Array<{ value: T; label: string }>, value: T | null | undefined) {
  return options.find((o) => o.value === value)?.label ?? '—'
}
function optionLabels<T extends string>(options: Array<{ value: T; label: string }>, values: T[]) {
  return values.length ? values.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ') : 'None selected'
}

/** Read-only rendering of the questionnaire — same section shape/numbering as `QuestionnaireSections`,
 *  but every field shows its saved answer as plain text instead of an editable control. Used by
 *  Review & Register to show the filled-in form in a view-only state. */
export function QuestionnaireSummary({ q, idPrefix = '', hideIntro = false, className = 'flex flex-col gap-[16px]' }: {
  q: QuestionnaireAnswers
  idPrefix?: string
  hideIntro?: boolean
  /** Outer wrapper layout — defaults to a single column; pass a grid className (e.g. on a wide
   *  desktop panel) so the cards fill the available width instead of stretching edge to edge. */
  className?: string
}) {
     const { t } = useT()
  const sid = (n: number) => `${idPrefix}summary-section-${n}`
  let counter = 0
  const nextNo = () => ++counter

  return (
    <div className={className}>
      {!hideIntro && (
        <Section id={sid(1)} number={nextNo()} title={t('Personal Information')}>
          <AnswerRow label={t('Mobile Number')} value={q.mobile} />
          <AnswerRow label={t('Email Address')} value={q.email} />
        </Section>
      )}

      {!hideIntro && (
        <Section id={sid(2)} number={nextNo()} title={t('Attendance Details')}>
          <AnswerRow label={t('Will you be attending this Miqaat?')} value={yesNoLabel(q.attending)} />
          <AnswerRow label={t('Who are you registering?')} value={q.registeringFor ? REGISTERING_FOR_LABEL[q.registeringFor] : '—'} />
        </Section>
      )}

      <Section id={sid(3)} number={nextNo()} title={t('Accommodation')}>
        <AnswerRow label={t('Requires accommodation?')} value={yesNoLabel(q.needsAccommodation)} />
        {q.needsAccommodation === 'yes' && (
          <div className="grid grid-cols-2 gap-[12px]">
            <AnswerRow label={t('Number of people')} value={q.accommodationCount} />
            <AnswerRow label={t('Preferred type')} value={optionLabel(ACCOMMODATION_TYPES, q.accommodationType)} />
          </div>
        )}
      </Section>

      <Section id={sid(4)} number={nextNo()} title={t('Food Arrangements')}>
        <AnswerRow label={t('Requires food arrangements?')} value={yesNoLabel(q.needsFood)} />
        {q.needsFood === 'yes' && (
          <div className="grid grid-cols-2 gap-[12px]">
            <AnswerRow label={t('Number of meals')} value={q.mealCount} />
            <AnswerRow
              label={t('Dietary requirements')}
              value={q.dietary.includes('other') && q.dietaryOther ? `${optionLabels(DIETARY_OPTIONS, q.dietary)} (${q.dietaryOther})` : optionLabels(DIETARY_OPTIONS, q.dietary)}
            />
          </div>
        )}
      </Section>

      <Section id={sid(5)} number={nextNo()} title={t('Travel Details')}>
        <AnswerRow label={t('Requires transportation?')} value={yesNoLabel(q.needsTravel)} />
        {q.needsTravel === 'yes' && (
          <>
            <div className="grid grid-cols-2 gap-[12px]">
              <AnswerRow label={t('Arrival Date')} value={q.arrivalDate} />
              <AnswerRow label={t('Departure Date')} value={q.departureDate} />
            </div>
            <AnswerRow label={t('Mode of Travel')} value={optionLabel(TRAVEL_MODES, q.travelMode)} />
          </>
        )}
        <AnswerRow label={t('Airport pickup assistance')} value={yesNoLabel(q.airportPickupNeeded)} />
      </Section>

      <Section id={sid(6)} number={nextNo()} title={t('Medical Assistance')}>
        <AnswerRow label={t('Requires medical assistance?')} value={yesNoLabel(q.needsMedical)} />
        {q.needsMedical === 'yes' && <AnswerRow label={t('Assistance needed')} value={optionLabels(MEDICAL_OPTIONS, q.medicalNeeds)} />}
      </Section>

      <Section id={sid(7)} number={nextNo()} title={t('Accessibility Requirements')}>
        <AnswerRow
          label={t('Special assistance')}
          value={
            q.accessibilityNeeds.includes('other') && q.accessibilityOther
              ? `${optionLabels(ACCESSIBILITY_OPTIONS, q.accessibilityNeeds)} (${q.accessibilityOther})`
              : optionLabels(ACCESSIBILITY_OPTIONS, q.accessibilityNeeds)
          }
        />
      </Section>

      {q.registeringFor === 'family' && (
        <Section id={sid(8)} number={nextNo()} title={t('Dependents')}>
          <div className="grid grid-cols-2 gap-[12px]">
            <AnswerRow label={t('Any member below 10 years of age?')} value={yesNoLabel(q.memberUnder10)} />
            <AnswerRow label={t('Any member requires a Guardian?')} value={yesNoLabel(q.needsGuardianFlag)} />
            <AnswerRow label={t('Any member requires a Caregiver?')} value={yesNoLabel(q.needsCaregiverFlag)} />
          </div>
        </Section>
      )}

      <Section id={sid(9)} number={nextNo()} title={t('Emergency Contact')}>
        <div className="grid grid-cols-2 gap-[12px]">
          <AnswerRow label={t('Contact Name')} value={q.emergencyName} />
          <AnswerRow label={t('Relationship')} value={q.emergencyRelation} />
          <AnswerRow label={t('Mobile Number')} value={q.emergencyMobile} />
          <AnswerRow label={t('Alternate Contact Number')} value={q.emergencyAltMobile} />
        </div>
      </Section>

      <Section id={sid(10)} number={nextNo()} title={t('Confirmation')}>
        <div className="grid grid-cols-2 gap-[12px]">
          <AnswerRow label={t('Information accurate')} value={q.confirmAccurate ? t('Confirmed') : 'Not confirmed'} />
          <AnswerRow label={t('Agreed to guidelines')} value={q.confirmGuidelines ? t('Confirmed') : 'Not confirmed'} />
        </div>
      </Section>
    </div>
  )
}

/** The full 10-section registration questionnaire, shared by the standalone Registration
 *  Questionnaire screen and the Add People variation (rendered below the member list). `idPrefix`
 *  keeps section DOM ids unique when both instances could ever be mounted on the same page. */
export function QuestionnaireSections({ q, onChange, registrant, idPrefix = '', hideIntro = false, newFieldKeys = [], miqaatId, showErrors = false, grid = false }: {
  q: QuestionnaireAnswers
  onChange: (patch: Partial<QuestionnaireAnswers>) => void
  registrant: FamilyMember | undefined
  idPrefix?: string
  /** "Application form" layout: full-width stacked section cards (soft shadow), numbering dropped, and
   *  short paired fields (e.g. Emergency Contact) laid out 2-up to use the width. Opt-in per caller;
   *  default keeps the single-column numbered layout every existing screen uses. */
  grid?: boolean
  /** Hide sections 1 (Personal Information) and 2 (Attendance Details) — used by the Add People
   *  variation where those are already covered by the family selection above. */
  hideIntro?: boolean
  /** Admin-added question keys still unanswered — highlighted with a "New" badge + gold background
   *  and used as the auto-scroll target on the Edit Registration Form screen. */
  newFieldKeys?: Array<keyof QuestionnaireAnswers>
  /** Drives the Visa Document section's upload — omit to hide that section entirely (some callers
   *  don't have a miqaat context yet). */
  miqaatId?: string
  /** The caller has attempted to continue and `validateQuestionnaire` found a problem — every
   *  still-empty required field gets a red border + inline error text, not just the one the toast
   *  named, so it's obvious at a glance which fields are outstanding. Clears itself per-field as each
   *  is answered (each check re-evaluates on every render). */
  showErrors?: boolean
}) {
     const { tx, t } = useT()
  const set = onChange
  const toggleInList = (key: 'dietary' | 'medicalNeeds' | 'accessibilityNeeds', value: string) => {
    const list = q[key]
    set({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] } as Partial<QuestionnaireAnswers>)
  }
  const sid = (n: number) => `${idPrefix}section-${n}`
  const isNew = (key: keyof QuestionnaireAnswers) => newFieldKeys.includes(key)
  // Running display number so visible sections stay sequentially numbered even when some are hidden.
  let counter = 0
  const nextNo = () => ++counter
  const err = (bad: boolean) => showErrors && bad
  // Option lists (radio/checkbox rows) stack one-per-row by default; in grid mode they flow into as
  // many ~240px columns as the wide section card can fit (auto-fill), so short options don't stretch
  // across half the card. Collapses to a single column on narrow (mobile) cards.
  const optListCls = grid
    ? 'mt-[8px] grid gap-[10px] [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]'
    : 'mt-[8px] flex flex-col gap-[10px]'

  return (
    <SectionLayoutCtx.Provider value={{ grid }}>
    <div className="flex flex-col gap-[16px]">
      {!hideIntro && (
      <Section id={sid(1)} number={nextNo()} title={t('Personal Information')}>
        <div>
          <FieldLabel {...tx('Full Name (Auto-filled)')} />
          <TextInput value={registrant?.name ?? ''} disabled />
        </div>
        <div>
          <FieldLabel {...tx('ITS ID (Auto-filled)')} />
          <TextInput value={registrant?.its ?? ''} disabled />
        </div>
        <div>
          <FieldLabel required {...tx('Mobile Number')} />
          <TextInput value={q.mobile} onChange={(v) => set({ mobile: v.replace(/[^0-9+ ]/g, '') })} placeholder={t('Enter your mobile number')} type="tel" invalid={err(!q.mobile.trim())} />
          <FieldError show={err(!q.mobile.trim())} />
        </div>
        <div>
          <FieldLabel {...tx('Email Address (Optional)')} />
          <TextInput value={q.email} onChange={(v) => set({ email: v })} placeholder={t('Enter your email address')} type="email" />
        </div>
      </Section>
      )}

      {!hideIntro && (
      <Section id={sid(2)} number={nextNo()} title={t('Attendance Details')}>
        <div>
          <FieldLabel required {...tx('Will you be attending this Miqaat?')} />
          <YesNo value={q.attending} onChange={(v) => set({ attending: v })} invalid={err(!q.attending)} />
          <FieldError show={err(!q.attending)} />
        </div>
        <div>
          <FieldLabel required {...tx('Who are you registering?')} />
          <div className={optListCls}>
            {(Object.keys(REGISTERING_FOR_LABEL) as Array<keyof typeof REGISTERING_FOR_LABEL>).map((v) => (
              <RadioRow key={v} label={REGISTERING_FOR_LABEL[v]} active={q.registeringFor === v} onClick={() => set({ registeringFor: v })} invalid={err(!q.registeringFor)} />
            ))}
          </div>
          <FieldError show={err(!q.registeringFor)} />
        </div>
      </Section>
      )}

      <Section id={sid(3)} number={nextNo()} title={t('Accommodation')}>
        <div>
          <FieldLabel required {...tx('Do you require accommodation?')} />
          <YesNo value={q.needsAccommodation} onChange={(v) => set({ needsAccommodation: v })} invalid={err(!q.needsAccommodation)} />
          <FieldError show={err(!q.needsAccommodation)} />
        </div>
        {q.needsAccommodation === 'yes' && (
          <>
            <div>
              <FieldLabel required {...tx('Number of people requiring accommodation')} />
              <TextInput value={q.accommodationCount} onChange={(v) => set({ accommodationCount: v.replace(/[^0-9]/g, '') })} placeholder="e.g. 4" invalid={err(!q.accommodationCount.trim())} />
              <FieldError show={err(!q.accommodationCount.trim())} />
            </div>
            <div>
              <FieldLabel required {...tx('Preferred accommodation type')} />
              <div className={optListCls}>
                {ACCOMMODATION_TYPES.map((o) => (
                  <RadioRow key={o.value} label={o.label} active={q.accommodationType === o.value} onClick={() => set({ accommodationType: o.value })} invalid={err(!q.accommodationType)} />
                ))}
              </div>
              <FieldError show={err(!q.accommodationType)} />
            </div>
          </>
        )}
      </Section>

      <Section id={sid(4)} number={nextNo()} title={t('Food Arrangements')}>
        <div>
          <FieldLabel required {...tx('Do you require food arrangements?')} />
          <YesNo value={q.needsFood} onChange={(v) => set({ needsFood: v })} invalid={err(!q.needsFood)} />
          <FieldError show={err(!q.needsFood)} />
        </div>
        {q.needsFood === 'yes' && (
          <>
            <div>
              <FieldLabel required {...tx('Number of meals required')} />
              <TextInput value={q.mealCount} onChange={(v) => set({ mealCount: v.replace(/[^0-9]/g, '') })} placeholder={t('e.g. 3')} invalid={err(!q.mealCount.trim())} />
              <FieldError show={err(!q.mealCount.trim())} />
            </div>
            <div>
              <FieldLabel {...tx('Any dietary requirements?')} />
              <div className={optListCls}>
                {DIETARY_OPTIONS.map((o) => (
                  <CheckRow key={o.value} label={o.label} checked={q.dietary.includes(o.value)} onClick={() => toggleInList('dietary', o.value)} />
                ))}
              </div>
              {q.dietary.includes('other') && (
                <div className="mt-[10px]">
                  <TextInput value={q.dietaryOther} onChange={(v) => set({ dietaryOther: v })} placeholder={t('Please specify')} />
                </div>
              )}
            </div>
          </>
        )}
      </Section>

      <Section id={sid(5)} number={nextNo()} title={t('Travel Details')}>
        <div>
          <FieldLabel required {...tx('Do you require transportation?')} />
          <YesNo value={q.needsTravel} onChange={(v) => set({ needsTravel: v })} invalid={err(!q.needsTravel)} />
          <FieldError show={err(!q.needsTravel)} />
        </div>
        {q.needsTravel === 'yes' && (
          <>
            <div className="grid grid-cols-2 gap-[12px]">
              <div>
                <FieldLabel required {...tx('Arrival Date')} />
                <TextInput value={q.arrivalDate} onChange={(v) => set({ arrivalDate: v })} type="date" invalid={err(!q.arrivalDate)} />
                <FieldError show={err(!q.arrivalDate)} />
              </div>
              <div>
                <FieldLabel required {...tx('Departure Date')} />
                <TextInput value={q.departureDate} onChange={(v) => set({ departureDate: v })} type="date" invalid={err(!q.departureDate)} />
                <FieldError show={err(!q.departureDate)} />
              </div>
            </div>
            <div>
              <FieldLabel required {...tx('Mode of Travel')} />
              <div className={optListCls}>
                {TRAVEL_MODES.map((o) => (
                  <RadioRow key={o.value} label={o.label} active={q.travelMode === o.value} onClick={() => set({ travelMode: o.value })} invalid={err(!q.travelMode)} />
                ))}
              </div>
              <FieldError show={err(!q.travelMode)} />
            </div>
          </>
        )}
        <NewFieldWrap id={`${idPrefix}new-airportPickupNeeded`} active={isNew('airportPickupNeeded')}>
          <FieldLabel isNew={isNew('airportPickupNeeded')} {...tx('Do you need airport pickup assistance?')} />
          <YesNo value={q.airportPickupNeeded} onChange={(v) => set({ airportPickupNeeded: v })} />
        </NewFieldWrap>
      </Section>

      {miqaatId && (
        <Section id={`${idPrefix}section-visa`} number={nextNo()} title={t('Visa Document')}>
          <VisaUploadCard miqaatId={miqaatId} compact />
        </Section>
      )}

      <Section id={sid(6)} number={nextNo()} title={t('Medical Assistance')}>
        <div>
          <FieldLabel required {...tx('Do you require medical assistance during the event?')} />
          <YesNo value={q.needsMedical} onChange={(v) => set({ needsMedical: v })} invalid={err(!q.needsMedical)} />
          <FieldError show={err(!q.needsMedical)} />
        </div>
        {q.needsMedical === 'yes' && (
          <div>
            <FieldLabel required {...tx('Select all that apply')} />
            <div className={optListCls}>
              {MEDICAL_OPTIONS.map((o) => (
                <CheckRow key={o.value} label={o.label} checked={q.medicalNeeds.includes(o.value)} onClick={() => toggleInList('medicalNeeds', o.value)} invalid={err(q.medicalNeeds.length === 0)} />
              ))}
            </div>
            <FieldError show={err(q.medicalNeeds.length === 0)} message={t('Please select at least one option.')} />
          </div>
        )}
      </Section>

      <Section id={sid(7)} number={nextNo()} title={t('Accessibility Requirements')}>
        <div>
          <FieldLabel {...tx('Do you require any special assistance? Select all that apply.')} />
          <div className={optListCls}>
            {ACCESSIBILITY_OPTIONS.map((o) => (
              <CheckRow key={o.value} label={o.label} checked={q.accessibilityNeeds.includes(o.value)} onClick={() => toggleInList('accessibilityNeeds', o.value)} />
            ))}
          </div>
          {q.accessibilityNeeds.includes('other') && (
            <div className="mt-[10px]">
              <TextInput value={q.accessibilityOther} onChange={(v) => set({ accessibilityOther: v })} placeholder={t('Please specify')} />
            </div>
          )}
        </div>
      </Section>

      {q.registeringFor === 'family' && (
        <Section id={sid(8)} number={nextNo()} title={t('Dependents')}>
          <div>
            <FieldLabel required {...tx('Is any member below 10 years of age?')} />
            <YesNo value={q.memberUnder10} onChange={(v) => set({ memberUnder10: v })} invalid={err(!q.memberUnder10)} />
            <FieldError show={err(!q.memberUnder10)} />
          </div>
          <div>
            <FieldLabel required {...tx('Does any member require a Guardian?')} />
            <YesNo value={q.needsGuardianFlag} onChange={(v) => set({ needsGuardianFlag: v })} invalid={err(!q.needsGuardianFlag)} />
            <FieldError show={err(!q.needsGuardianFlag)} />
          </div>
          <div>
            <FieldLabel required {...tx('Does any member require a Caregiver?')} />
            <YesNo value={q.needsCaregiverFlag} onChange={(v) => set({ needsCaregiverFlag: v })} invalid={err(!q.needsCaregiverFlag)} />
            <FieldError show={err(!q.needsCaregiverFlag)} />
          </div>
        </Section>
      )}

      <Section id={sid(9)} number={nextNo()} title={t('Emergency Contact')}>
        {/* Grid mode lays these short fields across one row on wide cards (4-up, → 2-up on md, stacked
            on mobile) to use the width; default mode keeps them stacked via `contents`. */}
        <div className={grid ? 'grid grid-cols-1 gap-x-[16px] gap-y-[16px] sm:grid-cols-2 lg:grid-cols-4' : 'contents'}>
          <div>
            <FieldLabel required {...tx('Contact Name')} />
            <TextInput value={q.emergencyName} onChange={(v) => set({ emergencyName: v })} placeholder={t('Full name')} invalid={err(!q.emergencyName.trim())} />
            <FieldError show={err(!q.emergencyName.trim())} />
          </div>
          <div>
            <FieldLabel required {...tx('Relationship')} />
            <TextInput value={q.emergencyRelation} onChange={(v) => set({ emergencyRelation: v })} placeholder={t('e.g. Spouse, Parent, Sibling')} invalid={err(!q.emergencyRelation.trim())} />
            <FieldError show={err(!q.emergencyRelation.trim())} />
          </div>
          <div>
            <FieldLabel required {...tx('Mobile Number')} />
            <TextInput value={q.emergencyMobile} onChange={(v) => set({ emergencyMobile: v.replace(/[^0-9+ ]/g, '') })} placeholder={t('Enter mobile number')} type="tel" invalid={err(!q.emergencyMobile.trim())} />
            <FieldError show={err(!q.emergencyMobile.trim())} />
          </div>
          <NewFieldWrap id={`${idPrefix}new-emergencyAltMobile`} active={isNew('emergencyAltMobile')}>
            <FieldLabel isNew={isNew('emergencyAltMobile')} {...tx('Alternate Contact Number (Optional)')} />
            <TextInput value={q.emergencyAltMobile ?? ''} onChange={(v) => set({ emergencyAltMobile: v.replace(/[^0-9+ ]/g, '') })} placeholder={t('A backup number, if any')} type="tel" />
          </NewFieldWrap>
        </div>
      </Section>

      <Section id={sid(10)} number={nextNo()} title={t('Confirmation')}>
        <CheckRow label={t('I confirm that all the information provided is accurate.')} checked={q.confirmAccurate} onClick={() => set({ confirmAccurate: !q.confirmAccurate })} invalid={err(!q.confirmAccurate)} />
        <CheckRow label={<>{t('I agree to follow the Miqaat guidelines and event regulations.')} <span role="link" tabIndex={0} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-[3px] cursor-pointer text-[#a8843e] underline hover:text-[#8a6c30]">terms and conditions<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg></span></>} checked={q.confirmGuidelines} onClick={() => set({ confirmGuidelines: !q.confirmGuidelines })} invalid={err(!q.confirmGuidelines)} />
      </Section>
    </div>
    </SectionLayoutCtx.Provider>
  )
}
