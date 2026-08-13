import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BottleFeedingPanel from './BottleFeedingPanel'

vi.mock('../api', () => ({
  createBottleFeeding: vi.fn(),
  listBottleFeedings: vi.fn(),
  updateBottleFeeding: vi.fn(),
  // `useDeleteEvent` route vers les 4 clients : tous présents dans le mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
}))
import { listBottleFeedings, deleteBottleFeeding, updateBottleFeeding, createBottleFeeding } from '../api'

const ONE = { id: 'bf1', occurredAt: '2026-06-21T08:00:00.000Z', quantityMl: 120, milkType: 'breast' }

const PREFIX = { queryKey: ['babies', 'b1'] }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(
    <QueryClientProvider client={qc}><BottleFeedingPanel babyId="b1" /></QueryClientProvider>,
  ) }
}

describe('BottleFeedingPanel — suppression (Épic 7, D7-B/D7-C)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listBottleFeedings.mockResolvedValue({ items: [ONE], nextCursor: null })
  })

  it('confirme avant d’appeler l’API ; « Annuler » referme sans appel', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le biberon de 120 ml' }))
    expect(deleteBottleFeeding).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(deleteBottleFeeding).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Oui, supprimer' })).not.toBeInTheDocument()
  })

  it('« Oui, supprimer » appelle deleteBottleFeeding(babyId, id) et désactive le bouton', async () => {
    let resolve
    deleteBottleFeeding.mockImplementation(() => new Promise((r) => { resolve = r }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le biberon de 120 ml' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(deleteBottleFeeding.mock.calls[0]).toEqual(['b1', 'bf1'])
    await waitFor(() => expect(screen.getByRole('button', { name: '…' })).toBeDisabled())
    resolve(null)
  })

  it('404 = succès idempotent : notice de succès, aucune erreur (D7-C/R3)', async () => {
    deleteBottleFeeding.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le biberon de 120 ml' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Biberon supprimé.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('500 reste une erreur visible, pas avalée (R3)', async () => {
    deleteBottleFeeding.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le biberon de 120 ml' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Échec de la suppression.')
    expect(screen.queryByText('Biberon supprimé.')).not.toBeInTheDocument()
  })
})

describe('BottleFeedingPanel — édition (Épic 8, DA-1/DA-2/DA-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listBottleFeedings.mockResolvedValue({ items: [ONE], nextCursor: null })
  })

  it('le ✏️ ouvre un sheet pré-rempli ; soumettre appelle updateBottleFeeding(babyId, id, patch)', async () => {
    updateBottleFeeding.mockResolvedValue({ ...ONE, quantityMl: 200 })
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Modifier le biberon de 120 ml' }))

    // sheet ouvert : il existe désormais 2 formulaires (création + édition). On cible le dialog.
    const dialog = screen.getByRole('dialog')
    const qty = within(dialog).getByLabelText('Quantité (ml)')
    expect(qty).toHaveValue(120)

    await userEvent.clear(qty)
    await userEvent.type(qty, '200')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateBottleFeeding).toHaveBeenCalledTimes(1))
    expect(updateBottleFeeding.mock.calls[0][0]).toBe('b1')
    expect(updateBottleFeeding.mock.calls[0][1]).toBe('bf1')
    expect(updateBottleFeeding.mock.calls[0][2].quantityMl).toBe(200)

    // sheet fermé + notice de succès
    expect(await screen.findByRole('status')).toHaveTextContent('Biberon mis à jour.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('BottleFeedingPanel — invalidation par préfixe après création (US11.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listBottleFeedings.mockResolvedValue({ items: [ONE], nextCursor: null })
  })

  it('une création réussie invalide le préfixe [babies, b1] (récap calendrier), une seule fois (retry:0)', async () => {
    createBottleFeeding.mockResolvedValue({ id: 'bf2', occurredAt: '2026-06-21T09:00:00.000Z', quantityMl: 90, milkType: null })
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await screen.findByText('120 ml') // liste initiale chargée

    // Le premier formulaire (création, hors dialog) : on saisit une quantité puis on valide.
    await userEvent.type(screen.getByLabelText('Quantité (ml)'), '90')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createBottleFeeding).toHaveBeenCalledTimes(1))
    // L'invalidation vise le PRÉFIXE (pas la clé propre ['babies','b1','bottle-feedings']), une seule fois.
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(spy.mock.calls[0][0]).toEqual(PREFIX)
  })
})
