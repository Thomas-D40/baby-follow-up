import { apiSend } from './client'

// --- Biberons (Épic 3) ---

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
