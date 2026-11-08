import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InviteAcceptScreen from './InviteAcceptScreen'

vi.mock('../api', () => ({
  fetchMe: vi.fn(),
  logout: vi.fn(),
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
}))
import { fetchMe, logout, previewInvitation, acceptInvitation } from '../api'

const PASSWORD_LABEL = 'Mot de passe (12 caractères min.)'
const ACCEPT = { name: "Accepter l'invitation" }
const NEEDS_PASSWORD = {
  needsPassword: true, inviterFirstName: 'Thomas', babyFirstName: 'Léa',
  inviteeEmail: 'jeanne@exemple.fr', expiresAt: '2026-11-11T13:05:00Z',
}
const EXISTING_ACCOUNT = { ...NEEDS_PASSWORD, needsPassword: false, inviteeEmail: 'mamie@test.local' }
const MAMIE = { id: 'u1', firstName: 'Mamie', email: 'mamie@test.local' }

function renderScreen(token = 'tok-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><InviteAcceptScreen token={token} /></QueryClientProvider>,
  )
}

const rejected = (status) => Object.assign(new Error(`-> ${status}`), { status })

async function typePasswords(password, confirm = password) {
  await userEvent.type(await screen.findByLabelText(PASSWORD_LABEL), password)
  await userEvent.type(screen.getByLabelText('Confirmer'), confirm)
}

beforeEach(() => { vi.clearAllMocks() })

describe('InviteAcceptScreen — nouveau compte (US17.2)', () => {
  beforeEach(() => { previewInvitation.mockResolvedValue(NEEDS_PASSWORD) })

  it('affiche l’inviteur, le bébé et les champs mot de passe, sans interroger la session', async () => {
    renderScreen()

    expect(await screen.findByText(/vous invite à suivre/)).toHaveTextContent('Thomas vous invite à suivre Léa.')
    expect(screen.getByText(/jeanne@exemple\.fr/)).toBeInTheDocument()
    expect(screen.getByLabelText(PASSWORD_LABEL)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Confirmer')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', ACCEPT)).toBeInTheDocument()
    expect(previewInvitation.mock.calls[0][0]).toBe('tok-1')
    expect(fetchMe).not.toHaveBeenCalled()
  })

  it('12 caractères confirmés → acceptInvitation(token, mot de passe) puis écran de succès', async () => {
    acceptInvitation.mockResolvedValue(null)
    renderScreen()

    await typePasswords('motdepasse12')
    await userEvent.click(screen.getByRole('button', ACCEPT))

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(1))
    expect(acceptInvitation.mock.calls[0]).toEqual(['tok-1', 'motdepasse12'])
    expect(await screen.findByRole('heading', { name: /Invitation acceptée/ })).toBeInTheDocument()
    expect(screen.getByText('Votre compte est prêt. Vous pouvez maintenant vous connecter.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/')
  })

  it('11 caractères → message, aucun appel', async () => {
    renderScreen()

    await typePasswords('motdepasse1')
    await userEvent.click(screen.getByRole('button', ACCEPT))

    expect(await screen.findByRole('alert')).toHaveTextContent('Le mot de passe doit comporter au moins 12 caractères.')
    expect(acceptInvitation).not.toHaveBeenCalled()
  })

  it('confirmation différente → message, aucun appel', async () => {
    renderScreen()

    await typePasswords('motdepasse12', 'motdepasse13')
    await userEvent.click(screen.getByRole('button', ACCEPT))

    expect(await screen.findByRole('alert')).toHaveTextContent('Les deux mots de passe ne correspondent pas.')
    expect(acceptInvitation).not.toHaveBeenCalled()
  })

  it('anti-doublon : bouton désactivé pendant l’envoi, deux clics → un seul appel', async () => {
    let resolve
    acceptInvitation.mockReturnValue(new Promise((r) => { resolve = r }))
    renderScreen()

    await typePasswords('motdepasse12')
    // Reference kept before the click: while sending, the button label becomes « … ».
    const button = screen.getByRole('button', ACCEPT)
    await userEvent.click(button)
    await userEvent.click(button)

    expect(button).toBeDisabled()
    expect(acceptInvitation).toHaveBeenCalledTimes(1)
    resolve(null)
    await screen.findByRole('heading', { name: /Invitation acceptée/ })
  })
})

describe('InviteAcceptScreen — compte existant (US17.2, D8-E)', () => {
  beforeEach(() => { previewInvitation.mockResolvedValue(EXISTING_ACCOUNT) })

  it('connecté : pas de champ mot de passe, identité affichée, acceptation avec password null', async () => {
    fetchMe.mockResolvedValue(MAMIE)
    acceptInvitation.mockResolvedValue(null)
    renderScreen('tok-9')

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/connecté.e en tant que/i)
    expect(status).toHaveTextContent('Mamie')
    expect(screen.getByRole('button', { name: /Changer de compte/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(PASSWORD_LABEL)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', ACCEPT))

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledTimes(1))
    expect(acceptInvitation.mock.calls[0]).toEqual(['tok-9', null])
    expect(await screen.findByRole('heading', { name: /Invitation acceptée/ })).toBeInTheDocument()
    expect(screen.getByText('Le bébé apparaît désormais dans votre liste.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Accéder à l'accueil" })).toHaveAttribute('href', '/')
  })

  it('non connecté → invite à se connecter, pas de bouton Accepter', async () => {
    fetchMe.mockResolvedValue(null)
    renderScreen()

    expect(await screen.findByText("Connectez-vous d'abord pour accepter cette invitation.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', ACCEPT)).not.toBeInTheDocument()
  })

  it('« Changer de compte » déclenche logout', async () => {
    fetchMe.mockResolvedValue(MAMIE)
    logout.mockResolvedValue()
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: /Changer de compte/i }))

    await waitFor(() => expect(logout).toHaveBeenCalled())
  })

  it('anti-doublon : deux clics sur « Accepter » → un seul appel', async () => {
    fetchMe.mockResolvedValue(MAMIE)
    acceptInvitation.mockReturnValue(new Promise(() => {}))
    renderScreen()

    const button = await screen.findByRole('button', ACCEPT)
    await userEvent.click(button)
    await userEvent.click(button)

    expect(button).toBeDisabled()
    expect(acceptInvitation).toHaveBeenCalledTimes(1)
  })
})

describe('InviteAcceptScreen — erreurs (US17.2)', () => {
  it.each([
    [403, "Cette invitation est adressée à quelqu'un d'autre."],
    [401, 'Votre session a expiré : reconnectez-vous.'],
    [409, 'Vous avez déjà accès à ce bébé.'],
    [500, "Échec de l'acceptation. Réessayez."],
  ])('acceptation %i → message dédié, le bouton « Changer de compte » reste', async (status, message) => {
    previewInvitation.mockResolvedValue(EXISTING_ACCOUNT)
    fetchMe.mockResolvedValue(MAMIE)
    acceptInvitation.mockRejectedValue(rejected(status))
    renderScreen()

    await userEvent.click(await screen.findByRole('button', ACCEPT))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: /Changer de compte/i })).toBeInTheDocument()
  })

  it('400 sur le formulaire de mot de passe → « Mot de passe trop court (12 caractères minimum). »', async () => {
    previewInvitation.mockResolvedValue(NEEDS_PASSWORD)
    acceptInvitation.mockRejectedValue(rejected(400))
    renderScreen()

    await typePasswords('motdepasse12')
    await userEvent.click(screen.getByRole('button', ACCEPT))

    expect(await screen.findByRole('alert')).toHaveTextContent('Mot de passe trop court (12 caractères minimum).')
  })

  it('pré-vol 410 → lien expiré, ni champ mot de passe ni bouton Accepter', async () => {
    previewInvitation.mockRejectedValue(rejected(410))
    renderScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent(/expiré ou a déjà été utilisé/i)
    expect(screen.queryByLabelText(PASSWORD_LABEL)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', ACCEPT)).not.toBeInTheDocument()
  })

  it('acceptation 410 → bascule sur le même état « lien expiré »', async () => {
    previewInvitation.mockResolvedValue(NEEDS_PASSWORD)
    acceptInvitation.mockRejectedValue(rejected(410))
    renderScreen()

    await typePasswords('motdepasse12')
    await userEvent.click(screen.getByRole('button', ACCEPT))

    expect(await screen.findByRole('alert')).toHaveTextContent(/expiré ou a déjà été utilisé/i)
    expect(screen.queryByLabelText(PASSWORD_LABEL)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', ACCEPT)).not.toBeInTheDocument()
  })

  it('pré-vol en panne (hors 410) → message distinct d’un lien expiré', async () => {
    previewInvitation.mockRejectedValue(rejected(500))
    renderScreen()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Impossible de charger l'invitation. Réessayez plus tard.")
    expect(alert).not.toHaveTextContent(/expiré/i)
  })

  it('token manquant → message dédié, aucun pré-vol', () => {
    renderScreen(null)

    expect(screen.getByText(/jeton manquant/i)).toBeInTheDocument()
    expect(previewInvitation).not.toHaveBeenCalled()
  })
})
