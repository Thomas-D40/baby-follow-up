import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createAccount, deleteAccount, getAccountDeletionImpact, listAccounts, resendActivationLink,
} from './adminUsers'

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

describe('api/adminUsers — renvoi du lien d’activation (Épic 20, US20.3)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('resendActivationLink → POST /api/admin/users/{id}/activation-link, sans corps', async () => {
    global.fetch = mockFetch({ status: 200, json: { userId: 'u1', activationLink: 'http://x', mailSent: false } })

    const res = await resendActivationLink('u1')

    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/users/u1/activation-link')
    expect(global.fetch.mock.calls[0][1].method).toBe('POST')
    expect(global.fetch.mock.calls[0][1].body).toBeUndefined()
    expect(res.mailSent).toBe(false)
  })

  it('resendActivationLink propage le status sur erreur (409)', async () => {
    global.fetch = mockFetch({ status: 409 })

    await expect(resendActivationLink('u1')).rejects.toMatchObject({ status: 409 })
  })
})

describe('api/adminUsers — aperçu de l’impact d’une suppression (Épic 24, US24.1)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('getAccountDeletionImpact → GET /api/admin/users/{id}/deletion-impact', async () => {
    const impact = {
      userId: 'u2', status: 'active', deletedBabyCount: 1, sharedBabyCount: 2, blockingBabyCount: 0, impactToken: 't1',
    }
    global.fetch = mockFetch({ status: 200, json: impact })

    const res = await getAccountDeletionImpact('u2')

    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/users/u2/deletion-impact')
    expect(global.fetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET')
    expect(res).toEqual(impact)
  })

  it.each([404, 409])('getAccountDeletionImpact propage le status sur erreur (%i)', async (status) => {
    global.fetch = mockFetch({ status })

    await expect(getAccountDeletionImpact('u2')).rejects.toMatchObject({ status })
  })
})

describe('api/adminUsers — suppression d’un compte (Épic 24, US24.1 et US24.2)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('deleteAccount → DELETE /api/admin/users/{id}?impactToken=…, sans corps ni pendingOnly', async () => {
    global.fetch = mockFetch({ status: 204 })

    await deleteAccount('u2', { impactToken: 'abc123', isPendingOnly: false })

    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/users/u2?impactToken=abc123')
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE')
    expect(global.fetch.mock.calls[0][1].body).toBeUndefined()
  })

  it('le jeton est encodé dans l’URL', async () => {
    global.fetch = mockFetch({ status: 204 })

    await deleteAccount('u2', { impactToken: 'a b', isPendingOnly: false })

    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/users/u2?impactToken=a%20b')
  })

  it('isPendingOnly vrai → pendingOnly=true est ajouté', async () => {
    global.fetch = mockFetch({ status: 204 })

    await deleteAccount('u3', { impactToken: 'abc123', isPendingOnly: true })

    expect(global.fetch.mock.calls[0][0]).toBe('/api/admin/users/u3?impactToken=abc123&pendingOnly=true')
  })

  it('isPendingOnly absent → pas de pendingOnly', async () => {
    global.fetch = mockFetch({ status: 204 })

    await deleteAccount('u2', { impactToken: 'abc123' })

    expect(global.fetch.mock.calls[0][0]).not.toContain('pendingOnly')
  })

  it('204 → résout null', async () => {
    global.fetch = mockFetch({ status: 204 })

    await expect(deleteAccount('u2', { impactToken: 'abc123', isPendingOnly: false })).resolves.toBeNull()
  })

  it.each([404, 409, 500])('deleteAccount rejette avec le status sur erreur (%i)', async (status) => {
    global.fetch = mockFetch({ status })

    await expect(deleteAccount('u2', { impactToken: 'abc123', isPendingOnly: false })).rejects.toMatchObject({ status })
  })
})
