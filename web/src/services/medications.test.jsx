import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useCreateMedication, useMedicationList } from './medications'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  listMedications: vi.fn(),
  createMedication: vi.fn(),
}))
import { createMedication, listMedications } from '../api'

function setupHook(hook) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, invalidate, ...renderHook(hook, { wrapper }) }
}

const ITEMS = [
  { id: 'm2', occurredAt: '2026-11-08T14:00:00.000Z', medicationName: 'Ventoline', dosage: null },
  { id: 'm1', occurredAt: '2026-11-08T08:10:00.000Z', medicationName: 'Doliprane', dosage: '1 dose 6 kg' },
]

describe('useMedicationList — prises de la feuille Médical (Épic 19)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('vide tant que rien n’est chargé, puis les prises dans l’ordre reçu ; appel sans paramètre', async () => {
    listMedications.mockResolvedValue({ items: ITEMS, nextCursor: null })
    const { result } = setupHook(() => useMedicationList('b1'))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.medications).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.medications).toEqual(ITEMS)
    expect(listMedications).toHaveBeenCalledTimes(1)
    expect(listMedications.mock.calls[0]).toEqual(['b1'])
  })

  it('en erreur : liste vide', async () => {
    listMedications.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result } = setupHook(() => useMedicationList('b1'))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.medications).toEqual([])
  })

  it('la clé de cache vit sous le préfixe [babies, babyId] (invalidée par toute écriture)', async () => {
    listMedications.mockResolvedValue({ items: ITEMS, nextCursor: null })
    const { qc, result } = setupHook(() => useMedicationList('b1'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(qc.getQueryData(['babies', 'b1', 'medications'])).toEqual({ items: ITEMS, nextCursor: null })
  })
})

describe('useCreateMedication (Épic 19)', () => {
  const BODY = { occurredAt: '2026-11-08T12:00:00.000Z', medicationName: 'Doliprane', dosage: null }

  beforeEach(() => {
    vi.clearAllMocks()
    createMedication.mockResolvedValue({ id: 'm9', ...BODY })
  })

  it('mutateAsync(body) appelle createMedication(babyId, body)', async () => {
    const { result } = setupHook(() => useCreateMedication('b1'))

    await act(() => result.current.mutateAsync(BODY))

    expect(createMedication).toHaveBeenCalledTimes(1)
    expect(createMedication.mock.calls[0]).toEqual(['b1', BODY])
  })

  it('au succès : UNE invalidation du préfixe [babies, babyId], puis onSuccess', async () => {
    const onSuccess = vi.fn()
    const { result, invalidate } = setupHook(() => useCreateMedication('b1', { onSuccess }))

    await act(() => result.current.mutateAsync(BODY))

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['babies', 'b1'] })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('sans option : le succès fonctionne quand même', async () => {
    const { result, invalidate } = setupHook(() => useCreateMedication('b1'))

    await act(() => result.current.mutateAsync(BODY))

    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it('une erreur serveur remonte : ni invalidation ni onSuccess, un seul appel', async () => {
    createMedication.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const onSuccess = vi.fn()
    const { result, invalidate } = setupHook(() => useCreateMedication('b1', { onSuccess }))

    await expect(act(() => result.current.mutateAsync(BODY))).rejects.toMatchObject({ status: 500 })

    expect(createMedication).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
