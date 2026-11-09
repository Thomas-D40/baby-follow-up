import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useAccountDeletionImpact, useAccounts, useCreateAccount, useDeleteAccount, useResendActivationLink,
} from './adminUsers'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  resendActivationLink: vi.fn(),
  getAccountDeletionImpact: vi.fn(),
  deleteAccount: vi.fn(),
}))
import {
  createAccount, deleteAccount, getAccountDeletionImpact, listAccounts, resendActivationLink,
} from '../api'

// The client retries by default (twice, no delay): a hook that does not opt out itself would call the
// API three times, so "one call" below really proves the hook's own `retry: 0`. For a query hook, pass
// `queryRetry: 2` to prove its own `retry: false` the same way.
function setupHook(hook, { queryRetry = false } = {}) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: queryRetry, retryDelay: 0 },
      mutations: { retry: 2, retryDelay: 0 },
    },
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

describe('useCreateAccount (Épic 20, US20.2)', () => {
  const BODY = { email: 'lisa@exemple.fr', firstName: 'Lisa' }

  beforeEach(() => {
    vi.clearAllMocks()
    createAccount.mockResolvedValue({ userId: 'u9', activationLink: 'http://x/activate?token=abc', mailSent: true })
  })

  it('mutateAsync({ email, firstName }) appelle createAccount({ email, firstName })', async () => {
    const { result } = setupHook(() => useCreateAccount())

    await act(() => result.current.mutateAsync(BODY))

    expect(createAccount).toHaveBeenCalledTimes(1)
    expect(createAccount.mock.calls[0]).toEqual([BODY])
  })

  it('au succès : UNE invalidation de la liste [admin, users]', async () => {
    const { result, invalidate } = setupHook(() => useCreateAccount())

    await act(() => result.current.mutateAsync(BODY))

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] })
  })

  it('une erreur remonte : un seul appel (retry: 0), aucune invalidation', async () => {
    createAccount.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    const { result, invalidate } = setupHook(() => useCreateAccount())

    await act(() => expect(result.current.mutateAsync(BODY)).rejects.toMatchObject({ status: 409 }))

    expect(createAccount).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('useResendActivationLink (Épic 20, US20.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resendActivationLink.mockResolvedValue({ userId: 'u3', activationLink: 'http://x/activate?token=new', mailSent: true })
  })

  it('mutateAsync(userId) appelle resendActivationLink(userId)', async () => {
    const { result } = setupHook(() => useResendActivationLink())

    await act(() => result.current.mutateAsync('u3'))

    expect(resendActivationLink).toHaveBeenCalledTimes(1)
    expect(resendActivationLink.mock.calls[0]).toEqual(['u3'])
  })

  it('au succès : UNE invalidation de la liste [admin, users]', async () => {
    const { result, invalidate } = setupHook(() => useResendActivationLink())

    await act(() => result.current.mutateAsync('u3'))

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'users'] })
  })

  it('une erreur remonte : un seul appel (retry: 0), aucune invalidation', async () => {
    resendActivationLink.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    const { result, invalidate } = setupHook(() => useResendActivationLink())

    await act(() => expect(result.current.mutateAsync('u3')).rejects.toMatchObject({ status: 409 }))

    expect(resendActivationLink).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })
})

const LISA_ACCOUNT = {
  id: 'u2', email: 'lisa@exemple.fr', firstName: 'Lisa', role: 'parent', status: 'active',
  createdAt: '2026-11-06T10:00:00Z',
}
const IMPACT = {
  userId: 'u2', status: 'active', deletedBabyCount: 1, sharedBabyCount: 0, blockingBabyCount: 0, impactToken: 't1',
}
const USERS_KEY = { queryKey: ['admin', 'users'] }

describe('useAccountDeletionImpact — aperçu avant confirmation (Épic 24, US24.1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('isEnabled faux : aucun appel, impact nul', async () => {
    const { result } = setupHook(() => useAccountDeletionImpact(LISA_ACCOUNT, false))

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(getAccountDeletionImpact).not.toHaveBeenCalled()
    expect(result.current.impact).toBeNull()
  })

  it('isEnabled vrai : getAccountDeletionImpact(id), l’impact est sous la clé [admin, deletion-impact, id]', async () => {
    getAccountDeletionImpact.mockResolvedValue(IMPACT)
    const { qc, result } = setupHook(() => useAccountDeletionImpact(LISA_ACCOUNT, true))

    await waitFor(() => expect(result.current.impact).toEqual(IMPACT))

    expect(getAccountDeletionImpact).toHaveBeenCalledTimes(1)
    expect(getAccountDeletionImpact.mock.calls[0]).toEqual(['u2'])
    expect(qc.getQueryData(['admin', 'deletion-impact', 'u2'])).toEqual(IMPACT)
    expect(result.current.isError).toBe(false)
  })

  it('statut de l’aperçu identique à celui de la ligne : la liste n’est pas invalidée', async () => {
    getAccountDeletionImpact.mockResolvedValue(IMPACT)
    const { result, invalidate } = setupHook(() => useAccountDeletionImpact(LISA_ACCOUNT, true))

    await waitFor(() => expect(result.current.impact).toEqual(IMPACT))

    expect(invalidate).not.toHaveBeenCalledWith(USERS_KEY)
  })

  it('statut différent (ligne « pending », aperçu « active ») : la liste périmée est invalidée', async () => {
    getAccountDeletionImpact.mockResolvedValue({ ...IMPACT, status: 'active' })
    const { invalidate } = setupHook(() => useAccountDeletionImpact({ ...LISA_ACCOUNT, status: 'pending' }, true))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(USERS_KEY))
  })

  it('404 : impact nul et liste invalidée (le compte est déjà supprimé)', async () => {
    getAccountDeletionImpact.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    const { result, invalidate } = setupHook(() => useAccountDeletionImpact(LISA_ACCOUNT, true))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(USERS_KEY))

    expect(result.current.impact).toBeNull()
    expect(result.current.isError).toBe(false)
  })

  it('erreur 500 : un seul appel malgré les rejeux du client (retry: false), isError', async () => {
    getAccountDeletionImpact.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result } = setupHook(() => useAccountDeletionImpact(LISA_ACCOUNT, true), { queryRetry: 2 })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(getAccountDeletionImpact).toHaveBeenCalledTimes(1)
    expect(result.current.impact).toBeNull()
  })
})

describe('useDeleteAccount — suppression et révocation (Épic 24, US24.1 et US24.2)', () => {
  const ARGS = { userId: 'u2', impactToken: 't1', isPendingOnly: false }
  const IMPACT_KEY = { queryKey: ['admin', 'deletion-impact', 'u2'] }

  beforeEach(() => {
    vi.clearAllMocks()
    deleteAccount.mockResolvedValue(null)
  })

  it('mutateAsync({ userId, impactToken, isPendingOnly }) appelle deleteAccount(userId, { impactToken, isPendingOnly })', async () => {
    const { result } = setupHook(() => useDeleteAccount())

    await act(() => result.current.mutateAsync(ARGS))

    expect(deleteAccount).toHaveBeenCalledTimes(1)
    expect(deleteAccount.mock.calls[0]).toEqual(['u2', { impactToken: 't1', isPendingOnly: false }])
  })

  it('la révocation transmet isPendingOnly: true', async () => {
    const { result } = setupHook(() => useDeleteAccount())

    await act(() => result.current.mutateAsync({ ...ARGS, userId: 'u3', isPendingOnly: true }))

    expect(deleteAccount.mock.calls[0]).toEqual(['u3', { impactToken: 't1', isPendingOnly: true }])
  })

  it('au succès : la liste [admin, users] est invalidée', async () => {
    const { result, invalidate } = setupHook(() => useDeleteAccount())

    await act(() => result.current.mutateAsync(ARGS))

    expect(invalidate).toHaveBeenCalledWith(USERS_KEY)
  })

  it('une erreur serveur remonte : un seul appel malgré les rejeux du client (retry: 0)', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result } = setupHook(() => useDeleteAccount())

    // Awaited inside act: the thenable act() returns lets .rejects pass before the mutation settles.
    await act(() => expect(result.current.mutateAsync(ARGS)).rejects.toMatchObject({ status: 500 }))

    expect(deleteAccount).toHaveBeenCalledTimes(1)
  })

  it('404 : succès idempotent, la mutation résout et la liste est invalidée', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    const { result, invalidate } = setupHook(() => useDeleteAccount())

    await act(() => result.current.mutateAsync(ARGS)) // would throw if the 404 were propagated

    expect(deleteAccount).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith(USERS_KEY)
  })

  it('409 : la liste et l’aperçu de ce compte sont invalidés, l’erreur remonte', async () => {
    deleteAccount.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    const { result, invalidate } = setupHook(() => useDeleteAccount())

    // Same as above: the rejection is awaited inside act, after onError has invalidated.
    await act(() => expect(result.current.mutateAsync(ARGS)).rejects.toMatchObject({ status: 409 }))

    expect(deleteAccount).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith(USERS_KEY)
    expect(invalidate).toHaveBeenCalledWith(IMPACT_KEY)
  })
})
