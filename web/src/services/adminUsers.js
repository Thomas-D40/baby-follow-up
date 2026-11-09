import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAccount, deleteAccount, getAccountDeletionImpact, listAccounts, resendActivationLink } from '../api'

const ACCOUNTS_KEY = ['admin', 'users']

// Outside the ACCOUNTS_KEY prefix: reloading the list must not reload the previews.
function impactKey(userId) {
  return ['admin', 'deletion-impact', userId]
}

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

// retry: 0 (a replay would mail twice); same invalidation as the creation.
export function useResendActivationLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId) => resendActivationLink(userId),
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  })
}

// Preview of an account deletion, read when the confirmation opens. retry: false (a refusal is final).
// A 404 means the account is already gone and an impact whose status differs from the listed one means
// the list is stale: both reload the list (Épic 24).
export function useAccountDeletionImpact(account, isEnabled) {
  const qc = useQueryClient()
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: impactKey(account.id),
    queryFn: async () => {
      try {
        const impact = await getAccountDeletionImpact(account.id)
        if (impact.status !== account.status) qc.invalidateQueries({ queryKey: ACCOUNTS_KEY })
        return impact
      } catch (err) {
        if (err?.status !== 404) throw err
        qc.invalidateQueries({ queryKey: ACCOUNTS_KEY })
        return null
      }
    },
    enabled: isEnabled,
    retry: false,
  })
  return { impact: data ?? null, isLoading, isFetching, isError }
}

// retry: 0 (a replay would hit an account already deleted); 404 = idempotent success (D24-D).
// A 409 means the impact moved: both the list and the preview are reloaded, and the error reaches the caller.
export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, impactToken, isPendingOnly }) => {
      try {
        await deleteAccount(userId, { impactToken, isPendingOnly })
      } catch (err) {
        if (err?.status === 404) return
        throw err
      }
    },
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
    onError: (err, { userId }) => {
      if (err?.status !== 409) return
      qc.invalidateQueries({ queryKey: ACCOUNTS_KEY })
      qc.invalidateQueries({ queryKey: impactKey(userId) })
    },
  })
}
