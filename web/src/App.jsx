import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout } from './api'
import LoginScreen from './screens/LoginScreen'
import ActivationScreen from './screens/ActivationScreen'

export default function App() {
  const queryClient = useQueryClient()

  // Minimal routing (no react-router in v1): the activation link is /activate?token=…
  if (window.location.pathname === '/activate') {
    const token = new URLSearchParams(window.location.search).get('token')
    return <ActivationScreen token={token} />
  }

  // Auth state derived from /api/me (200 → user, 401 → null). The front stores no token.
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: fetchMe })

  if (isLoading) {
    return <p style={center}>…</p>
  }

  // "On 401" redirect: no user → login screen.
  if (!me) {
    return <LoginScreen onLoggedIn={() => queryClient.invalidateQueries({ queryKey: ['me'] })} />
  }

  async function handleLogout() {
    await logout()
    queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Suivi Baby</h1>
      <p>Connecté en tant que <strong>{me.firstName || me.email}</strong> ({me.role}).</p>
      <p style={{ color: '#888' }}>Les écrans de suivi (bébé, biberon, sieste…) arrivent aux épics suivants.</p>
      <button onClick={handleLogout} style={logoutBtn}>Se déconnecter</button>
    </main>
  )
}

const center = { textAlign: 'center', marginTop: '4rem', fontFamily: 'system-ui, sans-serif' }
const logoutBtn = { padding: '.5rem 1rem', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }
