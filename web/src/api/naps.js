import { BASE, apiGet, apiSend } from './client'

// --- Siestes (Épic 4) ---

// API use-case (sieste courante, sans id, D4-B). Le serveur défaut start_at/end_at = now si absent.
// Un 409 (« déjà / aucune en cours ») est attendu et affiché en info neutre côté UI (D4-K).
export function startNap(babyId, { startAt } = {}) {
  return apiSend(`/babies/${babyId}/naps/start`, 'POST', { startAt: startAt ?? null })
}
export function endNap(babyId, { endAt } = {}) {
  return apiSend(`/babies/${babyId}/naps/end`, 'POST', { endAt: endAt ?? null })
}
// Annule une fin erronée : rouvre la dernière sieste (D4-E). Sans corps.
export function reopenNap(babyId) {
  return apiSend(`/babies/${babyId}/naps/reopen`, 'POST')
}

// État courant (D4-L) : la sieste ouverte (200) ou null (204) — pilote le bouton contextuel.
export async function getCurrentNap(babyId) {
  const res = await fetch(`${BASE}/babies/${babyId}/naps/current`, { credentials: 'include' })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`GET naps/current -> ${res.status}`)
  return res.json()
}

// Liste paginée keyset des siestes (D3-J / D4-L). Renvoie { items, nextCursor }.
export function listNaps(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/naps${qs ? `?${qs}` : ''}`)
}

// API REST (donnée brute par id, D4-F) : correction de valeurs (`patch` = { startAt?, endAt? }).
export function updateNap(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/naps/${id}`, 'PATCH', patch)
}
export function deleteNap(babyId, id) {
  return apiSend(`/babies/${babyId}/naps/${id}`, 'DELETE')
}
