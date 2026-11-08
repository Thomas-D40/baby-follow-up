import { apiGet, apiSend } from './client'

// --- Partage & co-parents (Épic 8) ---

// Invite a relative by email to CE baby (owner-only). body = { email, firstName }.
// → 201 { token, link, inviteeEmail, expiresAt, mailSent }. 404 if not linked, 403 if linked non-owner,
// 409 if the recipient is already in the circle, 400 on an invalid body.
export function createInvitation(babyId, body) {
  return apiSend(`/babies/${babyId}/invitations`, 'POST', body)
}

// Accept an invitation (public route, the service decides who may). Links the recipient as non-owner.
// The body is always { password } (null when the recipient already has an activated account).
// → 204. 410 dead link; 400 missing/short password (pending account) or password sent to an activated one;
// 401 activated account without session; 403 another session; 409 already a member (token not consumed).
export function acceptInvitation(token, password = null) {
  return apiSend(`/invitations/${token}/accept`, 'POST', { password })
}

// Public pre-flight of an invitation → 200 { needsPassword, inviteeEmail, inviterFirstName,
// babyFirstName, expiresAt }. 410 when the link is dead.
export function previewInvitation(token) {
  return apiGet(`/invitations/${token}`)
}

// Pending invitations of CE baby (owner-only) → [{ token, inviteeEmail, inviteeFirstName, expiresAt }].
export function listPendingInvitations(babyId) {
  return apiGet(`/babies/${babyId}/invitations`)
}

// Revoke a pending invitation (owner-only) → 204. 404 if it is not pending any more (accepted, revoked, expired).
export function revokeInvitation(babyId, token) {
  return apiSend(`/babies/${babyId}/invitations/${token}`, 'DELETE')
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
