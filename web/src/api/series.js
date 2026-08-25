import { apiGet } from './client'

// --- Tendances : série temporelle agrégée (vue calendrier élargie) ---

// `bucket` reste un paramètre requis du contrat, mais `day` en est la seule valeur acceptée depuis
// l'Épic 14 : constante ici plutôt que traversant cinq fonctions sans jamais varier.
const BUCKET = 'day'

// Totaux agrégés par jour sur la plage [from, to] (dates YYYY-MM-DD, Europe/Paris, bornes incluses).
// Renvoie { from, to, points: [{ date, totalMilkMl, totalSleepMinutes, stoolCount }] }, un point par
// jour en ordre chronologique.
export function getTotalsSeries(babyId, { from, to }) {
  const qs = new URLSearchParams({ from, to, bucket: BUCKET }).toString()
  return apiGet(`/babies/${babyId}/totals-series?${qs}`)
}
