import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createBottleFeeding, createBreastfeeding, listBreastfeedings } from '../api'
import { formatLastBreastfeeding } from '../breastfeeding'
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

export function useCreateBreastfeeding(babyId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => createBreastfeeding(babyId, body),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      saveFeedingMode('breast')
    },
  })
}

// Text of the "last feed" reminder, or null while loading / when there is no feed yet (D18-W). The
// key sits under the baby prefix so any write of the baby refreshes it.
export function useLastBreastfeedingReminder(babyId) {
  const { data } = useQuery({
    queryKey: ['babies', babyId, 'breastfeedings', 'last'],
    queryFn: () => listBreastfeedings(babyId, { limit: 1 }),
  })
  return formatLastBreastfeeding(data?.items?.[0] ?? null)
}
