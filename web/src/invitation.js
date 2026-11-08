// Pure model of a pending sharing invitation (Épic 17, US17.4).

import { formatParisTime } from './calendar'

const PARIS_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris',
})

// "11/11/2026 à 14:05", in Europe/Paris whatever the device time zone.
export function formatInvitationExpiry(iso) {
  return `${PARIS_DATE.format(new Date(iso))} à ${formatParisTime(iso)}`
}
