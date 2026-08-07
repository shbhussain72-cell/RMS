import { useNavigate, useParams } from 'react-router-dom'
import PhoneScreen from '../components/figma/PhoneScreen'
import AppBar from '../components/figma/AppBar'
import Breadcrumb from '../components/figma/Breadcrumb'
import { useT } from '../i18n'

/**
 * Raza letter — the actual issued letter, view only (no download affordance anywhere on this page).
 * Deliberately its own page, separate from `RazaView` (the city/zone allocation breakdown) — the two
 * are different content and were getting confused when the letter was embedded inside the allocation
 * page. Reached from the Raza status card's "View" action (Home banner, detail hero, Modify
 * Registration) once Raza has been issued.
 */
export default function RazaLetter() {
  const { t } = useT()
  const { id } = useParams()
  const nav = useNavigate()

  return (
    <PhoneScreen statusTone="light">
      <AppBar notificationCount={3} />

      <div className="ms-[16px] sm:ml-0 mt-[12px]">
        <Breadcrumb
          items={[
            { label: 'Home', to: '/miqaats' },
            { label: t('Miqaat detail page'), to: `/miqaats/${id}` },
            { label: t('Raza') },
          ]}
          onNavigate={(to) => nav(to)}
          onBack={() => nav(-1)}
        />
      </div>

      <div className="mx-[16px] sm:mx-0 mt-[16px] mb-[24px] flex justify-center overflow-hidden rounded-[16px] border border-[#ece4d2] bg-white shadow-[0px_6px_22px_-8px_rgba(21,64,47,0.18)]">
        {/* Mobile-optimized crop on small screens, the full web version above the sm breakpoint. */}
        <img src="/figma/raza-letter-mobile.jpg" alt={t('Raza letter')} className="w-full object-contain sm:hidden" />
        <img src="/figma/raza-letter-web.jpg" alt={t('Raza letter')} className="hidden max-h-[85vh] w-auto object-contain sm:block" />
      </div>
    </PhoneScreen>
  )
}
