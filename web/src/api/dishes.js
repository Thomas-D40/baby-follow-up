import { apiGet, apiSend } from './client'

// --- Dishes (Épic 18, US18.4-US18.5; Épic 23) ---
// The shared list is not scoped to a baby (every user sees it); the suggestions are, because they
// also come from the meals of the baby.

// Suggestions for a baby: its recent dishes, then the shared ones containing the text (case and
// accents ignored, done by the server). An empty text gives the recent dishes only. Returns
// { labels, exactMatch }: `exactMatch` says whether the text designates a shared dish, whatever the
// history holds.
export function getDishSuggestions(babyId, q) {
  return apiGet(`/babies/${babyId}/solid-meals/dish-suggestions?q=${encodeURIComponent(q)}`)
}

// Dishes the current user may manage: their own, or all of them for the admin (the server decides).
export function listManageableDishes() {
  return apiGet('/dishes/manageable')
}

// Rename a dish. The server answers 409 when the new label already exists.
export function renameDish(id, label) {
  return apiSend(`/dishes/${id}`, 'PATCH', { label })
}

export function deleteDish(id) {
  return apiSend(`/dishes/${id}`, 'DELETE')
}
