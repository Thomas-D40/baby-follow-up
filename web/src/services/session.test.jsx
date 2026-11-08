import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useLogout, useMe } from './session'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
}))
import { fetchMe, logout } from '../api'

function setupHook(hook) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, invalidate, ...renderHook(hook, { wrapper }) }
}

describe('useMe — session courante (Épic 17)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rend l’utilisateur connecté sous la clé [me]', async () => {
    const user = { id: 'u1', firstName: 'Mamie', email: 'mamie@test.local' }
    fetchMe.mockResolvedValue(user)
    const { qc, result } = setupHook(() => useMe())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.me).toEqual(user)
    expect(qc.getQueryData(['me'])).toEqual(user)
  })

  it('non connecté (fetchMe → null) : me est null', async () => {
    fetchMe.mockResolvedValue(null)
    const { result } = setupHook(() => useMe())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.me).toBeNull()
  })

  it('useMe(false) n’appelle pas fetchMe', async () => {
    const { result } = setupHook(() => useMe(false))

    expect(result.current.me).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(fetchMe).not.toHaveBeenCalled()
  })
})

describe('useLogout (Épic 17)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    logout.mockResolvedValue()
  })

  it('déconnecte puis invalide la session [me]', async () => {
    const { result, invalidate } = setupHook(() => useLogout())

    await act(() => result.current())

    expect(logout).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['me'] })
    expect(logout.mock.invocationCallOrder[0]).toBeLessThan(invalidate.mock.invocationCallOrder[0])
  })
})
