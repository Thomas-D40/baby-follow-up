import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { searchDishes } from '../api'
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
