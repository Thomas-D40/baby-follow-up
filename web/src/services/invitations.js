import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { acceptInvitation, createInvitation, previewInvitation } from '../api'

// retry: 0 (a replay would re-send the mail); PREFIX invalidation so the circle refreshes everywhere.
export function useCreateInvitation(babyId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, firstName }) => createInvitation(babyId, { email, firstName }),
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
