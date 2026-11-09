import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCreateMedicalCareAct, useMedicalCareList } from './medicalCares'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  listMedicalCares: vi.fn(),
  createMedicalCareAct: vi.fn(),
}))
import { createMedicalCareAct, listMedicalCares } from '../api'

function setupHook(hook) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, invalidate, ...renderHook(hook, { wrapper }) }
}

const ITEMS = [
  { id: 'n1', occurredAt: '2026-11-08T14:00:00.000Z', careType: 'nose' },
  { id: 'e1', occurredAt: '2026-11-08T08:10:00.000Z', careType: 'eye' },
]

describe('useMedicalCareList — soins de la feuille Soins (Épic 22)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('vide tant que rien n’est chargé, puis les soins dans l’ordre reçu ; appel sans paramètre', async () => {
    listMedicalCares.mockResolvedValue({ items: ITEMS, nextCursor: null })
    const { result } = setupHook(() => useMedicalCareList('b1'))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.cares).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.cares).toEqual(ITEMS)
    expect(listMedicalCares).toHaveBeenCalledTimes(1)
    expect(listMedicalCares.mock.calls[0]).toEqual(['b1'])
  })

  it('en erreur : liste vide', async () => {
    listMedicalCares.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result } = setupHook(() => useMedicalCareList('b1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.cares).toEqual([])
  })

  it('la clé de cache vit sous le préfixe [babies, babyId] (invalidée par toute écriture)', async () => {
    listMedicalCares.mockResolvedValue({ items: ITEMS, nextCursor: null })
    const { qc, result } = setupHook(() => useMedicalCareList('b1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(qc.getQueryData(['babies', 'b1', 'medical-cares'])).toEqual({ items: ITEMS, nextCursor: null })
  })
})

describe('useCreateMedicalCareAct (Épic 22)', () => {
  const BODY = { occurredAt: '2026-11-08T12:00:00.000Z', withEye: true, withNose: true }

  beforeEach(() => {
    vi.clearAllMocks()
    createMedicalCareAct.mockResolvedValue({ eye: ITEMS[1], nose: ITEMS[0] })
  })

  it('mutateAsync(body) appelle createMedicalCareAct(babyId, body)', async () => {
    const { result } = setupHook(() => useCreateMedicalCareAct('b1'))

    await act(() => result.current.mutateAsync(BODY))

    expect(createMedicalCareAct).toHaveBeenCalledTimes(1)
    expect(createMedicalCareAct.mock.calls[0]).toEqual(['b1', BODY])
  })

  it('au succès : UNE invalidation du préfixe [babies, babyId], puis onSuccess', async () => {
    const onSuccess = vi.fn()
    const { result, invalidate } = setupHook(() => useCreateMedicalCareAct('b1', { onSuccess }))

    await act(() => result.current.mutateAsync(BODY))

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['babies', 'b1'] })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('sans option : le succès fonctionne quand même', async () => {
    const { result, invalidate } = setupHook(() => useCreateMedicalCareAct('b1'))

    await act(() => result.current.mutateAsync(BODY))

    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('une erreur serveur remonte : ni invalidation ni onSuccess, un seul appel', async () => {
    createMedicalCareAct.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const onSuccess = vi.fn()
    const { result, invalidate } = setupHook(() => useCreateMedicalCareAct('b1', { onSuccess }))

    await act(() => expect(result.current.mutateAsync(BODY)).rejects.toMatchObject({ status: 500 }))

    expect(createMedicalCareAct).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
