import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAccount, listAccounts } from './adminUsers'

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

describe('api/adminUsers — création de compte (Épic 20, US20.2)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('createAccount → POST /api/admin/users avec { email, firstName }', async () => {
    global.fetch = mockFetch({ status: 201, json: { userId: 'u9', activationLink: 'http://x', mailSent: true } })

    const res = await createAccount({ email: 'lisa@exemple.fr', firstName: 'Lisa' })

    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/users')
    expect(global.fetch.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ email: 'lisa@exemple.fr', firstName: 'Lisa' })
    expect(res.mailSent).toBe(true)
  })

  it('createAccount propage le status sur erreur (409)', async () => {
    global.fetch = mockFetch({ status: 409 })

    await expect(createAccount({ email: 'lisa@exemple.fr', firstName: 'Lisa' })).rejects.toMatchObject({ status: 409 })
  })
})
