import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDeleteDish, useDishSearch, useManageableDishes, useRenameDish } from './dishes'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  searchDishes: vi.fn(),
  listManageableDishes: vi.fn(),
  renameDish: vi.fn(),
  deleteDish: vi.fn(),
}))
import { deleteDish, listManageableDishes, renameDish, searchDishes } from '../api'

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

function setupHook(hook) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), invalidate }
}

describe('useManageableDishes — mes plats (US18.5, D18-AI)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('charge la liste et la rend dans l’ordre reçu ; isLoading vaut true tant qu’elle n’est pas arrivée', async () => {
    listManageableDishes.mockResolvedValue(ITEMS)
    const { result } = setupHook(() => useManageableDishes())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.dishes).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.dishes).toEqual(ITEMS)
    expect(listManageableDishes).toHaveBeenCalledTimes(1)
  })
})

describe('useRenameDish (US18.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renameDish.mockResolvedValue({ id: 'd1', label: 'Purée de carottes' })
  })

  it('mutateAsync({ id, label }) appelle renameDish(id, label) puis invalide la liste partagée', async () => {
    const { result, invalidate } = setupHook(() => useRenameDish())

    await act(() => result.current.mutateAsync({ id: 'd1', label: 'Purée de carottes' }))

    expect(renameDish.mock.calls[0]).toEqual(['d1', 'Purée de carottes'])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dishes'] })
  })

  it('une erreur (409) remonte à l’appelant et n’invalide rien', async () => {
    renameDish.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    const { result, invalidate } = setupHook(() => useRenameDish())

    await expect(
      act(() => result.current.mutateAsync({ id: 'd1', label: 'Compote' })),
    ).rejects.toMatchObject({ status: 409 })
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('useDeleteDish (US18.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mutateAsync(id) appelle deleteDish(id) puis invalide la liste partagée', async () => {
    deleteDish.mockResolvedValue(null)
    const { result, invalidate } = setupHook(() => useDeleteDish())

    await act(() => result.current.mutateAsync('d1'))

    expect(deleteDish.mock.calls[0]).toEqual(['d1'])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dishes'] })
  })

  it('un 404 est un succès idempotent : résout et invalide (précédent D7-C)', async () => {
    deleteDish.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    const { result, invalidate } = setupHook(() => useDeleteDish())

    await act(() => result.current.mutateAsync('gone'))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dishes'] })
  })

  it('un 500 remonte comme une erreur, sans invalidation', async () => {
    deleteDish.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result, invalidate } = setupHook(() => useDeleteDish())

    await expect(act(() => result.current.mutateAsync('d1'))).rejects.toMatchObject({ status: 500 })
    expect(invalidate).not.toHaveBeenCalled()
  })
})
