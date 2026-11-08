import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SharePanel from './SharePanel'

vi.mock('../api', () => ({
  listCaregivers: vi.fn(),
  createInvitation: vi.fn(),
  listPendingInvitations: vi.fn(),
  revokeInvitation: vi.fn(),
  removeCaregiver: vi.fn(),
  promoteCaregiver: vi.fn(),
}))
import {
  listCaregivers, createInvitation, listPendingInvitations, removeCaregiver, promoteCaregiver,
} from '../api'

const OWNER = { userId: 'me', firstName: 'Moi', email: 'me@test.local', isOwner: true }
const GUEST = { userId: 'g1', firstName: 'Mamie', email: 'mamie@test.local', isOwner: false }
const me = { id: 'me', firstName: 'Moi', email: 'me@test.local' }

const FORM = { name: 'Inviter un proche' }
const SUBMIT = { name: "Envoyer l'invitation" }
const CREATED = {
  token: 't', link: 'http://x/invite?token=t', inviteeEmail: 'jeanne@exemple.fr',
  expiresAt: '2026-11-11T13:05:00Z', mailSent: true,
}

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><SharePanel babyId="b1" me={me} /></QueryClientProvider>,
  )
}

// Fills the invitation form of an owner's panel (fields emptied first); the submit is left to the caller.
async function fillInvitation(email, firstName) {
  await screen.findByRole('form', FORM)
  const emailField = screen.getByLabelText('Email du proche')
  const firstNameField = screen.getByLabelText('Prénom du proche')
  await userEvent.clear(emailField)
  await userEvent.clear(firstNameField)
  if (email) await userEvent.type(emailField, email)
  if (firstName) await userEvent.type(firstNameField, firstName)
}

async function submitInvitation(email, firstName) {
  await fillInvitation(email, firstName)
  await userEvent.click(screen.getByRole('button', SUBMIT))
}

beforeEach(() => {
  vi.clearAllMocks()
  // The pending-invitations list is only requested for an owner; empty unless a test fills it.
  listPendingInvitations.mockResolvedValue([])
  // clipboard pour le bouton « Copier »
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } })
})

describe('SharePanel — visibilité owner-only (D8-J)', () => {
  it('masque les actions owner pour un non-owner', async () => {
    listCaregivers.mockResolvedValue([
      { ...OWNER, userId: 'other', firstName: 'Autre' },
      { ...GUEST, userId: 'me', firstName: 'Moi', email: 'me@test.local' }, // le courant est non-owner
    ])
    renderPanel()
    expect(await screen.findByText('Moi')).toBeInTheDocument()
    expect(screen.queryByRole('form', FORM)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Promouvoir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument()
  })

  it('affiche le badge owner et marque « vous »', async () => {
    listCaregivers.mockResolvedValue([OWNER, GUEST])
    renderPanel()
    const badge = await screen.findByText('owner')
    expect(badge).toBeInTheDocument()
    expect(screen.getByText(/\(vous\)/)).toBeInTheDocument()

    // Garde-fou D16-G (Épic 16) : `.chip` est partagé avec la rangée de totaux du récap, devenue
    // interactive. Le badge « owner », lui, reste décoratif — ni bouton, ni état pressé.
    expect(badge.tagName).toBe('SPAN')
    expect(badge).not.toHaveAttribute('aria-pressed')
    expect(screen.queryByRole('button', { name: 'owner' })).not.toBeInTheDocument()
  })
})

describe("SharePanel — formulaire d'invitation (US17.1)", () => {
  it("l'owner voit le formulaire nominatif ; le bouton « Générer un lien » a disparu", async () => {
    listCaregivers.mockResolvedValue([OWNER])
    renderPanel()

    expect(await screen.findByRole('form', FORM)).toBeInTheDocument()
    expect(screen.getByLabelText('Email du proche')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Prénom du proche')).toBeInTheDocument()
    expect(screen.getByRole('button', SUBMIT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "Générer un lien d'invitation" })).not.toBeInTheDocument()
  })

  it('la soumission appelle createInvitation(babyId, { email, firstName })', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    createInvitation.mockResolvedValue(CREATED)
    renderPanel()

    await submitInvitation('jeanne@exemple.fr', 'Jeanne')

    await waitFor(() => expect(createInvitation).toHaveBeenCalledTimes(1))
    expect(createInvitation.mock.calls[0]).toEqual(['b1', { email: 'jeanne@exemple.fr', firstName: 'Jeanne' }])
  })

  it('anti-doublon : bouton désactivé pendant l’envoi, deux clics → un seul appel', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    let resolve
    createInvitation.mockReturnValue(new Promise((r) => { resolve = r }))
    renderPanel()

    await fillInvitation('jeanne@exemple.fr', 'Jeanne')
    // Reference kept before the click: while sending, the button label becomes « … ».
    const button = screen.getByRole('button', SUBMIT)
    await userEvent.click(button)
    await userEvent.click(button)

    expect(button).toBeDisabled()
    expect(createInvitation).toHaveBeenCalledTimes(1)
    resolve(CREATED)
    await screen.findByLabelText("Lien d'invitation")
  })

  it('succès : le lien reste affiché et copiable, les champs sont vidés', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    createInvitation.mockResolvedValue(CREATED)
    renderPanel()

    await submitInvitation('jeanne@exemple.fr', 'Jeanne')

    const input = await screen.findByLabelText("Lien d'invitation")
    expect(input).toHaveValue('http://x/invite?token=t')
    expect(input).toHaveAttribute('readonly')
    expect(screen.getByText(/valable 3 jours/i)).toHaveTextContent('jeanne@exemple.fr')
    expect(screen.getByLabelText('Email du proche')).toHaveValue('')
    expect(screen.getByLabelText('Prénom du proche')).toHaveValue('')

    await userEvent.click(screen.getByRole('button', { name: 'Copier' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/invite?token=t')
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument()
  })

  it('compte créé ou préexistant : le même message de succès (D17-G)', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    createInvitation
      .mockResolvedValueOnce({ ...CREATED, token: 'new', link: 'http://x/invite?token=new' })
      .mockResolvedValueOnce({ ...CREATED, token: 'old', link: 'http://x/invite?token=old' })
    renderPanel()

    await submitInvitation('jeanne@exemple.fr', 'Jeanne')
    const first = (await screen.findByRole('status')).textContent
    await submitInvitation('jeanne@exemple.fr', 'Papi')
    await waitFor(() => expect(screen.getByLabelText("Lien d'invitation")).toHaveValue('http://x/invite?token=old'))

    expect(screen.getByRole('status').textContent).toBe(first)
  })

  it('409 → « Cette personne fait déjà partie du cercle. »', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    createInvitation.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    renderPanel()

    await submitInvitation('jeanne@exemple.fr', 'Jeanne')

    expect(await screen.findByRole('alert')).toHaveTextContent('Cette personne fait déjà partie du cercle.')
    expect(screen.queryByLabelText("Lien d'invitation")).not.toBeInTheDocument()
  })

  it('400 → « Vérifiez l’email et le prénom. », autre erreur → message générique', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    createInvitation.mockRejectedValueOnce(Object.assign(new Error('-> 400'), { status: 400 }))
    renderPanel()

    await submitInvitation('jeanne@exemple.fr', 'Jeanne')
    expect(await screen.findByRole('alert')).toHaveTextContent("Vérifiez l'email et le prénom.")

    createInvitation.mockRejectedValueOnce(Object.assign(new Error('-> 500'), { status: 500 }))
    await submitInvitation('jeanne@exemple.fr', 'Jeanne')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Échec de l'invitation. Réessayez."))
  })

  it('champs vides ou blancs → message, aucun appel', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    renderPanel()

    await submitInvitation('', '')
    expect(await screen.findByRole('alert')).toHaveTextContent("Renseignez l'email et le prénom du proche.")

    await submitInvitation('jeanne@exemple.fr', '   ')

    expect(screen.getByRole('alert')).toHaveTextContent("Renseignez l'email et le prénom du proche.")
    expect(createInvitation).not.toHaveBeenCalled()
  })
})

describe('SharePanel — envoi du mail (US17.3)', () => {
  it('mailSent: true → « Invitation envoyée par email à {email}. », lien toujours affiché', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    createInvitation.mockResolvedValue(CREATED)
    renderPanel()

    await submitInvitation('jeanne@exemple.fr', 'Jeanne')

    expect(await screen.findByRole('status')).toHaveTextContent('Invitation envoyée par email à jeanne@exemple.fr.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText("Lien d'invitation")).toHaveValue('http://x/invite?token=t')
  })

  it('mailSent: false → avertissement, aucun message de succès, lien de secours affiché', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    createInvitation.mockResolvedValue({ ...CREATED, mailSent: false })
    renderPanel()

    await submitInvitation('jeanne@exemple.fr', 'Jeanne')

    expect(await screen.findByRole('alert'))
      .toHaveTextContent("L'email n'a pas pu être envoyé : transmettez le lien vous-même.")
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText("Lien d'invitation")).toHaveValue('http://x/invite?token=t')
  })
})

describe('SharePanel — promotion (D8-I)', () => {
  it('appelle promoteCaregiver(babyId, userId) et notifie', async () => {
    listCaregivers.mockResolvedValue([OWNER, GUEST])
    promoteCaregiver.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Promouvoir' }))
    await waitFor(() => expect(promoteCaregiver.mock.calls[0]).toEqual(['b1', 'g1']))
    expect(await screen.findByRole('status')).toHaveTextContent('Caregiver promu owner.')
  })
})

describe('SharePanel — déliaison (D8-L / D8-M)', () => {
  it('délie un caregiver après confirmation', async () => {
    listCaregivers.mockResolvedValue([OWNER, GUEST])
    removeCaregiver.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Retirer Mamie' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(removeCaregiver.mock.calls[0]).toEqual(['b1', 'g1']))
    expect(await screen.findByRole('status')).toHaveTextContent('Caregiver retiré.')
  })

  it('409 dernier owner → message dédié (pas une erreur générique)', async () => {
    listCaregivers.mockResolvedValue([OWNER, { ...OWNER, userId: 'co', firstName: 'Coparent' }])
    removeCaregiver.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Retirer Coparent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/dernier owner/i)
  })
})
