import { apiSend } from './client'

// --- Solid meals (Épic 18, US18.3) ---
// No `list`: the meals are read through the recap (GET /events), nothing else lists them.

// `occurredAt` = ISO-8601; `portion` ('tasted' | 'half' | 'all') may be null. `addToDishes` asks the
// server to add the dish to the shared list in the same transaction (creation only, US18.4).
export function createSolidMeal(babyId, { occurredAt, dish, portion, addToDishes }) {
  return apiSend(`/babies/${babyId}/solid-meals`, 'POST', { occurredAt, dish, portion, addToDishes })
}

// Edit: the server CLEARS `portion` when null (D18-AC), so `patch` carries every field.
export function updateSolidMeal(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/solid-meals/${id}`, 'PATCH', patch)
}

export function deleteSolidMeal(babyId, id) {
  return apiSend(`/babies/${babyId}/solid-meals/${id}`, 'DELETE')
}
