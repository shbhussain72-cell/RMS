import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import StickyFooter from '../components/figma/StickyFooter'
import { AllocationGroupCard, AllocationDesktopTable, CityHeader, ZoneHeader } from '../components/figma/AllocationGroupCard'
import { family, zonesByCityId, miqaats } from '../data/seed'
import { buildAllGroups } from '../lib/group'
import { useStore } from '../store'
import { QuestionnaireSummary } from '../components/questionnaire/QuestionnaireFields'
import { plural, useT } from '../i18n'

const FONT = 'Mulish, system-ui, sans-serif'
const SERIF = 'Marcellus, Georgia, serif'

function ChangeZoneButton({ onClick }: { onClick: () => void }) {
  const { tx, tdAuthored } = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 flex h-[36px] items-center gap-[7px] rounded-full border border-[#1f5a44] bg-white px-[14px]"
    >
      <span className="text-[13px] font-bold text-[#1f5a44]" style={{ fontFamily: FONT }} {...tx('Change zone')} />
      <svg viewBox="0 0 16 16" fill="none" className="size-[13px]">
        <path d="M13 8a5 5 0 11-1.46-3.54M13 2v3h-3" stroke="#1f5a44" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export default function ZoneAllocation() {
  const { t, tx, tdAuthored } = useT()
  const { id } = useParams()
  const nav = useNavigate()
  const flow = useStore((s) => s.flow)
  const miqaat = miqaats.find((x) => x.id === id) ?? miqaats[0]

  const selectedIds = flow.selectedMemberIds.length > 0 ? flow.selectedMemberIds : family.map((f) => f.id)
  const groups = buildAllGroups(selectedIds, flow.guardians, flow.caregivers, flow.invites).map((g) => ({
    ...g,
    label: g.label?.replace('registered together', 'reserved together'),
  }))

  const cityId = flow.confirmedCity?.id ?? 'colombo'
  const cityName = flow.confirmedCity?.name ?? 'Colombo'
  const zones = zonesByCityId[cityId] ?? zonesByCityId['colombo'] ?? []

  // Each group's allocated zone — persisted map, else spread groups across the city's zones.
  const zoneOf = (gi: number) => {
    const z = flow.groupZones[gi]
    if (z) return z
    const zz = zones[gi % Math.max(1, zones.length)]
    return zz ? { id: zz.id, name: zz.name, cityId, cityName } : null
  }

  // Build city → ordered zones → group indices.
  const cityOrder: string[] = []
  const byCity = new Map<string, { cityName: string; type?: 'host' | 'relay'; zoneOrder: string[]; byZone: Map<string, { zoneName: string; groupIndices: number[] }> }>()
  groups.forEach((_, gi) => {
    const z = zoneOf(gi)
    if (!z) return
    if (!byCity.has(z.cityId)) { byCity.set(z.cityId, { cityName: z.cityName, type: flow.groupCities[gi]?.type ?? flow.confirmedCity?.type, zoneOrder: [], byZone: new Map() }); cityOrder.push(z.cityId) }
    const ce = byCity.get(z.cityId)!
    if (!ce.byZone.has(z.id)) { ce.byZone.set(z.id, { zoneName: z.name, groupIndices: [] }); ce.zoneOrder.push(z.id) }
    ce.byZone.get(z.id)!.groupIndices.push(gi)
  })

  const memberTotal = groups.reduce((n, g) => n + g.members.length, 0)

  return (
    <PhoneScreen
      footer={(
        <StickyFooter
          caption={<bdi {...tdAuthored(miqaat.title)} />}
          title={tx(plural(memberTotal, '{n} Member', '{n} Members'), { n: memberTotal })}
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
            { label: t('Zone Allocation') },
          ]}
          onNavigate={(to) => nav(to)}
          onBack={() => nav(-1)}
        />
      </div>

      <h1 className="mt-[14px] px-[16px] sm:px-0 text-[28px] leading-[34px] text-[#15402f]" style={{ fontFamily: SERIF }} {...tx('Zone Allocation')} />

      <div className="mx-[16px] sm:mx-0 mt-[20px] pb-[100px] flex flex-col gap-[8px]">
        {cityOrder.map((cid, ci) => {
          const ce = byCity.get(cid)!
          return (
            <div key={cid} className="flex flex-col">
              {ci > 0 && <div className="my-[20px] border-t border-[#ece4d2]" />}
              <CityHeader
                name={ce.cityName}
                type={ce.type}
                action={ci > 0 ? <ChangeZoneButton onClick={() => nav(`/miqaats/${id}/zone`)} /> : undefined}
              />
              <div className="mt-[16px] flex flex-col gap-[20px]">
                {ce.zoneOrder.map((zid) => {
                  const ze = ce.byZone.get(zid)!
                  const count = ze.groupIndices.reduce((n, gi) => n + groups[gi].members.length, 0)
                  return (
                    <div key={zid} className="flex flex-col gap-[12px]">
                      <ZoneHeader name={ze.zoneName} count={count} />
                      {/* Mobile: cards */}
                      <div className="flex flex-col gap-[14px] sm:hidden">
                        {ze.groupIndices.map((gi) => (
                          <AllocationGroupCard key={gi} group={groups[gi]} />
                        ))}
                      </div>
                      {/* Desktop: Add-Group-style table */}
                      <div className="hidden sm:block">
                        <AllocationDesktopTable groups={ze.groupIndices.map((gi) => groups[gi])} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {/* Registration form — view only (read-only answers, no edit control here), so "what did I
            submit" is visible from every "View Members" destination, not just before submitting. */}
        <div className="mt-[20px] flex flex-col gap-[14px]">
          <div className="flex h-[18px] items-center">
            <div className="h-px flex-1 bg-gradient-to-r from-[#e3cd96] to-[rgba(227,205,150,0)]" />
            <span className="mx-[10px] whitespace-nowrap text-center text-[16px] uppercase leading-[18px] tracking-[2.5px] text-[#a8843e]"
              style={{ fontFamily: FONT, fontWeight: 700 }} {...tx('Registration Form')} />
            <div className="h-px flex-1 bg-gradient-to-r from-[rgba(227,205,150,0)] to-[#e3cd96]" />
          </div>
          <QuestionnaireSummary q={flow.questionnaire} hideIntro />
        </div>
      </div>
    </PhoneScreen>
  )
}
