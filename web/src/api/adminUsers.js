import { apiGet, apiSend } from './client'

// --- Account management for the administrator (Épic 20) ---

// All accounts, newest first → [{ id, email, firstName, role: 'admin'|'parent', status: 'active'|'pending', createdAt }].
// 403 for a parent, 401 without session.
export function listAccounts() {
  return apiGet('/admin/users')
}

// Create a parent account and mail it its activation link.
// → 201 { userId, activationLink, mailSent }. 409 email already used, 400 invalid body.
export function createAccount({ email, firstName }) {
  return apiSend('/admin/users', 'POST', { email, firstName })
}

// Issue a new activation link for a pending account and mail it (no body).
// → 200 { userId, activationLink, mailSent }. 404 unknown account, 409 account already activated.
export function resendActivationLink(userId) {
  return apiSend(`/admin/users/${userId}/activation-link`, 'POST')
}
