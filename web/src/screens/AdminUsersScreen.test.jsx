import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminUsersScreen from './AdminUsersScreen'

vi.mock('../api', () => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  resendActivationLink: vi.fn(),
  getAccountDeletionImpact: vi.fn(),
  deleteAccount: vi.fn(),
}))
import {
  listAccounts, createAccount, resendActivationLink, getAccountDeletionImpact, deleteAccount,
} from '../api'

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

// --- Épic 24 : suppression d'un compte (US24.1) et révocation d'une invitation (US24.2) ---

describe("Épic 24 — suppression de comptes et révocation d'invitations", () => {
  // The accounts of the first epics plus the ones the removal scenarios talk about.
  beforeEach(() => {
    listAccounts.mockResolvedValue([NADIA, PAUL, MARC, JEANNE, LISA, THOMAS])
  })

  
  const NADIA = {
    id: 'u5', email: 'nadia@exemple.fr', firstName: 'Nadia', role: 'parent', status: 'active',
    createdAt: '2026-11-05T10:00:00Z',
  }
  const PAUL = {
    id: 'u6', email: 'paul@exemple.fr', firstName: 'Paul', role: 'parent', status: 'active',
    createdAt: '2026-11-04T10:00:00Z',
  }
  const MARC = {
    id: 'u7', email: 'marc@exemple.fr', firstName: 'Marc', role: 'parent', status: 'active',
    createdAt: '2026-11-03T10:00:00Z',
  }
  
  const impactOf = (account, over = {}) => ({
    userId: account.id, status: account.status, deletedBabyCount: 0, sharedBabyCount: 0, blockingBabyCount: 0,
    impactToken: 't1', ...over,
  })
  const serverError = (status) => Object.assign(new Error(`-> ${status}`), { status })
  
  // The row of the account whose first name is `firstName`; the same <li> is kept across list reloads.
  async function rowOf(firstName) {
    const list = await screen.findByRole('list', { name: 'Comptes' })
    return within(list).getAllByRole('listitem').find((li) => within(li).queryByText(firstName))
  }
  
  async function openRemoval(row, trigger) {
    await userEvent.click(within(row).getByRole('button', { name: trigger }))
  }
  
  describe('AdminUsersScreen — suppression (US24.1) — membre non-owner', () => {
    it('« Supprimer » → aperçu de l’impact, texte exact, confirmation, liste rechargée, la ligne disparaît', async () => {
      listAccounts.mockResolvedValueOnce([NADIA, LISA, THOMAS]).mockResolvedValue([LISA, THOMAS])
      getAccountDeletionImpact.mockResolvedValue(impactOf(NADIA, { sharedBabyCount: 1 }))
      deleteAccount.mockResolvedValue(null)
      renderScreen()
      const row = await rowOf('Nadia')
  
      await openRemoval(row, 'Supprimer')
  
      await waitFor(() => expect(getAccountDeletionImpact).toHaveBeenCalledTimes(1))
      expect(getAccountDeletionImpact.mock.calls[0][0]).toBe('u5')
      expect(await within(row).findByText(
        'Supprimer le compte de Nadia ? Ce compte sera retiré de 1 bébé partagé. Action définitive.',
      )).toBeInTheDocument()
      await userEvent.click(within(row).getByRole('button', { name: 'Oui, supprimer' }))
  
      await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1))
      expect(deleteAccount.mock.calls[0]).toEqual(['u5', { impactToken: 't1', isPendingOnly: false }])
      await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(screen.queryByText('Nadia')).not.toBeInTheDocument())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  
    it('pendant le chargement de l’impact : « … » et « Annuler » seulement', async () => {
      getAccountDeletionImpact.mockReturnValue(new Promise(() => {}))
      renderScreen()
      const row = await rowOf('Nadia')
  
      await openRemoval(row, 'Supprimer')
  
      const group = await within(row).findByRole('group')
      expect(group).toHaveTextContent('…')
      expect(within(group).getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
      expect(within(group).queryByRole('button', { name: 'Oui, supprimer' })).not.toBeInTheDocument()
    })
  })
  
  describe('AdminUsersScreen — suppression (US24.1) — bébé suivi par la seule personne supprimée', () => {
    it('« 1 bébé et tout son suivi seront supprimés ; ce compte sera retiré de 2 bébés partagés », sans prénom de bébé', async () => {
      listAccounts.mockResolvedValue([PAUL, LISA, THOMAS])
      getAccountDeletionImpact.mockResolvedValue(impactOf(PAUL, { deletedBabyCount: 1, sharedBabyCount: 2 }))
      renderScreen()
      const row = await rowOf('Paul')
  
      await openRemoval(row, 'Supprimer')
  
      expect(await within(row).findByText(
        'Supprimer le compte de Paul ? 1 bébé et tout son suivi seront supprimés ; ce compte sera retiré de 2 bébés partagés. Action définitive.',
      )).toBeInTheDocument()
      expect(within(row).getByRole('group')).not.toHaveTextContent('Tom')
    })
  
    it('plusieurs bébés supprimés : accord au pluriel', async () => {
      listAccounts.mockResolvedValue([PAUL, LISA, THOMAS])
      getAccountDeletionImpact.mockResolvedValue(impactOf(PAUL, { deletedBabyCount: 2 }))
      renderScreen()
      const row = await rowOf('Paul')
  
      await openRemoval(row, 'Supprimer')
  
      expect(await within(row).findByText(
        'Supprimer le compte de Paul ? 2 bébés et tout leur suivi seront supprimés. Action définitive.',
      )).toBeInTheDocument()
    })
  })
  
  describe('AdminUsersScreen — suppression (US24.1) — compte sans bébé', () => {
    it('la confirmation se limite à « Supprimer le compte de Nadia ? Action définitive. »', async () => {
      listAccounts.mockResolvedValue([NADIA, LISA, THOMAS])
      getAccountDeletionImpact.mockResolvedValue(impactOf(NADIA))
      renderScreen()
      const row = await rowOf('Nadia')
  
      await openRemoval(row, 'Supprimer')
  
      expect(await within(row).findByText('Supprimer le compte de Nadia ? Action définitive.')).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Oui, supprimer' })).toBeInTheDocument()
    })
  })
  
  describe('AdminUsersScreen — suppression (US24.1) — dernier owner d’un bébé suivi par d’autres', () => {
    it('texte de refus, « Annuler » seulement : aucun bouton « Oui, supprimer », aucun appel de suppression', async () => {
      listAccounts.mockResolvedValue([NADIA, LISA, THOMAS])
      getAccountDeletionImpact.mockResolvedValue(impactOf(LISA, { blockingBabyCount: 1 }))
      renderScreen()
      const row = await rowOf('Lisa')
  
      await openRemoval(row, 'Supprimer')
  
      expect(await within(row).findByText(
        "Lisa est le dernier owner de 1 bébé suivi par d'autres : il faut d'abord désigner un autre owner depuis le Partage de ce bébé, ou le supprimer.",
      )).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'Oui, supprimer' })).not.toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
      expect(deleteAccount).not.toHaveBeenCalled()
    })
  })
  
  describe('AdminUsersScreen — suppression (US24.1) — impact changé (D24-R)', () => {
    it('409 : notice, nouveau texte, et la confirmation suivante envoie la nouvelle empreinte', async () => {
      listAccounts.mockResolvedValue([MARC, LISA, THOMAS])
      getAccountDeletionImpact
        .mockResolvedValueOnce(impactOf(MARC, { sharedBabyCount: 1, impactToken: 't1' }))
        .mockResolvedValue(impactOf(MARC, { deletedBabyCount: 1, impactToken: 't2' }))
      deleteAccount.mockRejectedValueOnce(serverError(409)).mockResolvedValue(null)
      renderScreen()
      const row = await rowOf('Marc')
      await openRemoval(row, 'Supprimer')
      await within(row).findByText(
        'Supprimer le compte de Marc ? Ce compte sera retiré de 1 bébé partagé. Action définitive.',
      )
  
      await userEvent.click(within(row).getByRole('button', { name: 'Oui, supprimer' }))
  
      expect(await within(row).findByText(
        'Supprimer le compte de Marc ? 1 bébé et tout son suivi seront supprimés. Action définitive.',
      )).toBeInTheDocument()
      expect(within(row).getByRole('status')).toHaveTextContent("L'impact a changé : vérifiez avant de confirmer.")
      expect(deleteAccount).toHaveBeenCalledTimes(1)
  
      await waitFor(() => expect(within(row).getByRole('button', { name: 'Oui, supprimer' })).toBeEnabled())
      await userEvent.click(within(row).getByRole('button', { name: 'Oui, supprimer' }))
  
      await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(2))
      expect(deleteAccount.mock.calls[0][1].impactToken).toBe('t1')
      expect(deleteAccount.mock.calls[1][1].impactToken).toBe('t2')
    })
  
    it('409 dû à un nouveau dernier owner : le texte de refus remplace la confirmation', async () => {
      listAccounts.mockResolvedValue([MARC, LISA, THOMAS])
      getAccountDeletionImpact
        .mockResolvedValueOnce(impactOf(MARC, { sharedBabyCount: 1 }))
        .mockResolvedValue(impactOf(MARC, { blockingBabyCount: 1, impactToken: 't2' }))
      deleteAccount.mockRejectedValue(serverError(409))
      renderScreen()
      const row = await rowOf('Marc')
      await openRemoval(row, 'Supprimer')
      await userEvent.click(await within(row).findByRole('button', { name: 'Oui, supprimer' }))
  
      expect(await within(row).findByText(/est le dernier owner de 1 bébé suivi par d'autres/)).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'Oui, supprimer' })).not.toBeInTheDocument()
    })
  })
  
  describe('AdminUsersScreen — suppression (US24.1) — confirmation et annulation', () => {
    it('« Annuler » referme sans rien supprimer : la ligne et « Supprimer » restent', async () => {
      getAccountDeletionImpact.mockResolvedValue(impactOf(NADIA, { sharedBabyCount: 1 }))
      renderScreen()
      const row = await rowOf('Nadia')
      await openRemoval(row, 'Supprimer')
      await within(row).findByText(/Supprimer le compte de Nadia \?/)
  
      await userEvent.click(within(row).getByRole('button', { name: 'Annuler' }))
  
      expect(within(row).queryByText(/Supprimer le compte de Nadia/)).not.toBeInTheDocument()
      expect(within(row).queryByRole('group')).not.toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
      expect(screen.getByText('Nadia')).toBeInTheDocument()
      expect(deleteAccount).not.toHaveBeenCalled()
    })
  })
  
  describe('AdminUsersScreen — suppression (US24.1) — anti-doublon et idempotence', () => {
    it('deux touchers sur « Oui, supprimer » → un seul appel, bouton désactivé pendant l’appel', async () => {
      getAccountDeletionImpact.mockResolvedValue(impactOf(NADIA))
      let resolve
      deleteAccount.mockReturnValue(new Promise((r) => { resolve = r }))
      renderScreen()
      const row = await rowOf('Nadia')
      await openRemoval(row, 'Supprimer')
      // Reference kept before the click: while deleting, the button label becomes « … ».
      const confirm = await within(row).findByRole('button', { name: 'Oui, supprimer' })
  
      await userEvent.click(confirm)
      await userEvent.click(confirm)
  
      expect(confirm).toBeDisabled()
      expect(deleteAccount).toHaveBeenCalledTimes(1)
      resolve(null)
      await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2))
    })
  
    it('suppression en 404 (déjà supprimé ailleurs) : la ligne disparaît sans message d’erreur', async () => {
      listAccounts.mockResolvedValueOnce([NADIA, LISA, THOMAS]).mockResolvedValue([LISA, THOMAS])
      getAccountDeletionImpact.mockResolvedValue(impactOf(NADIA))
      deleteAccount.mockRejectedValue(serverError(404))
      renderScreen()
      const row = await rowOf('Nadia')
      await openRemoval(row, 'Supprimer')
  
      await userEvent.click(await within(row).findByRole('button', { name: 'Oui, supprimer' }))
  
      await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(screen.queryByText('Nadia')).not.toBeInTheDocument())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  
    it('aperçu en 404 (compte déjà supprimé) : liste rechargée, la ligne disparaît sans message d’erreur', async () => {
      listAccounts.mockResolvedValueOnce([NADIA, LISA, THOMAS]).mockResolvedValue([LISA, THOMAS])
      getAccountDeletionImpact.mockRejectedValue(serverError(404))
      renderScreen()
      const row = await rowOf('Nadia')
  
      await openRemoval(row, 'Supprimer')
  
      await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(screen.queryByText('Nadia')).not.toBeInTheDocument())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(deleteAccount).not.toHaveBeenCalled()
    })
  })
  
  describe('AdminUsersScreen — suppression (US24.1) — échec', () => {
    it('erreur serveur à la suppression : « Échec de la suppression. Réessayez. », la ligne et la confirmation restent', async () => {
      getAccountDeletionImpact.mockResolvedValue(impactOf(NADIA))
      deleteAccount.mockRejectedValue(serverError(500))
      renderScreen()
      const row = await rowOf('Nadia')
      await openRemoval(row, 'Supprimer')
  
      await userEvent.click(await within(row).findByRole('button', { name: 'Oui, supprimer' }))
  
      expect(await within(row).findByRole('alert')).toHaveTextContent('Échec de la suppression. Réessayez.')
      await waitFor(() => expect(within(row).getByRole('button', { name: 'Oui, supprimer' })).toBeEnabled())
      expect(screen.getByText('Nadia')).toBeInTheDocument()
    })
  
    it('aperçu en erreur serveur : même message, aucun bouton de confirmation, « Annuler » reste', async () => {
      getAccountDeletionImpact.mockRejectedValue(serverError(500))
      renderScreen()
      const row = await rowOf('Nadia')
  
      await openRemoval(row, 'Supprimer')
  
      expect(await within(row).findByRole('alert')).toHaveTextContent('Échec de la suppression. Réessayez.')
      expect(within(row).queryByRole('button', { name: 'Oui, supprimer' })).not.toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
      expect(deleteAccount).not.toHaveBeenCalled()
    })

    it('aperçu relu en erreur serveur après une lecture réussie : ni l’ancien texte ni « Oui, supprimer »', async () => {
      getAccountDeletionImpact
        .mockResolvedValueOnce(impactOf(NADIA, { sharedBabyCount: 1 }))
        .mockRejectedValue(serverError(500))
      renderScreen()
      const row = await rowOf('Nadia')
      await openRemoval(row, 'Supprimer')
      const oldText = 'Supprimer le compte de Nadia ? Ce compte sera retiré de 1 bébé partagé. Action définitive.'
      await within(row).findByText(oldText)
      await userEvent.click(within(row).getByRole('button', { name: 'Annuler' }))

      await openRemoval(row, 'Supprimer')

      expect(await within(row).findByRole('alert')).toHaveTextContent('Échec de la suppression. Réessayez.')
      expect(within(row).queryByText(oldText)).not.toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'Oui, supprimer' })).not.toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
      expect(deleteAccount).not.toHaveBeenCalled()
    })
  })
  
  describe('AdminUsersScreen — suppression (US24.1) — l’admin ne peut pas se supprimer', () => {
    it('ligne d’un compte admin : aucun bouton, aucun appel d’aperçu', async () => {
      renderScreen()
  
      const row = await rowOf('Thomas')
  
      expect(within(row).queryByRole('button')).not.toBeInTheDocument()
      expect(getAccountDeletionImpact).not.toHaveBeenCalled()
    })
  })
  
  describe('AdminUsersScreen — révocation (US24.2)', () => {
    const JEANNE_TEXT = "Révoquer l'invitation de jeanne@exemple.fr ? Son compte, jamais activé, sera supprimé et son lien ne fonctionnera plus."
    const pendingImpact = (over = {}) => impactOf(JEANNE, over)
  
    it('« Révoquer l’invitation » → texte exact, « Oui, révoquer » → isPendingOnly: true, la ligne disparaît', async () => {
      listAccounts.mockResolvedValueOnce(ACCOUNTS).mockResolvedValue([LISA, THOMAS])
      getAccountDeletionImpact.mockResolvedValue(pendingImpact())
      deleteAccount.mockResolvedValue(null)
      renderScreen()
      const row = await rowOf('Jeanne')
  
      await openRemoval(row, "Révoquer l'invitation")
  
      await waitFor(() => expect(getAccountDeletionImpact).toHaveBeenCalledTimes(1))
      expect(getAccountDeletionImpact.mock.calls[0][0]).toBe('u3')
      expect(await within(row).findByText(JEANNE_TEXT)).toBeInTheDocument()
      await userEvent.click(within(row).getByRole('button', { name: 'Oui, révoquer' }))
  
      await waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1))
      expect(deleteAccount.mock.calls[0]).toEqual(['u3', { impactToken: 't1', isPendingOnly: true }])
      await waitFor(() => expect(screen.queryByText('Jeanne')).not.toBeInTheDocument())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  
    it('seules les lignes en attente proposent la révocation, et elles ne proposent pas « Supprimer »', async () => {
      renderScreen()
  
      const jeanne = await rowOf('Jeanne')
      const lisa = await rowOf('Lisa')
      const thomas = await rowOf('Thomas')
  
      expect(within(jeanne).getByRole('button', { name: "Révoquer l'invitation" })).toBeInTheDocument()
      expect(within(jeanne).getByRole('button', { name: 'Renvoyer le lien' })).toBeInTheDocument()
      expect(within(jeanne).queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()
      expect(within(lisa).getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
      expect(within(lisa).queryByRole('button', { name: "Révoquer l'invitation" })).not.toBeInTheDocument()
      expect(within(thomas).queryByRole('button')).not.toBeInTheDocument()
    })
  
    it('le message ne ment pas : ni bébé, ni suivi, ni « Action définitive » pour un compte qui n’en suit pas', async () => {
      getAccountDeletionImpact.mockResolvedValue(pendingImpact())
      renderScreen()
      const row = await rowOf('Jeanne')
  
      await openRemoval(row, "Révoquer l'invitation")
  
      const group = await within(row).findByRole('group')
      await within(group).findByText(JEANNE_TEXT)
      expect(group).not.toHaveTextContent(/bébé|suivi|Action définitive/)
    })
  
    it('compte en attente rattaché à un bébé solo : les nombres de la suppression s’ajoutent', async () => {
      getAccountDeletionImpact.mockResolvedValue(pendingImpact({ deletedBabyCount: 1 }))
      renderScreen()
      const row = await rowOf('Jeanne')
  
      await openRemoval(row, "Révoquer l'invitation")
  
      expect(await within(row).findByText(`${JEANNE_TEXT} 1 bébé et tout son suivi seront supprimés.`))
        .toBeInTheDocument()
    })
  
    it('compte en attente dernier owner d’un bébé suivi par d’autres : refus, sans « Oui, révoquer »', async () => {
      getAccountDeletionImpact.mockResolvedValue(pendingImpact({ blockingBabyCount: 1 }))
      renderScreen()
      const row = await rowOf('Jeanne')
  
      await openRemoval(row, "Révoquer l'invitation")
  
      expect(await within(row).findByText(/Jeanne est le dernier owner de 1 bébé suivi par d'autres/)).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'Oui, révoquer' })).not.toBeInTheDocument()
      expect(within(row).getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
    })
  
    it('la personne active son compte entre-temps : refus « Ce compte vient d’être activé. », ligne « Actif » avec « Supprimer »', async () => {
      const jeanneActive = { ...JEANNE, status: 'active' }
      listAccounts.mockResolvedValueOnce(ACCOUNTS).mockResolvedValue([jeanneActive, LISA, THOMAS])
      getAccountDeletionImpact
        .mockResolvedValueOnce(pendingImpact({ status: 'pending' }))
        .mockResolvedValue(pendingImpact({ status: 'active' }))
      deleteAccount.mockRejectedValue(serverError(409))
      renderScreen()
      const row = await rowOf('Jeanne')
      await openRemoval(row, "Révoquer l'invitation")
  
      await userEvent.click(await within(row).findByRole('button', { name: 'Oui, révoquer' }))
  
      expect(await within(row).findByRole('alert')).toHaveTextContent("Ce compte vient d'être activé.")
      await waitFor(() => expect(within(row).getByText('Actif')).toBeInTheDocument())
      expect(within(row).getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: "Révoquer l'invitation" })).not.toBeInTheDocument()
      expect(within(row).queryByRole('group')).not.toBeInTheDocument()
      expect(within(row).getByRole('alert')).toHaveTextContent("Ce compte vient d'être activé.")
    })

    it('activé entre-temps puis « Supprimer » : confirmation neuve, aperçu relu, sans notice d’impact changé', async () => {
      const jeanneActive = { ...JEANNE, status: 'active' }
      listAccounts.mockResolvedValueOnce(ACCOUNTS).mockResolvedValue([jeanneActive, LISA, THOMAS])
      getAccountDeletionImpact
        .mockResolvedValueOnce(pendingImpact({ status: 'pending' }))
        .mockResolvedValue(pendingImpact({ status: 'active' }))
      deleteAccount.mockRejectedValue(serverError(409))
      renderScreen()
      const row = await rowOf('Jeanne')
      await openRemoval(row, "Révoquer l'invitation")
      await userEvent.click(await within(row).findByRole('button', { name: 'Oui, révoquer' }))
      await waitFor(() => expect(within(row).getByText('Actif')).toBeInTheDocument())
      const readsBeforeReopening = getAccountDeletionImpact.mock.calls.length

      await openRemoval(row, 'Supprimer')

      expect(await within(row).findByText('Supprimer le compte de Jeanne ? Action définitive.')).toBeInTheDocument()
      expect(within(row).queryByRole('status')).not.toBeInTheDocument()
      expect(within(row).queryByRole('alert')).not.toBeInTheDocument()
      await waitFor(() => expect(getAccountDeletionImpact).toHaveBeenCalledTimes(readsBeforeReopening + 1))
      await waitFor(() => expect(within(row).getByRole('button', { name: 'Oui, supprimer' })).toBeEnabled())
    })
  
    it('« Annuler » referme sans appel de révocation', async () => {
      getAccountDeletionImpact.mockResolvedValue(pendingImpact())
      renderScreen()
      const row = await rowOf('Jeanne')
      await openRemoval(row, "Révoquer l'invitation")
      await within(row).findByText(JEANNE_TEXT)
  
      await userEvent.click(within(row).getByRole('button', { name: 'Annuler' }))
  
      expect(within(row).queryByText(JEANNE_TEXT)).not.toBeInTheDocument()
      expect(within(row).getByRole('button', { name: "Révoquer l'invitation" })).toBeInTheDocument()
      expect(deleteAccount).not.toHaveBeenCalled()
    })
  
    it('deux touchers sur « Oui, révoquer » → un seul appel', async () => {
      getAccountDeletionImpact.mockResolvedValue(pendingImpact())
      let resolve
      deleteAccount.mockReturnValue(new Promise((r) => { resolve = r }))
      renderScreen()
      const row = await rowOf('Jeanne')
      await openRemoval(row, "Révoquer l'invitation")
      // Reference kept before the click: while revoking, the button label becomes « … ».
      const confirm = await within(row).findByRole('button', { name: 'Oui, révoquer' })
  
      await userEvent.click(confirm)
      await userEvent.click(confirm)
  
      expect(confirm).toBeDisabled()
      expect(deleteAccount).toHaveBeenCalledTimes(1)
      resolve(null)
      await waitFor(() => expect(listAccounts).toHaveBeenCalledTimes(2))
    })
  
    it('révocation en 404 (déjà révoquée ailleurs) : la ligne disparaît sans message d’erreur', async () => {
      listAccounts.mockResolvedValueOnce(ACCOUNTS).mockResolvedValue([LISA, THOMAS])
      getAccountDeletionImpact.mockResolvedValue(pendingImpact())
      deleteAccount.mockRejectedValue(serverError(404))
      renderScreen()
      const row = await rowOf('Jeanne')
      await openRemoval(row, "Révoquer l'invitation")
  
      await userEvent.click(await within(row).findByRole('button', { name: 'Oui, révoquer' }))
  
      await waitFor(() => expect(screen.queryByText('Jeanne')).not.toBeInTheDocument())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  
    it('erreur serveur à la révocation : « Échec de la révocation. Réessayez. », la ligne reste', async () => {
      getAccountDeletionImpact.mockResolvedValue(pendingImpact())
      deleteAccount.mockRejectedValue(serverError(500))
      renderScreen()
      const row = await rowOf('Jeanne')
      await openRemoval(row, "Révoquer l'invitation")
  
      await userEvent.click(await within(row).findByRole('button', { name: 'Oui, révoquer' }))
  
      expect(await within(row).findByRole('alert')).toHaveTextContent('Échec de la révocation. Réessayez.')
      await waitFor(() => expect(within(row).getByRole('button', { name: 'Oui, révoquer' })).toBeEnabled())
      expect(screen.getByText('Jeanne')).toBeInTheDocument()
    })
  })
})
