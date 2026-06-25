import { apiGet, apiSend } from './client'

// --- Partage & co-parents (Épic 8) ---

// Émettre un lien d'invitation pour CE bébé (owner-only, D8-B/J).
// → 201 { token, link, expiresAt }. 404 si non lié (anti-énumération), 403 si lié non-owner.
export function createInvitation(babyId) {
  return apiSend(`/babies/${babyId}/invitations`, 'POST')
}

// Accepter une invitation (authentifié, D8-D). Lie l'utilisateur courant en non-owner (D8-F).
// → 204. 410 token invalide/expiré/déjà utilisé ; 409 déjà membre (auto-invitation, token non consommé).
export function acceptInvitation(token) {
  return apiSend(`/invitations/${token}/accept`, 'POST')
}

// Lister le cercle de CE bébé (caregiver lié, D8-N) → [{ userId, firstName, email, isOwner }].
export function listCaregivers(babyId) {
  return apiGet(`/babies/${babyId}/caregivers`)
}

// Délier un caregiver (owner-only, D8-L) → 204. 409 si dernier owner (D8-M).
export function removeCaregiver(babyId, userId) {
  return apiSend(`/babies/${babyId}/caregivers/${userId}`, 'DELETE')
}

// Promouvoir un caregiver non-owner en owner (owner-only, D8-I). Promotion uniquement (isOwner:true).
export function promoteCaregiver(babyId, userId) {
  return apiSend(`/babies/${babyId}/caregivers/${userId}`, 'PATCH', { isOwner: true })
}
