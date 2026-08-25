import { apiSend } from './client'

// --- Medical care act (Épic 15, US15.2, D15-M) ---
// Composite transactional endpoint: eye and/or nose created in ONE request (both or neither),
// 201 → { eye, nose } (a null side means "not asked for"), empty act → 400.
// ⛔ The front NEVER emits two POSTs for one gesture: two requests would mean two buttons to
// disable and two error states, and a partially failed pair would reopen the duplicate hole.
export function createMedicalCareAct(babyId, { occurredAt, withEye, withNose }) {
  return apiSend(`/babies/${babyId}/medical-care-acts`, 'POST', { occurredAt, withEye, withNose })
}
