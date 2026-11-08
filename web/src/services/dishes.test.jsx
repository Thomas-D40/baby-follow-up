import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDishSearch } from './dishes'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  searchDishes: vi.fn(),
  listManageableDishes: vi.fn(),
  renameDish: vi.fn(),
  deleteDish: vi.fn(),
}))
import { searchDishes } from '../api'

function setup(initialText) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return renderHook(({ text }) => useDishSearch(text), { wrapper, initialProps: { text: initialText } })
}

const ITEMS = [{ id: 'd1', label: 'Carottes râpées' }, { id: 'd2', label: 'Purée de carottes' }]

describe('useDishSearch — rien de tapé (US18.4, D18-U)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchDishes.mockResolvedValue({ items: ITEMS, exactMatch: false })
  })

  it.each(['', '  '])('texte « %s » : aucune requête, aucune proposition, pas de case', async (text) => {
    const { result } = setup(text)

    // Give a stray request every chance to fire before asserting its absence.
    await new Promise((r) => setTimeout(r, 20))

    expect(searchDishes).not.toHaveBeenCalled()
    expect(result.current).toEqual({ suggestions: [], canAddToDishes: false })
  })
})

describe('useDishSearch — retrouver en tapant (US18.4, D18-U/D18-AG)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchDishes.mockResolvedValue({ items: ITEMS, exactMatch: false })
  })

  it('appelle searchDishes avec le texte rogné et renvoie les résultats dans l’ordre reçu', async () => {
    const { result } = setup(' car ')

    await waitFor(() => expect(result.current.suggestions).toEqual(ITEMS))
    expect(searchDishes).toHaveBeenCalledTimes(1)
    expect(searchDishes.mock.calls[0][0]).toBe('car')
  })

  it('exactMatch faux et réponse arrivée → la case peut être proposée', async () => {
    const { result } = setup('Gratin')

    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))
  })

  it('exactMatch vrai → pas de case', async () => {
    searchDishes.mockResolvedValue({ items: ITEMS, exactMatch: true })
    const { result } = setup('Purée de carottes')

    await waitFor(() => expect(result.current.suggestions).toEqual(ITEMS))
    expect(result.current.canAddToDishes).toBe(false)
  })

  it('requête pendante → pas de case (jamais proposée avant la réponse)', async () => {
    searchDishes.mockReturnValue(new Promise(() => {}))
    const { result } = setup('Gratin')

    await waitFor(() => expect(searchDishes).toHaveBeenCalledTimes(1))
    expect(result.current.canAddToDishes).toBe(false)
    expect(result.current.suggestions).toEqual([])
  })

  it('Purée et Compote ne proposent jamais la case, même si le serveur répond exactMatch faux', async () => {
    const { result, rerender } = setup('Purée')

    await waitFor(() => expect(searchDishes).toHaveBeenCalled())
    await waitFor(() => expect(result.current.suggestions).toEqual(ITEMS))
    expect(result.current.canAddToDishes).toBe(false)

    rerender({ text: '  COMPOTE ' })
    await waitFor(() => expect(searchDishes).toHaveBeenCalledTimes(2))
    expect(result.current.canAddToDishes).toBe(false)
  })

  it('en changeant le texte, les propositions précédentes restent affichées mais la case disparaît jusqu’à la réponse', async () => {
    const { result, rerender } = setup('car')
    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))
    expect(result.current.suggestions).toEqual(ITEMS)

    let resolveNext
    searchDishes.mockReturnValue(new Promise((r) => { resolveNext = r }))
    rerender({ text: 'carr' })

    // The previous page of results is kept while the new search is in flight (no flicker)…
    await waitFor(() => expect(searchDishes).toHaveBeenCalledTimes(2))
    expect(result.current.suggestions).toEqual(ITEMS)
    // …but the box must not be offered on the strength of the PREVIOUS text's answer.
    expect(result.current.canAddToDishes).toBe(false)

    resolveNext({ items: [], exactMatch: false })
    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))
    expect(result.current.suggestions).toEqual([])
  })

  it('une saisie qui ne diffère que par casse, accents ou espaces réutilise la requête (même clé)', async () => {
    const { result, rerender } = setup('purée de  carottes')
    await waitFor(() => expect(result.current.suggestions).toEqual(ITEMS))

    rerender({ text: 'PUREE DE CAROTTES' })
    await waitFor(() => expect(result.current.suggestions).toEqual(ITEMS))

    expect(searchDishes).toHaveBeenCalledTimes(1)
  })
})
