import { apiGet, apiSend } from './client'

// --- Biberons (Épic 3) ---

// Liste paginée keyset des biberons d'un bébé (D3-J). Renvoie { items, nextCursor }.
// `before` = curseur opaque renvoyé par la page précédente (null ⇒ 1ʳᵉ page).
export function listBottleFeedings(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/bottle-feedings${qs ? `?${qs}` : ''}`)
}

// Créer un biberon (US3.1). `occurredAt` = ISO-8601 (normalisé UTC côté serveur). Renvoie l'événement.
export function createBottleFeeding(babyId, { occurredAt, quantityMl, milkType }) {
  return apiSend(`/babies/${babyId}/bottle-feedings`, 'POST', { occurredAt, quantityMl, milkType })
}

// Édition partielle d'un biberon (D3-B). `patch` = { occurredAt?, quantityMl?, milkType? }.
export function updateBottleFeeding(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/bottle-feedings/${id}`, 'PATCH', patch)
}

// Supprimer un biberon (D3-B).
export function deleteBottleFeeding(babyId, id) {
  return apiSend(`/babies/${babyId}/bottle-feedings/${id}`, 'DELETE')
}
