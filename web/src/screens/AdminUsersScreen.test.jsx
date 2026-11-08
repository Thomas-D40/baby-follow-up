import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminUsersScreen from './AdminUsersScreen'

vi.mock('../api', () => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  resendActivationLink: vi.fn(),
}))
import { listAccounts } from '../api'

const JEANNE = {
  id: 'u3', email: 'jeanne@exemple.fr', firstName: 'Jeanne', role: 'parent', status: 'pending',
  createdAt: '2026-11-07T23:30:00Z', // 08/11/2026 in Paris
}
const LISA = {
  id: 'u2', email: 'lisa@exemple.fr', firstName: 'Lisa', role: 'parent', status: 'active',
  createdAt: '2026-11-06T10:00:00Z',
}
const THOMAS = {
  id: 'u1', email: 'thomas@exemple.fr', firstName: 'Thomas', role: 'admin', status: 'active',
  createdAt: '2026-10-01T08:00:00Z',
}
const ACCOUNTS = [JEANNE, LISA, THOMAS]

function renderScreen(onBack = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}><AdminUsersScreen onBack={onBack} /></QueryClientProvider>,
  )
  return { onBack }
}

beforeEach(() => {
  vi.clearAllMocks()
  listAccounts.mockResolvedValue(ACCOUNTS)
  // clipboard pour le bouton « Copier »
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } })
})

describe('AdminUsersScreen — liste des comptes (US20.1)', () => {
  it('en-tête « Utilisateurs » et bouton « Retour »', async () => {
    const { onBack } = renderScreen()

    expect(screen.getByRole('heading', { name: 'Utilisateurs', level: 1 })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('pendant le chargement : « … » à la place de la liste', () => {
    listAccounts.mockReturnValue(new Promise(() => {}))
    renderScreen()

    expect(screen.getByRole('heading', { name: 'Comptes' })).toBeInTheDocument()
    expect(screen.getByText('…')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Comptes' })).not.toBeInTheDocument()
  })

  it('un compte par ligne, dans l’ordre reçu, avec rôle, statut et date de création (heure de Paris)', async () => {
    renderScreen()

    const list = await screen.findByRole('list', { name: 'Comptes' })

    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Jeanne')
    expect(rows[1]).toHaveTextContent('Lisa')
    expect(rows[2]).toHaveTextContent('Thomas')
    // Each piece of information sits in its own element.
    expect(within(rows[0]).getByText('jeanne@exemple.fr')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Parent')).toBeInTheDocument()
    expect(within(rows[0]).getByText("En attente d'activation")).toBeInTheDocument()
    expect(within(rows[0]).getByText('Créé le 08/11/2026')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Actif')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Créé le 06/11/2026')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Admin')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Actif')).toBeInTheDocument()
  })

  it('prénom absent : l’email tient lieu de nom', async () => {
    listAccounts.mockResolvedValue([{ ...LISA, firstName: null }])
    renderScreen()

    const row = within(await screen.findByRole('list', { name: 'Comptes' })).getByRole('listitem')

    expect(within(row).getAllByText('lisa@exemple.fr')).toHaveLength(2)
  })

  it('« Renvoyer le lien » seulement sur les comptes en attente', async () => {
    renderScreen()

    const rows = within(await screen.findByRole('list', { name: 'Comptes' })).getAllByRole('listitem')

    expect(within(rows[0]).getByRole('button', { name: 'Renvoyer le lien' })).toBeInTheDocument()
    expect(within(rows[1]).queryByRole('button', { name: 'Renvoyer le lien' })).not.toBeInTheDocument()
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument()
  })

  it('liste en échec : message à la place de la liste, « Retour » toujours disponible', async () => {
    listAccounts.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    const { onBack } = renderScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les comptes.')
    expect(screen.queryByRole('list', { name: 'Comptes' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retour' }))
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1))
  })
})
