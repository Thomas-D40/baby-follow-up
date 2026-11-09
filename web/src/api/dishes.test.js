import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client')
import { apiGet, apiSend } from './client'
import { deleteDish, getDishSuggestions, listManageableDishes, renameDish } from './dishes'

// The suggestions are a sub-resource of the baby's solid meals (Épic 23, D23-M): the typed text travels
// as a query parameter that must survive accents, spaces and reserved characters, and is always sent,
// even empty (empty = the baby's recent dishes).
describe('getDishSuggestions — requête émise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue({ labels: [], exactMatch: false })
  })

  it('GET /babies/<id>/solid-meals/dish-suggestions?q=<texte>', () => {
    getDishSuggestions('b1', 'car')

    expect(apiGet).toHaveBeenCalledTimes(1)
    const path = apiGet.mock.calls[0][0]
    expect(path).toBe('/babies/b1/solid-meals/dish-suggestions?q=car')
  })

  it('texte vide → le paramètre q est tout de même envoyé, vide', () => {
    getDishSuggestions('b1', '')

    expect(apiGet.mock.calls[0][0]).toBe('/babies/b1/solid-meals/dish-suggestions?q=')
  })

  it('encode le texte : accents, espaces et caractères réservés arrivent intacts', () => {
    getDishSuggestions('b1', 'purée & crème = 100% #1?')

    const path = apiGet.mock.calls[0][0]
    expect(path.split('?')).toHaveLength(2)
    expect(new URLSearchParams(path.split('?')[1]).get('q')).toBe('purée & crème = 100% #1?')
  })

  it('renvoie la réponse du serveur telle quelle ({ labels, exactMatch })', async () => {
    apiGet.mockResolvedValue({ labels: ['Purée de carottes'], exactMatch: true })

    await expect(getDishSuggestions('b1', 'purée')).resolves.toEqual({
      labels: ['Purée de carottes'],
      exactMatch: true,
    })
  })
})

describe('gestion des plats — requêtes émises (US18.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue([])
    apiSend.mockResolvedValue({})
  })

  it('listManageableDishes → GET /dishes/manageable', () => {
    listManageableDishes()

    expect(apiGet).toHaveBeenCalledWith('/dishes/manageable')
  })

  it('renameDish(id, label) → PATCH /dishes/<id> avec { label }', () => {
    renameDish('d1', 'Purée de carottes')

    expect(apiSend).toHaveBeenCalledWith('/dishes/d1', 'PATCH', { label: 'Purée de carottes' })
  })

  it('deleteDish(id) → DELETE /dishes/<id>', () => {
    deleteDish('d1')

    expect(apiSend.mock.calls[0].slice(0, 2)).toEqual(['/dishes/d1', 'DELETE'])
  })
})
