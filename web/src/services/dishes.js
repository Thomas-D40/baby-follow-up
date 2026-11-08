import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteDish, listManageableDishes, renameDish, searchDishes } from '../api'
import { isFixedDish, normalizeDishLabel } from '../dish'

// Suggestions for the dish being typed, plus whether the "add to my dishes" box may be offered. An
// empty text makes no request. The previous answer is kept while the next one loads, so the box is
// only offered once the search of the CURRENT text has arrived (D18-AG).
export function useDishSearch(text) {
  const trimmed = text.trim()
  const { data, isSuccess, isPlaceholderData } = useQuery({
    queryKey: ['dishes', 'search', normalizeDishLabel(text)],
    queryFn: () => searchDishes(trimmed),
    enabled: trimmed !== '',
    placeholderData: keepPreviousData,
  })
  if (trimmed === '') return { suggestions: [], canAddToDishes: false }
  return {
    suggestions: data?.items ?? [],
    canAddToDishes: !isFixedDish(text) && isSuccess && !isPlaceholderData && data.exactMatch === false,
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

// Both writes invalidate every dish query: the searches show the new label too. retry: 0 (no replay
// on a lost response).
export function useRenameDish() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, label }) => renameDish(id, label),
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dishes'] }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dishes'] }),
  })
}
