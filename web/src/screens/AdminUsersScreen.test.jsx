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
import { listAccounts, createAccount, resendActivationLink } from '../api'

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
  // clipboard stub for the « Copier » button
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

describe('AdminUsersScreen — création (US20.2)', () => {
  const CREATED = { userId: 'u9', activationLink: 'http://x/activate?token=abc', mailSent: true }
  const FORM = { name: 'Créer un compte' }
  const SUBMIT = { name: 'Créer' }

  // Fills the creation form (fields emptied first); the submit is left to the caller.
  async function fillAccount(email, firstName) {
    await screen.findByRole('form', FORM)
    const emailField = screen.getByLabelText('Email')
    const firstNameField = screen.getByLabelText('Prénom')
    await userEvent.clear(emailField)
    await userEvent.clear(firstNameField)
    if (email) await userEvent.type(emailField, email)
    if (firstName) await userEvent.type(firstNameField, firstName)
  }

  async function submitAccount(email, firstName) {
    await fillAccount(email, firstName)
    await userEvent.click(screen.getByRole('button', SUBMIT))
  }

  it('le formulaire n’a que l’email et le prénom : ni bébé ni rôle', async () => {
    renderScreen()

    expect(await screen.findByRole('form', FORM)).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Prénom')).toBeInTheDocument()
    expect(screen.queryByLabelText(/bébé/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/rôle/i)).not.toBeInTheDocument()
  })

  it('la soumission appelle createAccount({ email, firstName })', async () => {
    createAccount.mockResolvedValue(CREATED)
    renderScreen()

    await submitAccount('lisa@exemple.fr', 'Lisa')

    await waitFor(() => expect(createAccount).toHaveBeenCalledTimes(1))
    expect(createAccount.mock.calls[0][0]).toEqual({ email: 'lisa@exemple.fr', firstName: 'Lisa' })
  })

  it('mail envoyé → « Compte créé, email envoyé à {email} », lien copiable, champs vidés', async () => {
    createAccount.mockResolvedValue(CREATED)
    renderScreen()

    await submitAccount('lisa@exemple.fr', 'Lisa')

    const status = await screen.findByRole('status')
    expect(status.textContent.trim()).toBe('Compte créé, email envoyé à lisa@exemple.fr')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const input = screen.getByLabelText("Lien d'activation")
    expect(input).toHaveValue('http://x/activate?token=abc')
    expect(input).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Prénom')).toHaveValue('')

    await userEvent.click(screen.getByRole('button', { name: 'Copier' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/activate?token=abc')
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument()
  })

  it('la liste est rechargée après la création, le nouveau compte en tête', async () => {
    const NADIA = { ...LISA, id: 'u8', email: 'nadia@exemple.fr', firstName: 'Nadia', status: 'pending' }
    listAccounts.mockResolvedValueOnce([LISA]).mockResolvedValue([NADIA, LISA])
    createAccount.mockResolvedValue(CREATED)
    renderScreen()
    await screen.findByRole('list', { name: 'Comptes' })

    await submitAccount('nadia@exemple.fr', 'Nadia')

    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2))
    const rows = within(screen.getByRole('list', { name: 'Comptes' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Nadia')
  })

  it('mail non envoyé → avertissement, aucun message de succès, lien de secours affiché', async () => {
    createAccount.mockResolvedValue({ ...CREATED, mailSent: false })
    renderScreen()

    await submitAccount('lisa@exemple.fr', 'Lisa')

    expect(await screen.findByRole('alert'))
      .toHaveTextContent("L'email n'a pas pu être envoyé : transmettez le lien vous-même.")
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText("Lien d'activation")).toHaveValue('http://x/activate?token=abc')
  })

  it.each([
    [409, 'Un compte existe déjà avec cet email.'],
    [400, 'Saisissez un email valide et un prénom.'],
    [500, 'Échec de la création. Réessayez.'],
  ])('erreur %i → message dédié, aucun lien affiché', async (status, message) => {
    createAccount.mockRejectedValue(Object.assign(new Error(`-> ${status}`), { status }))
    renderScreen()

    await submitAccount('lisa@exemple.fr', 'Lisa')

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByLabelText("Lien d'activation")).not.toBeInTheDocument()
  })

  it('champs vides ou blancs → message, aucun appel', async () => {
    renderScreen()

    await submitAccount('', '')
    expect(await screen.findByRole('alert')).toHaveTextContent('Saisissez un email valide et un prénom.')

    await submitAccount('lisa@exemple.fr', '   ')
    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez un email valide et un prénom.')

    expect(createAccount).not.toHaveBeenCalled()
  })

  it('anti-doublon : bouton désactivé pendant l’envoi, deux clics → un seul appel', async () => {
    let resolve
    createAccount.mockReturnValue(new Promise((r) => { resolve = r }))
    renderScreen()

    await fillAccount('lisa@exemple.fr', 'Lisa')
    // Reference kept before the click: while sending, the button label becomes « … ».
    const button = screen.getByRole('button', SUBMIT)
    await userEvent.click(button)
    await userEvent.click(button)

    expect(button).toBeDisabled()
    expect(createAccount).toHaveBeenCalledTimes(1)
    resolve(CREATED)
    await screen.findByRole('status')
  })
})

describe('AdminUsersScreen — renvoi du lien (US20.3)', () => {
  const RESENT = { userId: 'u3', activationLink: 'http://x/activate?token=new', mailSent: true }
  const PAUL = { ...JEANNE, id: 'u4', email: 'paul@exemple.fr', firstName: 'Paul' }
  const RESEND = { name: 'Renvoyer le lien' }

  it('clic → resendActivationLink(id), « Lien renvoyé à {email} » et lien copiable', async () => {
    resendActivationLink.mockResolvedValue(RESENT)
    renderScreen()

    await userEvent.click(await screen.findByRole('button', RESEND))

    await waitFor(() => expect(resendActivationLink).toHaveBeenCalledTimes(1))
    expect(resendActivationLink.mock.calls[0][0]).toBe('u3')
    const status = await screen.findByRole('status')
    expect(status.textContent.trim()).toBe('Lien renvoyé à jeanne@exemple.fr')
    const input = screen.getByLabelText("Lien d'activation")
    expect(input).toHaveValue('http://x/activate?token=new')
    await userEvent.click(screen.getByRole('button', { name: 'Copier' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/activate?token=new')
  })

  it('la liste est rechargée après le renvoi', async () => {
    resendActivationLink.mockResolvedValue(RESENT)
    renderScreen()

    await userEvent.click(await screen.findByRole('button', RESEND))

    await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2))
  })

  it('mail non envoyé → avertissement, aucun message de succès, lien de secours affiché', async () => {
    resendActivationLink.mockResolvedValue({ ...RESENT, mailSent: false })
    renderScreen()

    await userEvent.click(await screen.findByRole('button', RESEND))

    expect(await screen.findByRole('alert'))
      .toHaveTextContent("L'email n'a pas pu être envoyé : transmettez le lien vous-même.")
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText("Lien d'activation")).toHaveValue('http://x/activate?token=new')
  })

  it.each([
    [409, 'Ce compte est déjà activé.'],
    [500, 'Échec du renvoi du lien. Réessayez.'],
  ])('erreur %i → message dédié', async (status, message) => {
    resendActivationLink.mockRejectedValue(Object.assign(new Error(`-> ${status}`), { status }))
    renderScreen()

    await userEvent.click(await screen.findByRole('button', RESEND))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByLabelText("Lien d'activation")).not.toBeInTheDocument()
  })

  it('anti-doublon : deux clics → un seul appel, et les boutons des autres lignes sont désactivés', async () => {
    listAccounts.mockResolvedValue([JEANNE, PAUL, LISA])
    let resolve
    resendActivationLink.mockReturnValue(new Promise((r) => { resolve = r }))
    renderScreen()

    // References kept before the click: the buttons can be re-rendered while the request is pending.
    const [jeanneButton, paulButton] = await screen.findAllByRole('button', RESEND)
    await userEvent.click(jeanneButton)
    await userEvent.click(jeanneButton)
    await userEvent.click(paulButton)

    expect(jeanneButton).toBeDisabled()
    expect(paulButton).toBeDisabled()
    expect(resendActivationLink).toHaveBeenCalledTimes(1)
    resolve(RESENT)
    await screen.findByRole('status')
  })
})
