import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useUpdateEvent } from './events'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'. UPDATE_CLIENT reads its
// clients when the module loads, so every update client must be declared here.
vi.mock('../api', () => ({
  updateBottleFeeding: vi.fn(),
  updateNap: vi.fn(),
  updateStool: vi.fn(),
  updateUrine: vi.fn(),
  updateTemperature: vi.fn(),
  updateMedicalCare: vi.fn(),
  updateBreastfeeding: vi.fn(),
  updateSolidMeal: vi.fn(),
  updateMedication: vi.fn(),
}))
import {
  updateBottleFeeding,
  updateBreastfeeding,
  updateMedicalCare,
  updateMedication,
  updateNap,
  updateSolidMeal,
  updateStool,
  updateTemperature,
  updateUrine,
} from '../api'

function setup(options = {}) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useUpdateEvent('b1', options), { wrapper })
  return { result, invalidate }
}

const PATCH = { occurredAt: '2026-11-08T14:00:00.000Z' }

describe('useUpdateEvent — routage d’édition par type (Épic 18, D18-AO)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;[updateBottleFeeding, updateNap, updateStool, updateUrine, updateTemperature, updateMedicalCare,
      updateBreastfeeding, updateSolidMeal, updateMedication].forEach((client) => client.mockResolvedValue({}))
  })

  it.each([
    ['bottle_feeding', () => updateBottleFeeding],
    ['nap', () => updateNap],
    ['stool', () => updateStool],
    ['urine', () => updateUrine],
    ['temperature', () => updateTemperature],
    ['breastfeeding', () => updateBreastfeeding],
    ['solid_meal', () => updateSolidMeal],
    ['medication', () => updateMedication],
  ])('« %s » est routé vers son client avec (babyId, id, patch)', async (type, client) => {
    const { result } = setup()

    await act(() => result.current.mutateAsync({ type, id: 'e1', patch: PATCH }))

    expect(client()).toHaveBeenCalledTimes(1)
    expect(client().mock.calls[0]).toEqual(['b1', 'e1', PATCH])
  })

  it('les DEUX types de soin routent vers le MÊME updateMedicalCare', async () => {
    const { result } = setup()

    await act(() => result.current.mutateAsync({ type: 'eye_care', id: 'e1', patch: PATCH }))
    await act(() => result.current.mutateAsync({ type: 'nose_care', id: 'n1', patch: PATCH }))

    expect(updateMedicalCare).toHaveBeenCalledTimes(2)
    expect(updateMedicalCare.mock.calls[0]).toEqual(['b1', 'e1', PATCH])
    expect(updateMedicalCare.mock.calls[1]).toEqual(['b1', 'n1', PATCH])
  })

  it('au succès : une seule invalidation du préfixe [babies, babyId], puis onSuccess', async () => {
    const onSuccess = vi.fn()
    const { result, invalidate } = setup({ onSuccess })

    await act(() => result.current.mutateAsync({ type: 'breastfeeding', id: 'br1', patch: PATCH }))

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['babies', 'b1'] })
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('une erreur serveur remonte : ni invalidation ni onSuccess', async () => {
    updateNap.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    const onSuccess = vi.fn()
    const { result, invalidate } = setup({ onSuccess })

    await expect(
      act(() => result.current.mutateAsync({ type: 'nap', id: 'n1', patch: PATCH })),
    ).rejects.toThrow()

    expect(invalidate).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('une modification depuis le récap ne change pas le mode mémorisé de la feuille Repas', async () => {
    const { result } = setup()

    await act(() => result.current.mutateAsync({ type: 'breastfeeding', id: 'br1', patch: PATCH }))
    await act(() => result.current.mutateAsync({ type: 'solid_meal', id: 'sm1', patch: PATCH }))

    expect(localStorage.getItem('suivibaby.feedingMode')).toBeNull()
  })
})
