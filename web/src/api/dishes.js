import { apiGet } from './client'

// --- Shared dish list (Épic 18, US18.4) ---
// Not scoped to a baby: the list is shared by every user.

// Substring search, insensitive to case and accents (done by the server). Returns
// { items: [{ id, label }], exactMatch }: `exactMatch` says whether the text designates a dish
// (shared or fixed) even when it is not among the capped items.
export function searchDishes(q) {
  return apiGet(`/dishes?q=${encodeURIComponent(q)}`)
}
