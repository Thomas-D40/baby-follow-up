import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client')
import { apiSend } from './client'
import { createSolidMeal, deleteSolidMeal, updateSolidMeal } from './solidMeals'

// The HTTP routes are the contract with the server (Épic 18, D18-AB): a wrong path or verb answers
// 404/405 in production while every component test, which mocks this layer, stays green.
describe('clients HTTP des repas — requêtes émises', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiSend.mockResolvedValue({})
  })

  it('createSolidMeal → POST avec occurredAt, dish, portion et addToDishes', () => {
    createSolidMeal('b1', { occurredAt: '2026-11-08T12:00:00.000Z', dish: 'Purée', portion: 'half', addToDishes: true })

    expect(apiSend).toHaveBeenCalledWith(
      '/babies/b1/solid-meals',
      'POST',
      { occurredAt: '2026-11-08T12:00:00.000Z', dish: 'Purée', portion: 'half', addToDishes: true },
    )
  })

  it('updateSolidMeal → PATCH sur le repas, patch transmis tel quel (portion null = effacée)', () => {
    const patch = { occurredAt: '2026-11-08T12:00:00.000Z', dish: 'Compote', portion: null }

    updateSolidMeal('b1', 'sm1', patch)

    expect(apiSend).toHaveBeenCalledWith('/babies/b1/solid-meals/sm1', 'PATCH', patch)
  })

  it('deleteSolidMeal → DELETE sur le repas', () => {
    deleteSolidMeal('b1', 'sm1')

    expect(apiSend.mock.calls[0].slice(0, 2)).toEqual(['/babies/b1/solid-meals/sm1', 'DELETE'])
  })
})
