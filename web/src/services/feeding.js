import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBottleFeeding } from '../api'
import { saveFeedingMode } from '../feedingMode'

// Writes run with retry: 0 (no automatic replay that would duplicate on a lost response). The
// invalidation is by PREFIX so the recap (events + daily-totals) refreshes too. The remembered mode
// is written on success only, and only by the creation hooks (D18-AK).
export function useCreateBottleFeeding(babyId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => createBottleFeeding(babyId, body),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      saveFeedingMode('bottle')
    },
  })
}
