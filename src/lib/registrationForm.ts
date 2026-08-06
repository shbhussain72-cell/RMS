import { miqaats, type Miqaat } from '../data/seed'
import { journeyFor, type QuestionnaireAnswers, type RegistrationFlow } from '../store'

/** Fields the admin can add to the registration form after a user has already submitted it.
 *  Demo-only: real field metadata (id/label/section) would come from an admin-managed schema
 *  rather than being hardcoded here. */
export const NEW_QUESTION_KEYS: Array<keyof QuestionnaireAnswers> = ['airportPickupNeeded', 'emergencyAltMobile']

function isNewQuestionAnswered(q: QuestionnaireAnswers, key: (typeof NEW_QUESTION_KEYS)[number]): boolean {
  const v = q[key]
  // `undefined` (not just `null`) shows up for any journey persisted before this field existed —
  // treat it the same as unanswered rather than accidentally counting it as complete.
  if (v == null) return false
  return typeof v === 'string' ? v.trim().length > 0 : true
}

/** Admin-added question keys this journey hasn't answered yet — empty when the event has no new
 *  questions, or the user has already completed them. */
export function pendingNewQuestionKeys(m: Miqaat, flow: RegistrationFlow): Array<keyof QuestionnaireAnswers> {
  if (!m.formNewQuestions || !flow.submitted) return []
  return NEW_QUESTION_KEYS.filter((k) => !isNewQuestionAnswered(flow.questionnaire, k))
}

export function hasPendingNewQuestions(m: Miqaat, flow: RegistrationFlow): boolean {
  return pendingNewQuestionKeys(m, flow).length > 0
}

/** The registration form stays editable from submission until the user's city is confirmed — once
 *  City Selection has been completed for this journey, responses are locked (the registration
 *  itself, separately, is always locked — only the questionnaire responses are ever editable). */
export function isFormEditable(flow: RegistrationFlow): boolean {
  return flow.submitted && flow.confirmedCity === null
}

/** "23 Jul 2026" style date for the Registration Form card's "Last updated" row. */
export function formatFormUpdated(iso: string | null): string {
  if (!iso) return 'Not yet updated'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Whether ANY event with admin-added new questions has pending ones for the current user — drives
 *  the "Registration Form Updated" notification's visibility. Looks up whichever seed event(s) carry
 *  `formNewQuestions` so the notification stays correct even if more demo events add the flag later. */
export function formNotificationPending(flow: RegistrationFlow, registrations: Record<string, RegistrationFlow>): boolean {
  return miqaats
    .filter((m) => m.formNewQuestions)
    .some((m) => hasPendingNewQuestions(m, journeyFor(flow, registrations, m.id)))
}
