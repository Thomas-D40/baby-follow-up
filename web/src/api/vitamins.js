import { apiGet, apiSend } from './client'

// --- Vitamines (Épic 9) ---
// État-jour idempotent (D9-A) : la case cochée = une ligne présente pour (bébé, type, jour).
// `date` = YYYY-MM-DD (Europe/Paris) ; absent ⇒ aujourd'hui (Paris) côté serveur (D9-E).

const qs = (date) => (date ? `?date=${encodeURIComponent(date)}` : '')

// État des vitamines d'un jour : { date, items: [{ vitaminType, given, authorId }] } (matrice d/k, D9-B).
export function getVitamins(babyId, date) {
  return apiGet(`/babies/${babyId}/vitamins${qs(date)}`)
}

// Coche une vitamine (POST → 200 idempotent, D9-B). Corps vide : type + date sont dans l'URL.
export function setVitamin(babyId, type, date) {
  return apiSend(`/babies/${babyId}/vitamins/${type}${qs(date)}`, 'POST')
}

// Décoche une vitamine (DELETE → 204 systématique, D9-B). Aucun 404 à traiter.
export function unsetVitamin(babyId, type, date) {
  return apiSend(`/babies/${babyId}/vitamins/${type}${qs(date)}`, 'DELETE')
}
