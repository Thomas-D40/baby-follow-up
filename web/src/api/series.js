import { apiGet } from './client'

// --- Tendances : série temporelle agrégée (vue calendrier élargie) ---

// Totaux agrégés par bucket sur la plage [from, to] (dates YYYY-MM-DD, Europe/Paris, bornes incluses).
// `bucket` = day | week | month. Renvoie { bucket, from, to, points: [{ date, bottleCount,
// totalMilkMl, totalSleepMinutes, stoolCount }] }, un point par bucket en ordre chronologique.
export function getTotalsSeries(babyId, { from, to, bucket }) {
  const qs = new URLSearchParams({ from, to, bucket }).toString()
  return apiGet(`/babies/${babyId}/totals-series?${qs}`)
}
