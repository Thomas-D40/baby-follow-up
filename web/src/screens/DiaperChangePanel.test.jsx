import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DiaperChangePanel from './DiaperChangePanel'

vi.mock('../api', () => ({
  createDiaperChange: vi.fn(),
  listStools: vi.fn(),
  listUrines: vi.fn(),
  updateStool: vi.fn(),
  updateUrine: vi.fn(),
  // `useDeleteEvent` route vers les 6 clients de suppression : tous présents dans le mock.
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteTemperature: vi.fn(),
  deleteMedicalCare: vi.fn(),
}))
import {
  listStools,
  listUrines,
  createDiaperChange,
  updateStool,
  updateUrine,
  deleteStool,
  deleteUrine,
} from '../api'

// Selle (08:00) & urine (10:00) : après fusion + tri DESC, l'urine doit précéder la selle.
const STOOL = { id: 's1', occurredAt: '2026-06-21T08:00:00.000Z', consistency: 'soft' }
const URINE = { id: 'u1', occurredAt: '2026-06-21T10:00:00.000Z' }

const PREFIX = { queryKey: ['babies', 'b1'] }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(
    <QueryClientProvider client={qc}><DiaperChangePanel babyId="b1" /></QueryClientProvider>,
  ) }
}

describe('DiaperChangePanel — liste fusionnée (US13.2, D13-G)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStools.mockResolvedValue({ items: [STOOL], nextCursor: null })
    listUrines.mockResolvedValue({ items: [URINE], nextCursor: null })
  })

  it('fusionne selles + urines, triées par occurredAt DESC, avec libellés & consistance', async () => {
    renderPanel()

    // Attend le chargement des deux listes.
    await screen.findByRole('button', { name: /Supprimer l'urine/ })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    // Urine (10:00) avant selle (08:00) : tri DESC.
    expect(rows[0]).toHaveTextContent('💧 Urine')
    expect(rows[1]).toHaveTextContent('💩 Selle')
    expect(rows[1]).toHaveTextContent('Molle') // CONSISTENCY_LABEL.soft
  })
})

describe('DiaperChangePanel — édition par type (D13-G)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStools.mockResolvedValue({ items: [STOOL], nextCursor: null })
    listUrines.mockResolvedValue({ items: [URINE], nextCursor: null })
  })

  it('✏️ sur une selle ouvre StoolForm (consistance pré-remplie) → updateStool', async () => {
    updateStool.mockResolvedValue({ ...STOOL, consistency: 'liquid' })
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier la selle/ }))

    const dialog = screen.getByRole('dialog')
    // StoolForm : présence d'un select « Consistance » pré-rempli sur 'soft'.
    const consistency = within(dialog).getByLabelText('Consistance')
    expect(consistency).toHaveValue('soft')

    await userEvent.selectOptions(consistency, 'liquid')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateStool).toHaveBeenCalledTimes(1))
    expect(updateStool.mock.calls[0][0]).toBe('b1')
    expect(updateStool.mock.calls[0][1]).toBe('s1')
    expect(updateStool.mock.calls[0][2].consistency).toBe('liquid')
    expect(updateUrine).not.toHaveBeenCalled()
  })

  it('✏️ sur une urine ouvre UrineForm (heure seule, pas de consistance) → updateUrine', async () => {
    updateUrine.mockResolvedValue({ ...URINE })
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier l'urine/ }))

    const dialog = screen.getByRole('dialog')
    // UrineForm : heure seule, aucun champ consistance.
    expect(within(dialog).getByLabelText('Quand')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Consistance')).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateUrine).toHaveBeenCalledTimes(1))
    expect(updateUrine.mock.calls[0][0]).toBe('b1')
    expect(updateUrine.mock.calls[0][1]).toBe('u1')
    expect(updateStool).not.toHaveBeenCalled()
  })
})

describe('DiaperChangePanel — suppression via useDeleteEvent (Épic 7, D7-B/D7-C)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStools.mockResolvedValue({ items: [STOOL], nextCursor: null })
    listUrines.mockResolvedValue({ items: [URINE], nextCursor: null })
  })

  it('confirme avant suppression puis route la selle vers deleteStool(babyId, id)', async () => {
    deleteStool.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la selle/ }))
    expect(deleteStool).not.toHaveBeenCalled() // confirmation d'abord

    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))
    await waitFor(() => expect(deleteStool).toHaveBeenCalled())
    // useDeleteEvent({ type: 'stool', id }) → deleteStool(babyId, id).
    expect(deleteStool.mock.calls[0]).toEqual(['b1', 's1'])
    expect(deleteUrine).not.toHaveBeenCalled()
  })

  it('route l’urine vers deleteUrine(babyId, id)', async () => {
    deleteUrine.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer l'urine/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteUrine).toHaveBeenCalled())
    expect(deleteUrine.mock.calls[0]).toEqual(['b1', 'u1'])
    expect(deleteStool).not.toHaveBeenCalled()
  })

  it('404 = succès idempotent : notice de succès, aucune erreur (D7-C)', async () => {
    deleteStool.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la selle/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Selle supprimée.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('DiaperChangePanel — invalidation par préfixe après création (US11.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStools.mockResolvedValue({ items: [STOOL], nextCursor: null })
    listUrines.mockResolvedValue({ items: [URINE], nextCursor: null })
  })

  it('une création réussie invalide le préfixe [babies, b1] (récap calendrier), une seule fois (retry:0)', async () => {
    createDiaperChange.mockResolvedValue({ id: 'dc2', occurredAt: '2026-06-21T09:00:00.000Z' })
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await screen.findByRole('button', { name: /Supprimer la selle/ }) // listes initiales chargées

    // État par défaut du formulaire : Urine cochée → on valide directement.
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createDiaperChange).toHaveBeenCalledTimes(1))
    // L'invalidation vise le PRÉFIXE (pas la clé propre), une seule fois (retry:0).
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(spy.mock.calls[0][0]).toEqual(PREFIX)
  })
})
