import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SharePanel from './SharePanel'

vi.mock('../api', () => ({
  listCaregivers: vi.fn(),
  createInvitation: vi.fn(),
  removeCaregiver: vi.fn(),
  promoteCaregiver: vi.fn(),
}))
import { listCaregivers, createInvitation, removeCaregiver, promoteCaregiver } from '../api'

const OWNER = { userId: 'me', firstName: 'Moi', email: 'me@test.local', isOwner: true }
const GUEST = { userId: 'g1', firstName: 'Mamie', email: 'mamie@test.local', isOwner: false }
const me = { id: 'me', firstName: 'Moi', email: 'me@test.local' }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><SharePanel babyId="b1" me={me} /></QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
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
    expect(screen.queryByRole('button', { name: "Générer un lien d'invitation" })).not.toBeInTheDocument()
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

describe('SharePanel — génération de lien (D8-B)', () => {
  it('génère et affiche le lien copiable', async () => {
    listCaregivers.mockResolvedValue([OWNER])
    createInvitation.mockResolvedValue({ token: 't', link: 'http://x/invite?token=t', expiresAt: '2026-06-28T00:00:00Z' })
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: "Générer un lien d'invitation" }))

    await waitFor(() => expect(createInvitation.mock.calls[0][0]).toBe('b1'))
    const input = await screen.findByLabelText("Lien d'invitation")
    expect(input).toHaveValue('http://x/invite?token=t')
    expect(screen.getByText(/valable 3 jours/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Copier' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/invite?token=t')
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument()
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
