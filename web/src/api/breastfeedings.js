import { apiGet, apiSend } from './client'

// --- Breastfeedings (Épic 18, US18.2) ---

// Keyset page of a baby's breastfeedings, most recent start first. Returns { items, nextCursor }.
// `before` = opaque cursor returned by the previous page (null => first page).
export function listBreastfeedings(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/breastfeedings${qs ? `?${qs}` : ''}`)
}

// `occurredAt` = ISO-8601 start of the feed; `side` ('left' | 'right') and `durationMinutes` may be null.
export function createBreastfeeding(babyId, { occurredAt, side, durationMinutes }) {
  return apiSend(`/babies/${babyId}/breastfeedings`, 'POST', { occurredAt, side, durationMinutes })
}

// Edit: the server CLEARS `side` and `durationMinutes` when null (D18-AC), so `patch` carries every field.
export function updateBreastfeeding(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/breastfeedings/${id}`, 'PATCH', patch)
}

export function deleteBreastfeeding(babyId, id) {
  return apiSend(`/babies/${babyId}/breastfeedings/${id}`, 'DELETE')
}
