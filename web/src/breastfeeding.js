// Pure model of a breastfeeding session (Épic 18, US18.2).

import { formatParisTime, parisToday } from './calendar'

export const BREAST_SIDE_LABEL = { left: 'Gauche', right: 'Droit' }

const MIN_DURATION_MINUTES = 1
const MAX_DURATION_MINUTES = 120
const DURATION_ERROR = 'Durée invalide (nombre entier de 1 à 120 min).'

const PARIS_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris',
})

// Optional field: empty means "no duration". Digits only, so "7,5" and "7.5" are refused here
// instead of being silently truncated by the server (same guard as the bottle quantity).
export function parseDuration(raw) {
  const s = String(raw ?? '').trim()
  if (s === '') return { ok: true, value: null }
  if (!/^\d+$/.test(s)) return { ok: false, error: DURATION_ERROR }
  const n = Number(s)
  if (n < MIN_DURATION_MINUTES || n > MAX_DURATION_MINUTES) return { ok: false, error: DURATION_ERROR }
  return { ok: true, value: n }
}

// Recap row detail: the parts that are present, "—" when there is none (D18-V).
export function describeBreastfeeding({ side, durationMinutes }) {
  const parts = []
  if (side) parts.push(BREAST_SIDE_LABEL[side])
  if (durationMinutes != null) parts.push(`${durationMinutes} min`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

// Reminder shown above the form (D18-W). Day and time are rendered in Europe/Paris; "another day"
// means a different Paris date than `now`.
export function formatLastBreastfeeding(event, now = new Date()) {
  if (!event) return null
  const side = event.side ? BREAST_SIDE_LABEL[event.side].toLowerCase() : 'côté non précisé'
  const when = new Date(event.occurredAt)
  const time = formatParisTime(event.occurredAt)
  if (parisToday(when) === parisToday(now)) return `Dernière tétée : ${side}, à ${time}`
  return `Dernière tétée : ${side}, le ${PARIS_DAY_MONTH.format(when)} à ${time}`
}
