import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useDeleteEvent } from './useDeleteEvent'

// ⚠️ Ce fichier vit à `web/src/` : le module mocké est './api', pas '../api'.
vi.mock('./api', () => ({
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
  deleteTemperature: vi.fn(),
  deleteMedicalCare: vi.fn(),
}))
import { deleteBottleFeeding, deleteNap, deleteStool, deleteTemperature, deleteMedicalCare } from './api'

function setup() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useDeleteEvent('b1'), { wrapper })
  return { result, invalidate }
}

describe('useDeleteEvent (Épic 7, D7-B/D7-C)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('route chaque type vers le bon client avec (babyId, id)', async () => {
    deleteBottleFeeding.mockResolvedValue(null)
    deleteNap.mockResolvedValue(null)
    deleteStool.mockResolvedValue(null)
    const { result } = setup()

    await act(() => result.current.mutateAsync({ type: 'bottle_feeding', id: 'a' }))
    await act(() => result.current.mutateAsync({ type: 'nap', id: 'b' }))
    await act(() => result.current.mutateAsync({ type: 'stool', id: 'c' }))

    expect(deleteBottleFeeding.mock.calls[0]).toEqual(['b1', 'a'])
    expect(deleteNap.mock.calls[0]).toEqual(['b1', 'b'])
    expect(deleteStool.mock.calls[0]).toEqual(['b1', 'c'])
  })

  it('les DEUX types de soin routent vers le MÊME deleteMedicalCare (K1), la température vers le sien', async () => {
    deleteMedicalCare.mockResolvedValue(null)
    deleteTemperature.mockResolvedValue(null)
    const { result } = setup()

    await act(() => result.current.mutateAsync({ type: 'eye_care', id: 'e1' }))
    await act(() => result.current.mutateAsync({ type: 'nose_care', id: 'n1' }))
    await act(() => result.current.mutateAsync({ type: 'temperature', id: 't1' }))

    // Deux types de présentation, une seule ressource `medical_care` → un seul client, deux appels.
    expect(deleteMedicalCare).toHaveBeenCalledTimes(2)
    expect(deleteMedicalCare.mock.calls[0]).toEqual(['b1', 'e1'])
    expect(deleteMedicalCare.mock.calls[1]).toEqual(['b1', 'n1'])
    expect(deleteTemperature.mock.calls[0]).toEqual(['b1', 't1'])
  })

  it('invalide PAR PRÉFIXE [babies, babyId] au succès (cohérence inter-vues, D7-C/R1)', async () => {
    deleteBottleFeeding.mockResolvedValue(null)
    const { result, invalidate } = setup()

    await act(() => result.current.mutateAsync({ type: 'bottle_feeding', id: 'a' }))

    await waitFor(() => expect(invalidate).toHaveBeenCalled())
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['babies', 'b1'] })
  })

  it('traite un 404 comme un succès idempotent (résout, invalide, pas d’erreur) — D7-C', async () => {
    deleteStool.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    const { result, invalidate } = setup()

    await act(() => result.current.mutateAsync({ type: 'stool', id: 'gone' }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['babies', 'b1'] })
  })

  it('laisse remonter un 500 comme une erreur (ne sur-avale pas, R3)', async () => {
    deleteNap.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result, invalidate } = setup()

    // La promesse rejette (l'erreur n'est PAS avalée) ET on n'invalide pas (pas de chemin succès).
    await expect(
      act(() => result.current.mutateAsync({ type: 'nap', id: 'x' })),
    ).rejects.toThrow()
    expect(invalidate).not.toHaveBeenCalled()
  })
})
