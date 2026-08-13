import { apiSend } from './client'

// --- Acte de change (US13.2, Lot 4, D13-G) ---

// Crée urine et/ou selle en UNE seule transaction atomique (les deux ou aucun) : le cas « les deux »
// devient un unique appel HTTP, sans risque de succès partiel / doublon.
// `body` = { occurredAt, withUrine, withStool, consistency } ; `consistency` uniquement si withStool.
export function createDiaperChange(babyId, body) {
  return apiSend(`/babies/${babyId}/diaper-changes`, 'POST', body)
}
