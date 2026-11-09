import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteDish, listManageableDishes, renameDish, searchDishes } from '../api'
import { normalizeDishLabel } from '../dish'

// Row of suggestions for the TYPED text (a touch does not move it, D23-D) and whether the "add to my
// dishes" box may be offered for the text now in the field. An empty text makes no request. The row
// keeps its previous answer while the next one loads; the box is only offered once the search of
// the CURRENT text has arrived (D18-AG). Two texts of one normalized form share one request.
export function useDishSearch(typedText, dishText) {
  const typed = typedText.trim()
  const field = dishText.trim()
  const row = useQuery({
    queryKey: ['dishes', 'search', normalizeDishLabel(typedText)],
    queryFn: () => searchDishes(typed),
    enabled: typed !== '',
    placeholderData: keepPreviousData,
  })
  const box = useQuery({
    queryKey: ['dishes', 'search', normalizeDishLabel(dishText)],
    queryFn: () => searchDishes(field),
    enabled: field !== '',
  })
  return {
    suggestions: typed === '' ? [] : (row.data?.items ?? []).map((item) => item.label),
    canAddToDishes: field !== '' && box.isSuccess && box.data.exactMatch === false,
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
