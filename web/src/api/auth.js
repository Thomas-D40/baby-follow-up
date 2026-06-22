import { BASE, apiSend } from './client'

// --- Auth (US1.3) ---

// Login goes through Quarkus' native form-auth mechanism (D-A): form-encoded POST to /api/login.
// The server sets the session cookie; we receive no token.
export async function login(email, password) {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  })
  if (!res.ok) {
    throw new Error('Identifiants invalides')
  }
}

export async function logout() {
  await fetch(`${BASE}/logout`, { method: 'POST', credentials: 'include' })
}

// Returns the current user (200) or null if not authenticated (401).
export async function fetchMe() {
  const res = await fetch(`${BASE}/me`, { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`GET /me -> ${res.status}`)
  return res.json()
}

// Password definition via single-use link (US1.2).
export async function activate(token, password) {
  return apiSend('/activation', 'POST', { token, password })
}
