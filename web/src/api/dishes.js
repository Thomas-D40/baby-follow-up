import { apiGet, apiSend } from './client'

// --- Shared dish list (Épic 18, US18.4-US18.5) ---
// Not scoped to a baby: the list is shared by every user.

// Substring search, insensitive to case and accents (done by the server). Returns
// { items: [{ id, label }], exactMatch }: `exactMatch` says whether the text designates a shared
// dish even when it is not among the capped items.
export function searchDishes(q) {
  return apiGet(`/dishes?q=${encodeURIComponent(q)}`)
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
