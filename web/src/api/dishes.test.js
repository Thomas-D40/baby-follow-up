import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client')
import { apiGet, apiSend } from './client'
import { deleteDish, listManageableDishes, renameDish, searchDishes } from './dishes'

// Dishes are the first resource NOT scoped to a baby (Épic 18, D18-R): the route is /dishes, and the
// typed text travels as a query parameter that must survive accents, spaces and reserved characters.
describe('searchDishes — requête émise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue({ items: [], exactMatch: false })
  })

  it('GET /dishes?q=<texte>, hors de toute ressource bébé', () => {
    searchDishes('car')

    expect(apiGet).toHaveBeenCalledTimes(1)
    const path = apiGet.mock.calls[0][0]
    expect(path.startsWith('/dishes?')).toBe(true)
    expect(new URLSearchParams(path.split('?')[1]).get('q')).toBe('car')
  })

  it('encode le texte : accents, espaces et caractères réservés arrivent intacts', () => {
    searchDishes('purée & crème = 100% #1?')

    const path = apiGet.mock.calls[0][0]
    expect(path.split('?')).toHaveLength(2)
    expect(new URLSearchParams(path.split('?')[1]).get('q')).toBe('purée & crème = 100% #1?')
  })

  it('renvoie la réponse du serveur telle quelle ({ items, exactMatch })', async () => {
    apiGet.mockResolvedValue({ items: [{ id: 'd1', label: 'Purée de carottes' }], exactMatch: true })

    await expect(searchDishes('purée')).resolves.toEqual({
      items: [{ id: 'd1', label: 'Purée de carottes' }],
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
