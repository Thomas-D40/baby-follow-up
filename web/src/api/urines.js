import { apiGet, apiSend } from './client'

// --- Urines (Épic 13, Lots 2-3) ---

// Liste paginée keyset des urines d'un bébé (calquée sur les selles). Renvoie { items, nextCursor }.
// `before` = curseur opaque renvoyé par la page précédente (null ⇒ 1ʳᵉ page).
export function listUrines(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/urines${qs ? `?${qs}` : ''}`)
}

// Créer une urine. `occurredAt` = ISO-8601 (normalisé UTC côté serveur).
export function createUrine(babyId, { occurredAt }) {
  return apiSend(`/babies/${babyId}/urines`, 'POST', { occurredAt })
}

// Édition partielle d'une urine (correction d'heure). `patch` = { occurredAt? }.
export function updateUrine(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/urines/${id}`, 'PATCH', patch)
}

// Supprimer une urine.
export function deleteUrine(babyId, id) {
  return apiSend(`/babies/${babyId}/urines/${id}`, 'DELETE')
}
