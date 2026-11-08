import { useQuery } from '@tanstack/react-query'
import { listAccounts } from '../api'

// Own key, outside the ['babies', …] prefix: baby writes must not reload the account list (D20-V).
export function useAccounts() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listAccounts,
  })
  return { accounts: data ?? [], isLoading, isError }
}
