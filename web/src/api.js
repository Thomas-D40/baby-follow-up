// Minimal API client. `credentials: 'include'` → the httpOnly auth cookie is sent automatically;
// the front never accesses the token (see Conception D11).
const BASE = '/api'

export async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json()
}

export async function apiSend(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

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

// --- Biberons (Épic 3) ---

// Liste paginée keyset des biberons d'un bébé (D3-J). Renvoie { items, nextCursor }.
// `before` = curseur opaque renvoyé par la page précédente (null ⇒ 1ʳᵉ page).
export function listBottleFeedings(babyId, { limit, before } = {}) {
  const params = new URLSearchParams()
  if (limit != null) params.set('limit', String(limit))
  if (before) params.set('before', before)
  const qs = params.toString()
  return apiGet(`/babies/${babyId}/bottle-feedings${qs ? `?${qs}` : ''}`)
}

// Créer un biberon (US3.1). `occurredAt` = ISO-8601 (normalisé UTC côté serveur). Renvoie l'événement.
export function createBottleFeeding(babyId, { occurredAt, quantityMl, milkType }) {
  return apiSend(`/babies/${babyId}/bottle-feedings`, 'POST', { occurredAt, quantityMl, milkType })
}

// Édition partielle d'un biberon (D3-B). `patch` = { occurredAt?, quantityMl?, milkType? }.
export function updateBottleFeeding(babyId, id, patch) {
  return apiSend(`/babies/${babyId}/bottle-feedings/${id}`, 'PATCH', patch)
}

// Supprimer un biberon (D3-B).
export function deleteBottleFeeding(babyId, id) {
  return apiSend(`/babies/${babyId}/bottle-feedings/${id}`, 'DELETE')
}
