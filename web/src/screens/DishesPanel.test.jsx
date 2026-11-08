import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DishesPanel from './DishesPanel'

vi.mock('../api', () => ({
  listManageableDishes: vi.fn(),
  renameDish: vi.fn(),
  deleteDish: vi.fn(),
}))
import { listManageableDishes, renameDish, deleteDish } from '../api'

const DISHES = [
  { id: 'd1', label: 'Purée de carrotes' },
  { id: 'd2', label: 'Yaourt nature' },
]

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(<QueryClientProvider client={qc}><DishesPanel /></QueryClientProvider>) }
}

beforeEach(() => {
  vi.clearAllMocks()
  listManageableDishes.mockResolvedValue(DISHES)
  renameDish.mockResolvedValue({ id: 'd1', label: 'Purée de carottes' })
  deleteDish.mockResolvedValue(null)
})

describe('DishesPanel — l’écran liste mes plats (US18.5)', () => {
  it('une liste « Mes plats » avec un élément par plat, dans l’ordre reçu, libellé en texte', async () => {
    renderPanel()

    const list = await screen.findByRole('list', { name: 'Mes plats' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Purée de carrotes')
    expect(items[1]).toHaveTextContent('Yaourt nature')
  })

  it('un libellé est rendu comme du texte, jamais interprété', async () => {
    listManageableDishes.mockResolvedValue([{ id: 'x', label: '<b>gras</b>' }])
    renderPanel()

    expect(await screen.findByText('<b>gras</b>')).toBeInTheDocument()
  })

  it('aucun plat → « Vous n’avez encore ajouté aucun plat. »', async () => {
    listManageableDishes.mockResolvedValue([])
    renderPanel()

    expect(await screen.findByText('Vous n\'avez encore ajouté aucun plat.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Mes plats' })).toBeNull()
  })
})

describe('DishesPanel — renommer (US18.5, D18-AD)', () => {
  it('« Renommer » ouvre « Nouveau nom » prérempli ; Enregistrer → renameDish(id, libellé), « Plat renommé. »', async () => {
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer Purée de carrotes' }))

    const field = screen.getByLabelText('Nouveau nom')
    expect(field).toHaveValue('Purée de carrotes')
    await userEvent.clear(field)
    await userEvent.type(field, 'Purée de carottes')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(renameDish).toHaveBeenCalledTimes(1))
    expect(renameDish.mock.calls[0]).toEqual(['d1', 'Purée de carottes'])
    expect(await screen.findByRole('status')).toHaveTextContent('Plat renommé.')
    await waitFor(() => expect(spy.mock.calls.map((c) => c[0])).toContainEqual({ queryKey: ['dishes'] }))
  })

  it('le libellé est envoyé mis en forme (bords retirés, blancs réduits)', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer Yaourt nature' }))

    fireEvent.change(screen.getByLabelText('Nouveau nom'), { target: { value: '  Yaourt   vanille ' } })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(renameDish).toHaveBeenCalledTimes(1))
    expect(renameDish.mock.calls[0]).toEqual(['d2', 'Yaourt vanille'])
  })

  it('nom vide → « Indiquez le plat. », renameDish non appelé', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer Purée de carrotes' }))

    await userEvent.clear(screen.getByLabelText('Nouveau nom'))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('Indiquez le plat.')).toBeInTheDocument()
    expect(renameDish).not.toHaveBeenCalled()
  })

  it('nom de 61 caractères → « Le plat ne doit pas dépasser 60 caractères. », renameDish non appelé', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer Purée de carrotes' }))

    fireEvent.change(screen.getByLabelText('Nouveau nom'), { target: { value: 'x'.repeat(61) } })
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('Le plat ne doit pas dépasser 60 caractères.')).toBeInTheDocument()
    expect(renameDish).not.toHaveBeenCalled()
  })

  it('409 (le libellé existe déjà) → « Ce plat existe déjà. »', async () => {
    renameDish.mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer Purée de carrotes' }))

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Ce plat existe déjà.')).toBeInTheDocument()
    expect(screen.queryByText('Plat renommé.')).not.toBeInTheDocument()
  })

  it('autre erreur → « Échec de l’enregistrement. »', async () => {
    renameDish.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer Purée de carrotes' }))

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Échec de l\'enregistrement.')).toBeInTheDocument()
  })

  it('« Annuler » referme le renommage sans appel', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer Purée de carrotes' }))

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByLabelText('Nouveau nom')).toBeNull()
    expect(renameDish).not.toHaveBeenCalled()
  })

  it('désactive Enregistrer pendant l’envoi : deux clics, un seul appel (anti double-tap)', async () => {
    let resolve
    renameDish.mockImplementation(() => new Promise((r) => { resolve = r }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Renommer Purée de carrotes' }))

    const save = screen.getByRole('button', { name: 'Enregistrer' })
    await userEvent.click(save)
    expect(save).toBeDisabled()
    await userEvent.click(save)

    expect(renameDish).toHaveBeenCalledTimes(1)
    resolve({ id: 'd1', label: 'Purée de carrotes' })
  })
})

describe('DishesPanel — supprimer (US18.5, D18-X)', () => {
  it('la corbeille demande confirmation ; « Oui, supprimer » → deleteDish(id), « Plat supprimé. »', async () => {
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer Purée de carrotes' }))
    expect(screen.getByText('Supprimer ce plat ?')).toBeInTheDocument()
    expect(deleteDish).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteDish).toHaveBeenCalledTimes(1))
    expect(deleteDish.mock.calls[0]).toEqual(['d1'])
    expect(await screen.findByRole('status')).toHaveTextContent('Plat supprimé.')
    await waitFor(() => expect(spy.mock.calls.map((c) => c[0])).toContainEqual({ queryKey: ['dishes'] }))
  })

  it('« Annuler » referme la confirmation sans supprimer', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer Purée de carrotes' }))

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(deleteDish).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Oui, supprimer' })).toBeNull()
  })

  it('un 404 (déjà supprimé ailleurs) est un succès idempotent : « Plat supprimé. », aucune erreur', async () => {
    deleteDish.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer Purée de carrotes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Plat supprimé.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un 500 reste une erreur visible', async () => {
    deleteDish.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer Purée de carrotes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Échec de la suppression.')
    expect(screen.queryByText('Plat supprimé.')).not.toBeInTheDocument()
  })
})
