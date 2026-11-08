import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { acceptInvitation, createInvitation, listPendingInvitations, previewInvitation, revokeInvitation } from '../api'

// retry: 0 (a replay would re-send the mail); PREFIX invalidation so the circle refreshes everywhere.
export function useCreateInvitation(babyId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, firstName }) => createInvitation(babyId, { email, firstName }),
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['babies', babyId] }),
  })
}

// Under the baby prefix so any write of the baby refreshes the list. Only owners may call the route.
export function usePendingInvitations(babyId, isOwner) {
  const { data, isLoading } = useQuery({
    queryKey: ['babies', babyId, 'invitations'],
    queryFn: () => listPendingInvitations(babyId),
    enabled: !!babyId && isOwner,
  })
  return { invitations: data ?? [], isLoading }
}

// 404 = idempotent success (D17-AP): the invitation was accepted meanwhile and just leaves the list.
export function useRevokeInvitation(babyId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (token) => {
      try {
        await revokeInvitation(babyId, token)
      } catch (err) {
        if (err?.status === 404) return
        throw err
      }
    },
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['babies', babyId] }),
  })
}

// retry: false, a 410 is final: the "expired link" screen must not wait for the default replays.
export function useInvitationPreview(token) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['invitations', token],
    queryFn: () => previewInvitation(token),
    enabled: !!token,
    retry: false,
  })
  return { preview: data ?? null, isLoading, error }
}

// retry: 0, a replay after a lost response would hit a consumed link.
export function useAcceptInvitation(token) {
  return useMutation({
    mutationFn: (password) => acceptInvitation(token, password ?? null),
    retry: 0,
  })
}
