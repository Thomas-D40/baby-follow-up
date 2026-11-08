import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createMedication, listMedications } from '../api'

// The key sits under the baby prefix so any write of the baby refreshes the list.
export function useMedicationList(babyId) {
  const { data, isLoading } = useQuery({
    queryKey: ['babies', babyId, 'medications'],
    queryFn: () => listMedications(babyId),
  })
  return { medications: data?.items ?? [], isLoading }
}

// retry: 0 (no automatic replay that would duplicate on a lost response); PREFIX invalidation so
// the recap (events + daily-totals) refreshes too.
export function useCreateMedication(babyId, { onSuccess } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => createMedication(babyId, body),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      onSuccess?.()
    },
  })
}
