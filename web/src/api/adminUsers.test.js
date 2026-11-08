import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listAccounts } from './adminUsers'

// The HTTP routes are the contract with the server: a wrong path or verb answers 404/405 in
// production while every component test, which mocks this layer, stays green.
function mockFetch({ status = 200, json = {} } = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(json),
  })
}

describe('api/adminUsers — routes & méthodes (Épic 20)', () => {
  beforeEach(() => { global.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('listAccounts → GET /api/admin/users', async () => {
    global.fetch = mockFetch({ status: 200, json: [{ id: 'u1', email: 'lisa@exemple.fr' }] })

    const res = await listAccounts()

    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/users')
    expect(global.fetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(res[0].id).toBe('u1')
  })

  it('listAccounts propage le status sur erreur (403)', async () => {
    global.fetch = mockFetch({ status: 403 })

    await expect(listAccounts()).rejects.toMatchObject({ status: 403 })
  })
})
