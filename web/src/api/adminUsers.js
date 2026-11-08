import { apiGet } from './client'

// --- Account management for the administrator (Épic 20) ---

// All accounts, newest first → [{ id, email, firstName, role: 'admin'|'parent', status: 'active'|'pending', createdAt }].
// 403 for a parent, 401 without session.
export function listAccounts() {
  return apiGet('/admin/users')
}
