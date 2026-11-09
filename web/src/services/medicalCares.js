import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createMedicalCareAct, listMedicalCares } from '../api'

// The key sits under the baby prefix so any write of the baby refreshes the list.
export function useMedicalCareList(babyId) {
  const { data, isLoading } = useQuery({
    queryKey: ['babies', babyId, 'medical-cares'],
    queryFn: () => listMedicalCares(babyId),
  })
  return { cares: data?.items ?? [], isLoading }
}

// retry: 0 (no automatic replay that would duplicate on a lost response); PREFIX invalidation so
// the recap (events + daily-totals) refreshes too.
export function useCreateMedicalCareAct(babyId, { onSuccess } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => createMedicalCareAct(babyId, body),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      onSuccess?.()
    },
  })
}
