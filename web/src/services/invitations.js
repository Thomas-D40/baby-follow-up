import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createInvitation } from '../api'

// retry: 0 (a replay would re-send the mail); PREFIX invalidation so the circle refreshes everywhere.
export function useCreateInvitation(babyId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, firstName }) => createInvitation(babyId, { email, firstName }),
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['babies', babyId] }),
  })
}
