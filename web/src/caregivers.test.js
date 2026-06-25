import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createInvitation, acceptInvitation, listCaregivers, removeCaregiver, promoteCaregiver } from './api'

// On teste que chaque client tape la bonne route/méthode (calque des tests api existants).
function mockFetch({ status = 200, json = {} } = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(json),
  })
}

describe('api/caregivers — routes & méthodes (Épic 8)', () => {
  beforeEach(() => { global.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('createInvitation → POST /api/babies/{id}/invitations', async () => {
    global.fetch = mockFetch({ status: 201, json: { token: 't', link: 'http://x/invite?token=t' } })
    const res = await createInvitation('b1')
    expect(global.fetch.mock.calls[0][0]).toBe('/api/babies/b1/invitations')
    expect(global.fetch.mock.calls[0][1].method).toBe('POST')
    expect(res.link).toBe('http://x/invite?token=t')
  })

  it('acceptInvitation → POST /api/invitations/{token}/accept (204 → null)', async () => {
    global.fetch = mockFetch({ status: 204 })
    const res = await acceptInvitation('tok-123')
    expect(global.fetch.mock.calls[0][0]).toBe('/api/invitations/tok-123/accept')
    expect(global.fetch.mock.calls[0][1].method).toBe('POST')
    expect(res).toBe(null)
  })

  it('acceptInvitation propage le status sur erreur (410/409)', async () => {
    global.fetch = mockFetch({ status: 410 })
    await expect(acceptInvitation('tok')).rejects.toMatchObject({ status: 410 })
  })

  it('listCaregivers → GET /api/babies/{id}/caregivers', async () => {
    global.fetch = mockFetch({ status: 200, json: [{ userId: 'u1', isOwner: true }] })
    const res = await listCaregivers('b1')
    expect(global.fetch.mock.calls[0][0]).toBe('/api/babies/b1/caregivers')
    expect(res[0].userId).toBe('u1')
  })

  it('removeCaregiver → DELETE /api/babies/{id}/caregivers/{userId}', async () => {
    global.fetch = mockFetch({ status: 204 })
    await removeCaregiver('b1', 'u2')
    expect(global.fetch.mock.calls[0][0]).toBe('/api/babies/b1/caregivers/u2')
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE')
  })

  it('removeCaregiver propage le 409 (dernier owner)', async () => {
    global.fetch = mockFetch({ status: 409 })
    await expect(removeCaregiver('b1', 'u2')).rejects.toMatchObject({ status: 409 })
  })

  it('promoteCaregiver → PATCH /api/babies/{id}/caregivers/{userId} { isOwner:true }', async () => {
    global.fetch = mockFetch({ status: 204 })
    await promoteCaregiver('b1', 'u2')
    expect(global.fetch.mock.calls[0][0]).toBe('/api/babies/b1/caregivers/u2')
    expect(global.fetch.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ isOwner: true })
  })
})
