import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './store'
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

function RequireAuth({ children }: { children: ReactNode }) {
  const loggedIn = useStore((s) => s.loggedIn)
  return loggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
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
  )
}
