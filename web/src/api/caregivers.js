import { apiGet, apiSend } from './client'

// --- Partage & co-parents (Épic 8) ---

// Invite a relative by email to CE baby (owner-only). body = { email, firstName }.
// → 201 { token, link, inviteeEmail, expiresAt, mailSent }. 404 if not linked, 403 if linked non-owner,
// 409 if the recipient is already in the circle, 400 on an invalid body.
export function createInvitation(babyId, body) {
  return apiSend(`/babies/${babyId}/invitations`, 'POST', body)
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
