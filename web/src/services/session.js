import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout } from '../api'

// `enabled` lets a screen skip the lookup when it does not need the identity.
export function useMe(enabled = true) {
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled })
  return { me: data ?? null, isLoading }
}

export function useLogout() {
  const qc = useQueryClient()
  return async () => {
    await logout()
    qc.invalidateQueries({ queryKey: ['me'] })
  }
}
