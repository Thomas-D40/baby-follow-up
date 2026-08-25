import { apiGet, apiSend } from './client'

// --- Temperatures (Épic 15, US15.1) ---
// Timestamped CRUD resource, same shape as urines/stools. Values travel in TENTHS of a degree
// (`temperatureCelsiusX10`), never in °C: `web/src/temperature.js` owns the conversion.

// Keyset page of a baby's temperatures. Returns { items, nextCursor }.
// `before` = opaque cursor returned by the previous page (null ⇒ first page).
export function listTemperatures(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/temperatures${qs ? `?${qs}` : ''}`)
}

// Creates a reading. `occurredAt` = ISO-8601 (normalised to UTC server-side); the value is required.
export function createTemperature(babyId, { occurredAt, temperatureCelsiusX10 }) {
  return apiSend(`/babies/${babyId}/temperatures`, 'POST', { occurredAt, temperatureCelsiusX10 })
}

// Partial edit (time and/or value). An absent field means "leave unchanged".
export function updateTemperature(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/temperatures/${id}`, 'PATCH', patch)
}

// Deletes a reading.
export function deleteTemperature(babyId, id) {
  return apiSend(`/babies/${babyId}/temperatures/${id}`, 'DELETE')
}
