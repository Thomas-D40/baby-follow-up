import { apiGet, apiSend } from './client'

// --- Selles (Épic 5) ---

// Liste paginée keyset des selles d'un bébé (D3-J / D5-I). Renvoie { items, nextCursor }.
// `before` = curseur opaque renvoyé par la page précédente (null ⇒ 1ʳᵉ page).
export function listStools(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/stools${qs ? `?${qs}` : ''}`)
}

// Créer une selle (US5.1). `occurredAt` = ISO-8601 (normalisé UTC côté serveur), `consistency` optionnelle.
export function createStool(babyId, { occurredAt, consistency }) {
  return apiSend(`/babies/${babyId}/stools`, 'POST', { occurredAt, consistency })
}

// Édition partielle d'une selle (D5-B). `patch` = { occurredAt?, consistency? }.
// Exposé pour l'Épic 7 — non câblé en UI v1 (D5-J).
export function updateStool(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/stools/${id}`, 'PATCH', patch)
}

// Supprimer une selle (D5-B).
export function deleteStool(babyId, id) {
  return apiSend(`/babies/${babyId}/stools/${id}`, 'DELETE')
}
