import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout } from './api'
import LoginScreen from './screens/LoginScreen'
import ActivationScreen from './screens/ActivationScreen'
import InviteAcceptScreen from './screens/InviteAcceptScreen'
import BabiesScreen from './screens/BabiesScreen'

export default function App() {
  const queryClient = useQueryClient()

  // Minimal routing (no react-router in v1): the activation link is /activate?token=…
  if (window.location.pathname === '/activate') {
    const token = new URLSearchParams(window.location.search).get('token')
    return <ActivationScreen token={token} />
  }

  // Acceptation d'une invitation de partage (Épic 8) : /invite?token=…
  if (window.location.pathname === '/invite') {
    const token = new URLSearchParams(window.location.search).get('token')
    return <InviteAcceptScreen token={token} />
  }

  // Auth state derived from /api/me (200 → user, 401 → null). The front stores no token.
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: fetchMe })

  if (isLoading) {
    return <p className="center">…</p>
  }

  // "On 401" redirect: no user → login screen.
  if (!me) {
    return <LoginScreen onLoggedIn={() => queryClient.invalidateQueries({ queryKey: ['me'] })} />
  }

  async function handleLogout() {
    await logout()
    queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  return <BabiesScreen me={me} onLogout={handleLogout} />
}
