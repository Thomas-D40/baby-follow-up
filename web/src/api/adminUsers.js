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
