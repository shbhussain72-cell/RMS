import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useStore } from './store'
import { miqaats } from './data/seed'
import Login from './screens/Login'
import MiqaatList from './screens/MiqaatList'
import MiqaatDetail from './screens/MiqaatDetail'
import AddPeople from './screens/AddPeople'
import RegistrationQuestionnaire from './screens/RegistrationQuestionnaire'
import EditRegistrationForm from './screens/EditRegistrationForm'
import InviteMehmaan from './screens/InviteMehmaan'
import Review from './screens/Review'
import Success from './screens/Success'
import PreferredCity from './screens/PreferredCity'
import CitySelection from './screens/CitySelection'
import ArrangeCities from './screens/ArrangeCities'
import Araz from './screens/Araz'
import ZoneSelection from './screens/ZoneSelection'
import ManageReservations from './screens/ManageReservations'
import HostCityMove from './screens/HostCityMove'
import CityAllocation from './screens/CityAllocation'
import ZoneAllocation from './screens/ZoneAllocation'
import Roster from './screens/Roster'
import RazaView from './screens/RazaView'
import RazaLetter from './screens/RazaLetter'
import Notifications from './screens/Notifications'
import JoinGroup from './screens/JoinGroup'
import EventJourney from './screens/EventJourney'
import type { ReactNode } from 'react'
import RouteErrorBoundary from './components/RouteErrorBoundary'

/**
 * Validates `:id` against the seed before any screen reads it.
 *
 * ── WHY HERE AND NOT IN THE FOURTEEN SCREENS ─────────────────────────────────────
 *
 * Every screen behind an `:id` resolves the miqaat itself, and they do it three different
 * ways: `?? miqaats[0]`, `?? miqaats.find(m => m.id === 'eg-cityopen')!`, and no fallback at
 * all. The first two are the dangerous ones — on an unknown id they do not blank, they
 * silently render a DIFFERENT event, so a bad deep link shows someone a real registration
 * screen for the wrong miqaat with no indication anything is wrong. Patching fourteen call
 * sites would leave the fifteenth to be written later.
 *
 * Checking once, above the screens, makes the unknown-id case unreachable for all of them and
 * turns those fallbacks into what they read as: defaults that never fire.
 *
 * `useParams().id` is undefined on routes with no `:id`, so this is a no-op for `/miqaats`,
 * `/notifications` and `/join-group` and needs no per-route opt-in.
 */
function RequireMiqaat({ children }: { children: ReactNode }) {
  const { id } = useParams()
  if (id !== undefined && !miqaats.some((m) => m.id === id)) {
    // `replace` so the bad URL does not sit in history for the back button to return to.
    // The toast copy lives on the destination screen — see MiqaatList's `unknownMiqaat` state.
    return <Navigate to="/miqaats" replace state={{ unknownMiqaat: true }} />
  }
  return <>{children}</>
}

function RequireAuth({ children }: { children: ReactNode }) {
  const loggedIn = useStore((s) => s.loggedIn)
  if (!loggedIn) return <Navigate to="/login" replace />
  // Auth first, then existence: an unknown id must not leak "this event does not exist" to a
  // signed-out visitor, and the login redirect has to win either way.
  return <RequireMiqaat>{children}</RequireMiqaat>
}

export default function App() {
  return (
    /* One boundary ABOVE <Routes>, not one per route. A throw during a route's first render can
       happen before that route's own element is mounted, so a per-route boundary would sit inside
       the thing that failed and never catch it. Placed here it also covers the router's own
       transition work, and it resets on pathname change (see RouteErrorBoundary) so navigating
       away is always a way out. */
    <RouteErrorBoundary>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/miqaats" replace />} />
      <Route
        path="/miqaats"
        element={
          <RequireAuth>
            <MiqaatList />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id"
        element={
          <RequireAuth>
            <MiqaatDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/questionnaire"
        element={
          <RequireAuth>
            <RegistrationQuestionnaire />
          </RequireAuth>
        }
      />
      {/* Post-registration: edit the registration form's responses (or view them, once locked) */}
      <Route
        path="/miqaats/:id/edit-form"
        element={
          <RequireAuth>
            <EditRegistrationForm />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/people"
        element={
          <RequireAuth>
            <AddPeople />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/invite"
        element={
          <RequireAuth>
            <InviteMehmaan />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/review"
        element={
          <RequireAuth>
            <Review />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/success"
        element={
          <RequireAuth>
            <Success />
          </RequireAuth>
        }
      />
      {/* Preferred city ranking (pre-selection, optional) */}
      <Route
        path="/miqaats/:id/preferred-city"
        element={
          <RequireAuth>
            <PreferredCity />
          </RequireAuth>
        }
      />
      {/* Arrange My Cities — post-registration setup step that lays out which city appears in which
          card on City Selection (host slot, preferred slots, relay order). Layout only — no
          reservation happens here. */}
      <Route
        path="/miqaats/:id/arrange"
        element={
          <RequireAuth>
            <ArrangeCities />
          </RequireAuth>
        }
      />
      {/* Live city selection — when city_open status */}
      <Route
        path="/miqaats/:id/city"
        element={
          <RequireAuth>
            <CitySelection />
          </RequireAuth>
        }
      />
      {/* Araz — early preferred-city submission (Host + Relay), a preference only. Available with or
          without registration; enabled per-event via the Miqaat `araz` flag. */}
      <Route
        path="/miqaats/:id/araz"
        element={
          <RequireAuth>
            <Araz />
          </RequireAuth>
        }
      />
      {/* Zone selection — after city is confirmed */}
      <Route
        path="/miqaats/:id/zone"
        element={
          <RequireAuth>
            <ZoneSelection />
          </RequireAuth>
        }
      />
      {/* Manage / modify an existing reservation (change city, zone, or cancel) */}
      <Route
        path="/miqaats/:id/manage"
        element={
          <RequireAuth>
            <ManageReservations />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/manage/host"
        element={
          <RequireAuth>
            <HostCityMove />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/manage/relay"
        element={
          <RequireAuth>
            <HostCityMove mode="relay" />
          </RequireAuth>
        }
      />
      {/* Allocation detail views — opened from the "View" action on the status tracker */}
      <Route
        path="/miqaats/:id/city-allocation"
        element={
          <RequireAuth>
            <CityAllocation />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/zone-allocation"
        element={
          <RequireAuth>
            <ZoneAllocation />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/roster"
        element={
          <RequireAuth>
            <Roster />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/raza"
        element={
          <RequireAuth>
            <RazaView />
          </RequireAuth>
        }
      />
      <Route
        path="/miqaats/:id/raza-letter"
        element={
          <RequireAuth>
            <RazaLetter />
          </RequireAuth>
        }
      />
      {/* Event Journey — full-page calendar + milestone timeline */}
      <Route
        path="/miqaats/:id/timeline"
        element={
          <RequireAuth>
            <EventJourney />
          </RequireAuth>
        }
      />
      <Route
        path="/notifications"
        element={
          <RequireAuth>
            <Notifications />
          </RequireAuth>
        }
      />
      <Route
        path="/join-group"
        element={
          <RequireAuth>
            <JoinGroup />
          </RequireAuth>
        }
      />
        <Route path="*" element={<Navigate to="/miqaats" replace />} />
      </Routes>
    </RouteErrorBoundary>
  )
}
