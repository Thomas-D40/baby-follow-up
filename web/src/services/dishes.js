import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteDish, getDishSuggestions, listManageableDishes, renameDish } from '../api'
import { normalizeDishLabel } from '../dish'

// Every key sits under the baby prefix, so any write of the baby refreshes the suggestions (D23-S).
function suggestionsKey(babyId, text) {
  return ['babies', babyId, 'dish-suggestions', normalizeDishLabel(text)]
}

// Row of suggestions for the TYPED text (a touch does not move it, D23-D; an empty text gives the
// recent dishes) and whether the "add to my dishes" box may be offered for the text now in the
// field. The row keeps its previous answer while the next one loads; the box is only offered once
// the answer for the CURRENT text has arrived (D18-AG): a cached answer being refetched (e.g. after
// an invalidation) may be stale, so it does not count. Two texts of one normalized form share one
// request.
export function useDishSuggestions(babyId, typedText, dishText) {
  const field = dishText.trim()
  const row = useQuery({
    queryKey: suggestionsKey(babyId, typedText),
    queryFn: () => getDishSuggestions(babyId, typedText.trim()),
    placeholderData: keepPreviousData,
  })
  const box = useQuery({
    queryKey: suggestionsKey(babyId, dishText),
    queryFn: () => getDishSuggestions(babyId, field),
    enabled: field !== '',
  })
  return {
    suggestions: row.data?.labels ?? [],
    canAddToDishes: field !== '' && box.isSuccess && !box.isFetching && box.data.exactMatch === false,
  }
}

// "My dishes" screen: the server decides which dishes the user may manage (D18-AI).
export function useManageableDishes() {
  const { data, isLoading } = useQuery({
    queryKey: ['dishes', 'manageable'],
    queryFn: listManageableDishes,
  })
  return { dishes: data ?? [], isLoading }
}

// Both writes invalidate the dish list and the suggestions of every baby: the shared labels shown
// there may have changed (D23-S). retry: 0 (no replay on a lost response).
function invalidateDishes(qc) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['dishes'] }),
    qc.invalidateQueries({
      predicate: (query) => query.queryKey[0] === 'babies' && query.queryKey[2] === 'dish-suggestions',
    }),
  ])
}

export function useRenameDish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, label }) => renameDish(id, label),
    retry: 0,
    onSuccess: () => invalidateDishes(qc),
  })
}

// 404 = success: the dish is already gone, which is what the user asked for (same rule as D7-C).
export function useDeleteDish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      try {
        await deleteDish(id)
      } catch (err) {
        if (err?.status === 404) return
        throw err
      }
    },
    retry: 0,
    onSuccess: () => invalidateDishes(qc),
  })
}
