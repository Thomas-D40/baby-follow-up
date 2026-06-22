import { apiGet } from './client'

// --- Calendrier (Épic 6) ---

// Événements d'un jour (US6.1), liste chrono triée par heure. `date` = YYYY-MM-DD (Europe/Paris) ;
// absent ⇒ aujourd'hui (Paris) côté serveur (D6-D). Renvoie un tableau de CalendarEventResponse.
export function getDayEvents(babyId, date) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiGet(`/babies/${babyId}/events${qs}`)
}

// Totaux quotidiens (US6.3) : { date, totalMilkMl, totalSleepMinutes, stoolCount }. `date` = YYYY-MM-DD (Paris).
export function getDailyTotals(babyId, date) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiGet(`/babies/${babyId}/daily-totals${qs}`)
}
