import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import { family } from '../data/seed'
import { useStore, type QuestionnaireAnswers } from '../store'
import { QuestionnaireSections } from '../components/questionnaire/QuestionnaireFields'

const FONT_SANS = 'Mulish, system-ui, sans-serif'
const FONT_SERIF = 'Marcellus, Georgia, serif'

export default function RegistrationQuestionnaire() {
  const { id } = useParams()
  const nav = useNavigate()
  const flow = useStore((s) => s.flow)
  const setActiveMiqaat = useStore((s) => s.setActiveMiqaat)
  const setQuestionnaire = useStore((s) => s.setQuestionnaire)
  const q = flow.questionnaire

  useEffect(() => {
    if (id) setActiveMiqaat(id)
  }, [id, setActiveMiqaat])

  const registrant = family.find((f) => f.role === 'registrant') ?? family[0]

  const set = (patch: Partial<QuestionnaireAnswers>) => setQuestionnaire(patch)

  const handleSubmit = () => {
    setQuestionnaire({ completed: true })
    if (id) nav(`/miqaats/${id}/people`)
  }

  return (
    <PhoneScreen>
      <div>
        <AppBar notificationCount={3} onBellClick={() => {}} />
      </div>

      <div className="ml-[16px] mt-[13px] sm:ml-0 sm:mt-6">
        <Breadcrumb
          items={[
            { label: 'Home', to: '/miqaats' },
            { label: 'Miqaat detail page', to: `/miqaats/${id}` },
            { label: 'Registration Questionnaire' },
          ]}
          onNavigate={(to) => nav(to)}
          onBack={() => nav(-1)}
        />
      </div>

      <div className="mx-auto w-full max-w-[640px] px-[16px] pb-[32px] sm:px-0 sm:py-10">
        <h2 className="mt-[20px] text-[22px] leading-[28px] tracking-[0.2px] text-[#15402f] sm:text-[28px]" style={{ fontFamily: FONT_SERIF }}>
          Miqaat Event Registration Questionnaire
        </h2>
        <p className="mt-[6px] text-[14px] leading-[20px] text-[#5a6660]" style={{ fontFamily: FONT_SANS }}>
          Please complete every section below before submitting your registration.
        </p>

        <div className="mt-[20px]">
          <QuestionnaireSections q={q} onChange={set} registrant={registrant} hideIntro miqaatId={id} />

          <button
            type="button"
            onClick={handleSubmit}
            className="mt-[16px] flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#1f5a44] shadow-[0_6px_22px_-8px_rgba(21,64,47,0.18)] transition-colors hover:bg-[#194a38]"
          >
            <span className="text-[15px] font-bold text-white" style={{ fontFamily: FONT_SANS }}>Submit</span>
          </button>
        </div>
      </div>
    </PhoneScreen>
  )
}
