import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import { family, miqaats } from '../data/seed'
import { useStore, type QuestionnaireAnswers } from '../store'
import { QuestionnaireSections, QuestionnaireSummary } from '../components/questionnaire/QuestionnaireFields'
import { pendingNewQuestionKeys, isFormEditable } from '../lib/registrationForm'
import { useT } from '../i18n'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, Georgia, serif'

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[17px] shrink-0">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" stroke="#8a6a1e" strokeWidth="1.6" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="#8a6a1e" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function AlertDotIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="mt-[1px] size-[16px] shrink-0">
      <circle cx="10" cy="10" r="7.4" stroke="#c8911f" strokeWidth="1.4" />
      <path d="M10 9v4" stroke="#c8911f" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.4" r="1" fill="#c8911f" />
    </svg>
  )
}

export default function EditRegistrationForm() {
  const { t, tx } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const flow = useStore((s) => s.flow)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const setQuestionnaire = useStore((s) => s.setQuestionnaire)
  const m = miqaats.find((x) => x.id === id) ?? miqaats[0]
  const registrant = family.find((f) => f.role === 'registrant') ?? family[0]
  const scrolledRef = useRef(false)

  useEffect(() => {
    if (id) setActiveMiqaat(id)
  }, [id, setActiveMiqaat])

  const q = flow.questionnaire
  const editable = isFormEditable(flow)
  const pendingKeys = pendingNewQuestionKeys(m, flow)

  // Auto-scroll to the first incomplete admin-added question, once, after the form has painted.
  useEffect(() => {
    if (scrolledRef.current || !editable || pendingKeys.length === 0) return
    scrolledRef.current = true
    const t = window.setTimeout(() => {
      document.getElementById(`new-${pendingKeys[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 400)
    return () => window.clearTimeout(t)
  }, [editable, pendingKeys])

  const set = (patch: Partial<QuestionnaireAnswers>) => setQuestionnaire(patch)
  const goBack = () => (id ? nav(`/miqaats/${id}`) : nav('/miqaats'))

  return (
    <PhoneScreen>
      <div>
        <AppBar notificationCount={3} onBellClick={() => {}} />
      </div>

      <div className="ms-[16px] mt-[13px] sm:ml-0 sm:mt-6">
        <Breadcrumb
          items={[
            { label: 'Home', to: '/miqaats' },
            { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
            { label: editable ? 'Edit Registration Form' : t('Registration Responses') },
          ]}
          onNavigate={(to) => nav(to)}
          onBack={() => nav(-1)}
        />
      </div>

      <div className="mx-auto w-full max-w-[640px] px-[16px] pb-[32px] sm:px-0 sm:py-10">
        <h2 className="mt-[20px] text-[22px] leading-[28px] tracking-[0.2px] text-[#15402f] sm:text-[28px]" style={{ fontFamily: FONT_SERIF }}>
          {editable ? 'Edit Registration Form' : t('Registration Responses')}
        </h2>
        <p className="mt-[6px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>
          {editable
            ? 'Your registration is confirmed. You can still update your accommodation, travel, food, and medical preferences below.'
            : t('Your registration is confirmed and City Selection has opened, so these responses can no longer be changed.')}
        </p>

        {!editable && (
          <div className="mt-[16px] flex items-start gap-[10px] rounded-[14px] border border-[#e7dfc9] bg-[#f6f4ef] px-[16px] py-[13px]">
            <LockIcon />
            <p className="text-[13.5px] leading-[19px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>
              <strong className="font-bold text-[#23302a]" {...tx('Form locked.')} />{' '}
              <span {...tx('Reach out to your Miqaat coordinator if something here needs correcting.')} />
            </p>
          </div>
        )}

        {editable && pendingKeys.length > 0 && (
          <div className="mt-[16px] flex items-start gap-[10px] rounded-[14px] border border-[#f0d9a0] bg-[#fdf6e5] px-[16px] py-[13px]">
            <AlertDotIcon />
            <p className="text-[13.5px] leading-[19px] text-[#8a6a1e]" style={{ fontFamily: FONT_SANS }}>
              <strong className="font-bold">{pendingKeys.length} new question{pendingKeys.length > 1 ? 's' : ''} added.</strong>{' '}
              Please complete {pendingKeys.length > 1 ? 'them' : 'it'} before City Selection opens.
            </p>
          </div>
        )}

        <div className="mt-[20px]">
          {editable ? (
            <>
              <QuestionnaireSections q={q} onChange={set} registrant={registrant} hideIntro newFieldKeys={pendingKeys} />
              <button
                type="button"
                onClick={goBack}
                className="mt-[16px] flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] shadow-[0_6px_22px_-8px_rgba(21,64,47,0.18)] transition-colors hover:bg-[#194a38]"
              >
                <span className="text-[15px] font-bold text-white" style={{ fontFamily: FONT_SANS }} {...tx('Save & Close')} />
              </button>
            </>
          ) : (
            <>
              <QuestionnaireSummary q={q} hideIntro />
              <button
                type="button"
                onClick={goBack}
                className="mt-[16px] flex h-[52px] w-full items-center justify-center rounded-[14px] border border-[#e7dfc9] bg-white transition-colors hover:border-[#c2a04e]"
              >
                <span className="text-[15px] font-bold text-[#15402f]" style={{ fontFamily: FONT_SANS }} {...tx('Back to Event')} />
              </button>
            </>
          )}
        </div>
      </div>
    </PhoneScreen>
  )
}
