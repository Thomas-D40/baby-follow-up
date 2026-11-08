import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client')
import { apiGet, apiSend } from './client'
import {
  createBreastfeeding,
  deleteBreastfeeding,
  listBreastfeedings,
  updateBreastfeeding,
} from './breastfeedings'

// The HTTP routes are the contract with the server (Épic 18, D18-AB): a wrong path or verb answers
// 404/405 in production while every component test, which mocks this layer, stays green.
describe('clients HTTP des tétées — requêtes émises', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue({ items: [], nextCursor: null })
    apiSend.mockResolvedValue({})
  })

  it('listBreastfeedings(babyId, { limit: 1 }) → GET sur la ressource du bébé avec limit=1', () => {
    listBreastfeedings('b1', { limit: 1 })

    expect(apiGet).toHaveBeenCalledTimes(1)
    const path = apiGet.mock.calls[0][0]
    expect(path.startsWith('/babies/b1/breastfeedings?')).toBe(true)
    const params = new URLSearchParams(path.split('?')[1])
    expect(params.get('limit')).toBe('1')
    expect(params.has('before')).toBe(false)
  })

  it('listBreastfeedings transmet le curseur before', () => {
    listBreastfeedings('b1', { limit: 20, before: 'abc' })

    const params = new URLSearchParams(apiGet.mock.calls[0][0].split('?')[1])
    expect(params.get('before')).toBe('abc')
  })

  it('createBreastfeeding → POST avec occurredAt, side et durationMinutes', () => {
    createBreastfeeding('b1', { occurredAt: '2026-11-08T14:00:00.000Z', side: 'left', durationMinutes: 12 })

    expect(apiSend).toHaveBeenCalledWith(
      '/babies/b1/breastfeedings',
      'POST',
      { occurredAt: '2026-11-08T14:00:00.000Z', side: 'left', durationMinutes: 12 },
    )
  })

  it('createBreastfeeding conserve les null explicites (côté et durée non précisés)', () => {
    createBreastfeeding('b1', { occurredAt: '2026-11-08T14:00:00.000Z', side: null, durationMinutes: null })

    const body = apiSend.mock.calls[0][2]
    expect(body.side).toBeNull()
    expect(body.durationMinutes).toBeNull()
  })

  it('updateBreastfeeding → PATCH sur la tétée, patch transmis tel quel (null = effacé)', () => {
    const patch = { occurredAt: '2026-11-08T14:00:00.000Z', side: null, durationMinutes: null }

    updateBreastfeeding('b1', 'br1', patch)

    expect(apiSend).toHaveBeenCalledWith('/babies/b1/breastfeedings/br1', 'PATCH', patch)
  })

  it('deleteBreastfeeding → DELETE sur la tétée', () => {
    deleteBreastfeeding('b1', 'br1')

    expect(apiSend.mock.calls[0].slice(0, 2)).toEqual(['/babies/b1/breastfeedings/br1', 'DELETE'])
  })
})
