import { apiGet, apiSend } from './client'

// --- Babies (Épic 2) ---

// Babies linked to the current parent (US2.2). Server-filtered by membership (US1.5).
export function listBabies() {
  return apiGet('/babies')
}

// Create a baby (US2.1): the creator is auto-linked server-side. Returns { id }.
export function createBaby({ firstName, birthDate, sex }) {
  return apiSend('/babies', 'POST', { firstName, birthDate, sex })
}

// Partial edit of a baby (D2-E). `patch` = { firstName?, birthDate?, sex? }.
export function updateBaby(id, patch) {
  return apiSend(`/babies/${id}`, 'PATCH', patch)
}

// Delete a baby and all its data (D2-H, cascade server-side).
export function deleteBaby(id) {
  return apiSend(`/babies/${id}`, 'DELETE')
}
