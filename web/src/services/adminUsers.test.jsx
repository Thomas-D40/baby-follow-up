import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAccounts } from './adminUsers'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  resendActivationLink: vi.fn(),
}))
import { listAccounts } from '../api'

// The client retries by default (twice, no delay): a hook that does not opt out itself would call the
// API three times, so "one call" below really proves the hook's own `retry: 0`.
function setupHook(hook) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 2, retryDelay: 0 } },
  })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, invalidate, ...renderHook(hook, { wrapper }) }
}

const ACCOUNTS = [
  { id: 'u1', email: 'lisa@exemple.fr', firstName: 'Lisa', role: 'parent', status: 'active', createdAt: '2026-11-06T10:00:00Z' },
]

describe('useAccounts — liste des comptes (Épic 20, US20.1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('vide pendant le chargement, puis les comptes sous la clé [admin, users]', async () => {
    listAccounts.mockResolvedValue(ACCOUNTS)
    const { qc, result } = setupHook(() => useAccounts())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.accounts).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.accounts).toEqual(ACCOUNTS)
    expect(result.current.isError).toBe(false)
    expect(qc.getQueryData(['admin', 'users'])).toEqual(ACCOUNTS)
  })

  it('en erreur : liste vide et isError', async () => {
    listAccounts.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result } = setupHook(() => useAccounts())

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.accounts).toEqual([])
  })
})
