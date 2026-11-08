import { apiGet, apiSend } from './client'

// --- Medications (Épic 19, US19.1) ---
// Timestamped CRUD resource: a free-text `medicationName` and an optional free-text `dosage`.

// Keyset page of a baby's medication intakes. Returns { items, nextCursor }.
// `before` = opaque cursor returned by the previous page (null ⇒ first page).
export function listMedications(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/medications${qs ? `?${qs}` : ''}`)
}

// Creates an intake. `occurredAt` = ISO-8601; `dosage` null means none.
export function createMedication(babyId, { occurredAt, medicationName, dosage }) {
  return apiSend(`/babies/${babyId}/medications`, 'POST', { occurredAt, medicationName, dosage })
}

// Edit: a null `dosage` CLEARS it, a null `occurredAt` / `medicationName` leaves it unchanged.
export function updateMedication(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/medications/${id}`, 'PATCH', patch)
}

// Deletes an intake.
export function deleteMedication(babyId, id) {
  return apiSend(`/babies/${babyId}/medications/${id}`, 'DELETE')
}
