import { apiGet, apiSend } from './client'

// --- Weight (Épic 12) ---
// Day-state keyed by date (D12-A′/D12-D′): one weight per (baby, day), updatable.
// `date` = YYYY-MM-DD (Europe/Paris). Writing is a "last-writer-wins" upsert (D12-C′).

// Full history: { points: [{ givenOn, weightGrams }] }, sorted given_on ASC (capped at 2000, D12-D′).
export function getWeightHistory(babyId) {
  return apiGet(`/babies/${babyId}/weights`)
}

// Upsert a day's weight (PUT → 200 last-writer-wins, D12-C′). Returns { givenOn, weightGrams }.
export function upsertWeight(babyId, date, weightGrams) {
  return apiSend(`/babies/${babyId}/weights/${encodeURIComponent(date)}`, 'PUT', { weightGrams })
}

// Deletes a day's weight (DELETE → 204 idempotent, D12-D′). No 404 to handle.
export function deleteWeight(babyId, date) {
  return apiSend(`/babies/${babyId}/weights/${encodeURIComponent(date)}`, 'DELETE')
}
