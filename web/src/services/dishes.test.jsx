import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDeleteDish, useDishSuggestions, useManageableDishes, useRenameDish } from './dishes'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  getDishSuggestions: vi.fn(),
  listManageableDishes: vi.fn(),
  renameDish: vi.fn(),
  deleteDish: vi.fn(),
}))
import { deleteDish, getDishSuggestions, listManageableDishes, renameDish } from '../api'

function setup(initial) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return renderHook(
    ({ babyId, typed, dish }) => useDishSuggestions(babyId, typed, dish),
    { wrapper, initialProps: { babyId: 'b1', ...initial } },
  )
}

const LABELS = ['Carottes râpées', 'Purée de carottes']
const ITEMS = [{ id: 'd1', label: 'Carottes râpées' }, { id: 'd2', label: 'Purée de carottes' }]

// The second argument of the call is the text sent to the server.
function callsFor(text) {
  return getDishSuggestions.mock.calls.filter((call) => call[1] === text)
}

describe('useDishSuggestions — rien de tapé (US23.2, D23-G)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDishSuggestions.mockResolvedValue({ labels: LABELS, exactMatch: false })
  })

  it.each(['', '  '])('texte « %s » : une requête (les récents), pas de case', async (text) => {
    const { result } = setup({ typed: text, dish: text })

    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))
    // Give a stray second request every chance to fire before asserting its absence.
    await new Promise((r) => setTimeout(r, 20))

    expect(getDishSuggestions).toHaveBeenCalledTimes(1)
    expect(getDishSuggestions.mock.calls[0]).toEqual(['b1', ''])
    expect(result.current.canAddToDishes).toBe(false)
  })
})

describe('useDishSuggestions — retrouver en tapant (US23.1, D23-N, D18-AG)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDishSuggestions.mockResolvedValue({ labels: LABELS, exactMatch: false })
  })

  it('texte tapé = contenu du champ : un seul appel, texte rogné, propositions dans l’ordre reçu', async () => {
    const { result } = setup({ typed: ' car ', dish: ' car ' })

    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))
    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))
    expect(getDishSuggestions).toHaveBeenCalledTimes(1)
    expect(getDishSuggestions.mock.calls[0]).toEqual(['b1', 'car'])
  })

  it('exactMatch vrai → pas de case', async () => {
    getDishSuggestions.mockResolvedValue({ labels: LABELS, exactMatch: true })
    const { result } = setup({ typed: 'Purée de carottes', dish: 'Purée de carottes' })

    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))
    expect(result.current.canAddToDishes).toBe(false)
  })

  it('« Purée » et « Compote » sont des plats comme les autres : exactMatch faux → la case est offerte', async () => {
    const { result, rerender } = setup({ typed: 'Purée', dish: 'Purée' })
    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))

    rerender({ babyId: 'b1', typed: '  COMPOTE ', dish: '  COMPOTE ' })
    await waitFor(() => expect(callsFor('COMPOTE')).toHaveLength(1))
    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))
  })

  it('texte tapé ≠ contenu du champ : deux appels, rangée = texte tapé, case = réponse du champ', async () => {
    getDishSuggestions.mockImplementation(async (babyId, text) => (
      text === 'car'
        ? { labels: LABELS, exactMatch: true }
        : { labels: ['ignorées'], exactMatch: false }
    ))
    const { result } = setup({ typed: 'car', dish: 'Gratin' })

    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))
    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))
    expect(getDishSuggestions).toHaveBeenCalledTimes(2)
    expect(callsFor('car')).toHaveLength(1)
    expect(callsFor('Gratin')).toHaveLength(1)
  })

  it('texte tapé ≠ contenu du champ : exactMatch du champ vrai → pas de case, même si celui du texte tapé est faux', async () => {
    getDishSuggestions.mockImplementation(async (babyId, text) => (
      text === 'car'
        ? { labels: LABELS, exactMatch: false }
        : { labels: [], exactMatch: true }
    ))
    const { result } = setup({ typed: 'car', dish: 'Gratin' })

    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))
    await waitFor(() => expect(callsFor('Gratin')).toHaveLength(1))
    // Let the answer of the field text land before reading the box.
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.canAddToDishes).toBe(false)
  })

  it('contenu du champ vide : aucune requête « case », seule la rangée est demandée', async () => {
    const { result } = setup({ typed: 'car', dish: '' })

    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))
    await new Promise((r) => setTimeout(r, 20))

    expect(getDishSuggestions).toHaveBeenCalledTimes(1)
    expect(getDishSuggestions.mock.calls[0]).toEqual(['b1', 'car'])
    expect(result.current.canAddToDishes).toBe(false)
  })

  it('requête du champ pendante → pas de case (jamais proposée avant la réponse du texte courant)', async () => {
    getDishSuggestions.mockImplementation((babyId, text) => (
      text === 'Gratin' ? new Promise(() => {}) : Promise.resolve({ labels: LABELS, exactMatch: false })
    ))
    const { result } = setup({ typed: '', dish: 'Gratin' })

    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))
    await waitFor(() => expect(callsFor('Gratin')).toHaveLength(1))
    expect(result.current.canAddToDishes).toBe(false)
  })

  it('en changeant le texte, les propositions précédentes restent affichées mais la case disparaît jusqu’à la réponse', async () => {
    const { result, rerender } = setup({ typed: 'car', dish: 'car' })
    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))
    expect(result.current.suggestions).toEqual(LABELS)

    let resolveNext
    getDishSuggestions.mockReturnValue(new Promise((r) => { resolveNext = r }))
    rerender({ babyId: 'b1', typed: 'carr', dish: 'carr' })

    // The previous list is kept while the new search is in flight (no flicker)…
    await waitFor(() => expect(callsFor('carr')).toHaveLength(1))
    expect(result.current.suggestions).toEqual(LABELS)
    // …but the box must not be offered on the strength of the PREVIOUS text's answer.
    expect(result.current.canAddToDishes).toBe(false)

    resolveNext({ labels: [], exactMatch: false })
    await waitFor(() => expect(result.current.canAddToDishes).toBe(true))
    expect(result.current.suggestions).toEqual([])
  })

  it('une saisie qui ne diffère que par casse, accents ou espaces réutilise la requête (même clé)', async () => {
    const { result, rerender } = setup({ typed: 'purée de  carottes', dish: 'purée de  carottes' })
    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))

    rerender({ babyId: 'b1', typed: 'PUREE DE CAROTTES', dish: 'PUREE DE CAROTTES' })
    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))

    expect(getDishSuggestions).toHaveBeenCalledTimes(1)
  })
})

describe('useDishSuggestions — chaque bébé ses plats (US23.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDishSuggestions.mockResolvedValue({ labels: LABELS, exactMatch: false })
  })

  it('le bébé fait partie de la clé : deux bébés, deux appels pour le même texte', async () => {
    const { result, rerender } = setup({ typed: 'car', dish: 'car' })
    await waitFor(() => expect(result.current.suggestions).toEqual(LABELS))

    rerender({ babyId: 'b2', typed: 'car', dish: 'car' })
    await waitFor(() => expect(getDishSuggestions).toHaveBeenCalledTimes(2))

    expect(getDishSuggestions.mock.calls.map((call) => call[0]).sort()).toEqual(['b1', 'b2'])
  })
})

function setupHook(hook) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), invalidate, qc }
}

const SUGGESTION_KEYS = [
  ['babies', 'b1', 'dish-suggestions', 'x'],
  ['babies', 'b2', 'dish-suggestions', ''],
]

function seedSuggestions(qc) {
  SUGGESTION_KEYS.forEach((key) => qc.setQueryData(key, { labels: [], exactMatch: false }))
  qc.setQueryData(['babies', 'b1', 'events'], [])
}

function expectSuggestionsInvalidated(qc) {
  SUGGESTION_KEYS.forEach((key) => expect(qc.getQueryState(key).isInvalidated).toBe(true))
  // Only the suggestions are concerned: other data of the baby stays as it is.
  expect(qc.getQueryState(['babies', 'b1', 'events']).isInvalidated).toBe(false)
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

  it('invalide aussi les propositions de plats de tous les bébés (le référentiel a changé)', async () => {
    const { result, qc } = setupHook(() => useRenameDish())
    seedSuggestions(qc)
    qc.setQueryData(['dishes', 'manageable'], ITEMS)

    await act(() => result.current.mutateAsync({ id: 'd1', label: 'Purée de carottes' }))

    expectSuggestionsInvalidated(qc)
    expect(qc.getQueryState(['dishes', 'manageable']).isInvalidated).toBe(true)
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

  it('invalide aussi les propositions de plats de tous les bébés (le référentiel a changé)', async () => {
    deleteDish.mockResolvedValue(null)
    const { result, qc } = setupHook(() => useDeleteDish())
    seedSuggestions(qc)
    qc.setQueryData(['dishes', 'manageable'], ITEMS)

    await act(() => result.current.mutateAsync('d1'))

    expectSuggestionsInvalidated(qc)
    expect(qc.getQueryState(['dishes', 'manageable']).isInvalidated).toBe(true)
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
