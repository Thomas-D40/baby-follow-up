import { apiGet, apiSend } from './client'

// --- Medical cares (Épic 15, US15.2) ---
// ONE resource with a closed `careType` ∈ `eye | nose` — the calendar splits it into two
// presentation types (`eye_care` / `nose_care`, K1), but the API keys everything on `careType`.
// Creation of an act (eye and/or nose in one gesture) goes through `medicalCareActs.js`; this
// module is the per-resource CRUD, used for listing, correcting and deleting a single care.

// Keyset page of a baby's cares, ALL types mixed. Returns { items, nextCursor }.
export function listMedicalCares(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/medical-cares${qs ? `?${qs}` : ''}`)
}

// Creates a single care. `careType` = 'eye' | 'nose' (resource vocabulary, never 'eye_care').
export function createMedicalCare(babyId, { occurredAt, careType }) {
  return apiSend(`/babies/${babyId}/medical-cares`, 'POST', { occurredAt, careType })
}

// Partial edit (time and/or type). An absent field means "leave unchanged".
export function updateMedicalCare(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/medical-cares/${id}`, 'PATCH', patch)
}

// Deletes a single care — the same client for both presentation types (K1).
export function deleteMedicalCare(babyId, id) {
  return apiSend(`/babies/${babyId}/medical-cares/${id}`, 'DELETE')
}
