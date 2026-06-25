import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InviteAcceptScreen from './InviteAcceptScreen'

vi.mock('../api', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
  acceptInvitation: vi.fn(),
}))
import { fetchMe, logout, acceptInvitation } from '../api'

function renderScreen(token = 'tok-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><InviteAcceptScreen token={token} /></QueryClientProvider>,
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('InviteAcceptScreen — confirmation d’identité (D8-E)', () => {
  it('affiche le compte connecté + bouton changer de compte AVANT Accepter', async () => {
    fetchMe.mockResolvedValue({ id: 'u1', firstName: 'Mamie', email: 'mamie@test.local' })
    renderScreen()

    expect(await screen.findByText('Mamie')).toBeInTheDocument()
    expect(screen.getByText(/connecté.e en tant que/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Changer de compte/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Accepter l'invitation" })).toBeInTheDocument()
  })

  it('« Changer de compte » déclenche logout', async () => {
    fetchMe.mockResolvedValue({ id: 'u1', firstName: 'Mamie', email: 'mamie@test.local' })
    logout.mockResolvedValue()
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: /Changer de compte/i }))
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })

  it('non connecté → invite à se connecter, pas de bouton Accepter', async () => {
    fetchMe.mockResolvedValue(null)
    renderScreen()

    expect(await screen.findByRole('link', { name: /Se connecter/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Accepter l'invitation" })).not.toBeInTheDocument()
  })
})

describe('InviteAcceptScreen — acceptation', () => {
  it('Accepter appelle acceptInvitation(token) puis affiche le succès', async () => {
    fetchMe.mockResolvedValue({ id: 'u1', firstName: 'Mamie', email: 'mamie@test.local' })
    acceptInvitation.mockResolvedValue(null)
    renderScreen('tok-9')

    await userEvent.click(await screen.findByRole('button', { name: "Accepter l'invitation" }))
    await waitFor(() => expect(acceptInvitation.mock.calls[0][0]).toBe('tok-9'))
    expect(await screen.findByText(/Invitation acceptée/i)).toBeInTheDocument()
  })

  it('410 → message lien expiré/déjà utilisé', async () => {
    fetchMe.mockResolvedValue({ id: 'u1', firstName: 'Mamie', email: 'mamie@test.local' })
    acceptInvitation.mockRejectedValue(Object.assign(new Error('-> 410'), { status: 410 }))
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: "Accepter l'invitation" }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/expiré ou a déjà été utilisé/i)
  })

  it('409 → message déjà accès à ce bébé', async () => {
    fetchMe.mockResolvedValue({ id: 'u1', firstName: 'Mamie', email: 'mamie@test.local' })
    acceptInvitation.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: "Accepter l'invitation" }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/déjà accès à ce bébé/i)
  })

  it('token manquant → message dédié', () => {
    renderScreen(null)
    expect(screen.getByText(/jeton manquant/i)).toBeInTheDocument()
  })
})
