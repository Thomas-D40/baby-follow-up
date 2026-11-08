import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAccount, listAccounts } from '../api'

const ACCOUNTS_KEY = ['admin', 'users']

// Own key, outside the ['babies', …] prefix: baby writes must not reload the account list (D20-V).
export function useAccounts() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: listAccounts,
  })
  return { accounts: data ?? [], isLoading, isError }
}

// retry: 0 (a replay would create a second mail); the list is reloaded after success.
export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ email, firstName }) => createAccount({ email, firstName }),
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  })
}
