import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import StickyFooter from '../components/figma/StickyFooter'
import { AllocationGroupCard, AllocationDesktopTable, CityHeader } from '../components/figma/AllocationGroupCard'
import { family, miqaats } from '../data/seed'
import { buildAllGroups } from '../lib/group'
import { useStore } from '../store'
import { QuestionnaireSummary } from '../components/questionnaire/QuestionnaireFields'
import { useT } from '../i18n'

const SERIF = 'Marcellus, Georgia, serif'

export default function CityAllocation() {
  const { t, tx } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const flow = useStore((s) => s.flow)
  const miqaat = miqaats.find((x) => x.id === id) ?? miqaats[0]

  const selectedIds = flow.selectedMemberIds.length > 0 ? flow.selectedMemberIds : family.map((f) => f.id)
  const groups = buildAllGroups(selectedIds, flow.guardians, flow.caregivers, flow.invites).map((g) => ({
    ...g,
    label: g.label?.replace('registered together', 'reserved together'),
  }))

  // Each group's allocated city — persisted per-group map, else the single confirmed city.
  const fallback = flow.confirmedCity
  const order: string[] = []
  const byCity = new Map<string, { name: string; type?: 'host' | 'relay'; groupIndices: number[] }>()
  groups.forEach((_, gi) => {
    const c = flow.groupCities[gi] ?? (fallback ? { id: fallback.id, name: fallback.name, type: fallback.type } : null)
    if (!c) return
    if (!byCity.has(c.id)) { byCity.set(c.id, { name: c.name, type: c.type, groupIndices: [] }); order.push(c.id) }
    byCity.get(c.id)!.groupIndices.push(gi)
  })
  const cities = order.map((cid) => ({ id: cid, ...byCity.get(cid)! }))
  const memberTotal = cities.reduce((n, c) => n + c.groupIndices.reduce((s, gi) => s + groups[gi].members.length, 0), 0)

  return (
    <PhoneScreen
      statusTone="light"
      footer={(
        <StickyFooter
          caption={miqaat.title}
          title={`${memberTotal} Members`}
          button={t('Go Home')}
          onButton={() => nav('/miqaats')}
        />
      )}
    >
      <AppBar notificationCount={3} />

      <div className="ms-[16px] sm:ms-0 mt-[12px]">
        <Breadcrumb
          items={[
            { label: 'Home', to: '/miqaats' },
            { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
            { label: t('City Allocation') },
          ]}
          onNavigate={(to) => nav(to)}
          onBack={() => nav(-1)}
        />
      </div>

      <h1 className="mt-[14px] px-[16px] sm:px-0 text-[28px] leading-[34px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('City Allocation')} />

      <div className="mx-[16px] sm:mx-0 mt-[20px] pb-[100px] flex flex-col gap-[26px]">
        {cities.map((city) => {
          const memberCount = city.groupIndices.reduce((n, gi) => n + groups[gi].members.length, 0)
          return (
            <div key={city.id} className="flex flex-col gap-[14px]">
              <CityHeader name={city.name} count={memberCount} type={city.type} />
              {/* Mobile: cards */}
              <div className="flex flex-col gap-[16px] sm:hidden">
                {city.groupIndices.map((gi) => (
                  <AllocationGroupCard key={gi} group={groups[gi]} />
                ))}
              </div>
              {/* Desktop: Add-Group-style table */}
              <div className="hidden sm:block">
                <AllocationDesktopTable groups={city.groupIndices.map((gi) => groups[gi])} />
              </div>
            </div>
          )
        })}
        {/* Registration form — view only (read-only answers, no edit control here), so "what did I
            submit" is visible from every "View Members" destination, not just before submitting. */}
        <div className="flex flex-col gap-[14px]">
          <div className="flex h-[18px] items-center">
            <div className="h-px flex-1 bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
            <span className="mx-[10px] whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
              style={{ fontFamily: 'Mulish, system-ui, sans-serif', fontWeight: 700 }} {...tx('Registration Form')} />
            <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
          </div>
          <QuestionnaireSummary q={flow.questionnaire} hideIntro />
        </div>
      </div>
    </PhoneScreen>
  )
}
