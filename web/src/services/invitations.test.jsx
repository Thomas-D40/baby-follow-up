import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useAcceptInvitation, useCreateInvitation, useInvitationPreview, usePendingInvitations, useRevokeInvitation,
} from './invitations'

// ⚠️ This file lives in web/src/services/: the mocked module is '../api'.
vi.mock('../api', () => ({
  createInvitation: vi.fn(),
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  listPendingInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
}))
import {
  acceptInvitation, createInvitation, listPendingInvitations, previewInvitation, revokeInvitation,
} from '../api'

// The client retries by default (twice, no delay): a hook that does not opt out itself would call the
// API three times, so "one call" below really proves the hook's own `retry: 0`.
function setupHook(hook) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 2, retryDelay: 0 }, mutations: { retry: 2, retryDelay: 0 } },
  })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return { qc, invalidate, ...renderHook(hook, { wrapper }) }
}

describe('useCreateInvitation (Épic 17, US17.1)', () => {
  const BODY = { email: 'jeanne@exemple.fr', firstName: 'Jeanne' }

  beforeEach(() => {
    vi.clearAllMocks()
    createInvitation.mockResolvedValue({ token: 't', link: 'http://x/invite?token=t', mailSent: true })
  })

  it('mutateAsync({ email, firstName }) appelle createInvitation(babyId, { email, firstName })', async () => {
    const { result } = setupHook(() => useCreateInvitation('b1'))

    await act(() => result.current.mutateAsync(BODY))

    expect(createInvitation).toHaveBeenCalledTimes(1)
    expect(createInvitation.mock.calls[0]).toEqual(['b1', BODY])
  })

  it('au succès : UNE invalidation du préfixe [babies, babyId]', async () => {
    const { result, invalidate } = setupHook(() => useCreateInvitation('b1'))

    await act(() => result.current.mutateAsync(BODY))

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['babies', 'b1'] })
  })

  it('une erreur remonte : un seul appel (retry: 0), aucune invalidation', async () => {
    createInvitation.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result, invalidate } = setupHook(() => useCreateInvitation('b1'))

    await act(() => expect(result.current.mutateAsync(BODY)).rejects.toMatchObject({ status: 500 }))

    expect(createInvitation).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('useInvitationPreview (Épic 17, US17.2)', () => {
  const PREVIEW = { needsPassword: true, inviterFirstName: 'Thomas', babyFirstName: 'Léa', inviteeEmail: 'jeanne@exemple.fr' }

  beforeEach(() => vi.clearAllMocks())

  it('charge le pré-vol du jeton sous la clé [invitations, token]', async () => {
    previewInvitation.mockResolvedValue(PREVIEW)
    const { qc, result } = setupHook(() => useInvitationPreview('tok'))

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.preview).toEqual(PREVIEW)
    expect(previewInvitation.mock.calls[0]).toEqual(['tok'])
    expect(qc.getQueryData(['invitations', 'tok'])).toEqual(PREVIEW)
  })

  it('410 définitif : error.status lisible après UN seul appel (pas de rejeu)', async () => {
    previewInvitation.mockRejectedValue(Object.assign(new Error('-> 410'), { status: 410 }))
    const { result } = setupHook(() => useInvitationPreview('tok'))

    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(result.current.error.status).toBe(410)
    expect(previewInvitation).toHaveBeenCalledTimes(1)
  })

  it('sans jeton : aucun appel', () => {
    const { result } = setupHook(() => useInvitationPreview(null))

    expect(previewInvitation).not.toHaveBeenCalled()
    expect(result.current.preview).toBeFalsy()
  })
})

describe('useAcceptInvitation (Épic 17, US17.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    acceptInvitation.mockResolvedValue(null)
  })

  it('mutateAsync(mot de passe) appelle acceptInvitation(token, mot de passe)', async () => {
    const { result } = setupHook(() => useAcceptInvitation('tok'))

    await act(() => result.current.mutateAsync('motdepasse12'))

    expect(acceptInvitation.mock.calls[0]).toEqual(['tok', 'motdepasse12'])
  })

  it('sans mot de passe : acceptInvitation(token, null)', async () => {
    const { result } = setupHook(() => useAcceptInvitation('tok'))

    await act(() => result.current.mutateAsync(undefined))

    expect(acceptInvitation.mock.calls[0]).toEqual(['tok', null])
  })

  it('une erreur remonte : un seul appel (retry: 0)', async () => {
    acceptInvitation.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result } = setupHook(() => useAcceptInvitation('tok'))

    await act(() => expect(result.current.mutateAsync(null)).rejects.toMatchObject({ status: 500 }))

    expect(acceptInvitation).toHaveBeenCalledTimes(1)
  })
})

describe('usePendingInvitations (Épic 17, US17.4)', () => {
  const ITEMS = [{ token: 'tok', inviteeEmail: 'jeanne@exemple.fr', inviteeFirstName: 'Jeanne', expiresAt: '2026-11-11T13:05:00Z' }]

  beforeEach(() => vi.clearAllMocks())

  it('owner : vide pendant le chargement, puis les invitations sous la clé [babies, babyId, invitations]', async () => {
    listPendingInvitations.mockResolvedValue(ITEMS)
    const { qc, result } = setupHook(() => usePendingInvitations('b1', true))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.invitations).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.invitations).toEqual(ITEMS)
    expect(listPendingInvitations.mock.calls[0]).toEqual(['b1'])
    expect(qc.getQueryData(['babies', 'b1', 'invitations'])).toEqual(ITEMS)
  })

  it('non-owner : le client n’est jamais appelé', () => {
    const { result } = setupHook(() => usePendingInvitations('b1', false))

    expect(listPendingInvitations).not.toHaveBeenCalled()
    expect(result.current.invitations).toEqual([])
  })

  it('sans bébé : le client n’est jamais appelé', () => {
    setupHook(() => usePendingInvitations(null, true))

    expect(listPendingInvitations).not.toHaveBeenCalled()
  })
})

describe('useRevokeInvitation (Épic 17, US17.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revokeInvitation.mockResolvedValue(null)
  })

  it('mutateAsync(token) appelle revokeInvitation(babyId, token) puis invalide [babies, babyId]', async () => {
    const { result, invalidate } = setupHook(() => useRevokeInvitation('b1'))

    await act(() => result.current.mutateAsync('tok'))

    expect(revokeInvitation.mock.calls[0]).toEqual(['b1', 'tok'])
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['babies', 'b1'] })
  })

  it('404 (acceptée entre-temps) : succès idempotent, la liste est invalidée', async () => {
    revokeInvitation.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    const { result, invalidate } = setupHook(() => useRevokeInvitation('b1'))

    await act(() => result.current.mutateAsync('tok'))

    expect(revokeInvitation).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['babies', 'b1'] })
  })

  it('500 : l’erreur remonte, un seul appel (retry: 0), aucune invalidation', async () => {
    revokeInvitation.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { result, invalidate } = setupHook(() => useRevokeInvitation('b1'))

    await act(() => expect(result.current.mutateAsync('tok')).rejects.toMatchObject({ status: 500 }))

    expect(revokeInvitation).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
