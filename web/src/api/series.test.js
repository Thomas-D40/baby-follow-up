import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client')
import { apiGet } from './client'
import { getTotalsSeries } from './series'

// La granularité n'étant plus un paramètre de l'appelant (Épic 14, D14-P), `bucket=day` n'existe
// plus qu'ici. Le contrat le garde requis : sans ce test, une constante perdue ferait répondre 400
// à toutes les Tendances sans qu'aucune suite ne rougisse.
describe('getTotalsSeries — requête émise', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('émet bucket=day et les bornes sur la ressource du bébé', () => {
    apiGet.mockResolvedValue({ from: '2026-06-15', to: '2026-06-21', points: [] })

    getTotalsSeries('b1', { from: '2026-06-15', to: '2026-06-21' })

    expect(apiGet).toHaveBeenCalledTimes(1)
    const path = apiGet.mock.calls[0][0]
    expect(path.startsWith('/babies/b1/totals-series?')).toBe(true)
    const params = new URLSearchParams(path.split('?')[1])
    expect(params.get('bucket')).toBe('day')
    expect(params.get('from')).toBe('2026-06-15')
    expect(params.get('to')).toBe('2026-06-21')
  })
})
