import { apiGet, apiSend } from './client'

// --- Poids (Épic 12) ---
// État-jour keyé par date (D12-A′/D12-D′) : un poids par (bébé, jour), updatable.
// `date` = YYYY-MM-DD (Europe/Paris). L'écriture est un upsert « dernier écrivain gagne » (D12-C′).

// Historique complet : { points: [{ givenOn, weightGrams }] }, trié given_on ASC (borné 2000, D12-D′).
export function getWeightHistory(babyId) {
  return apiGet(`/babies/${babyId}/weights`)
}

// Upsert du poids d'un jour (PUT → 200 dernier gagnant, D12-C′). Renvoie { givenOn, weightGrams }.
export function upsertWeight(babyId, date, weightGrams) {
  return apiSend(`/babies/${babyId}/weights/${encodeURIComponent(date)}`, 'PUT', { weightGrams })
}

// Supprime le poids d'un jour (DELETE → 204 idempotent, D12-D′). Aucun 404 à traiter.
export function deleteWeight(babyId, date) {
  return apiSend(`/babies/${babyId}/weights/${encodeURIComponent(date)}`, 'DELETE')
}
