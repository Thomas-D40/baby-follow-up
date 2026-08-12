import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WeightPanel from './WeightPanel'
import { parisToday } from '../calendar'

vi.mock('../api', () => ({
  getWeightHistory: vi.fn(),
  upsertWeight: vi.fn(),
  deleteWeight: vi.fn(),
}))
import { getWeightHistory, upsertWeight, deleteWeight } from '../api'

// Store en mémoire keyé par date (mime l'upsert « un/jour, updatable » du back, D12-C′).
let store
const TODAY = parisToday()

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

function renderPanel(qc = makeClient()) {
  render(
    <QueryClientProvider client={qc}><WeightPanel babyId="b1" /></QueryClientProvider>,
  )
  return qc
}

beforeEach(() => {
  vi.clearAllMocks()
  store = new Map()
  getWeightHistory.mockImplementation(async () => ({
    points: [...store.entries()].map(([givenOn, weightGrams]) => ({ givenOn, weightGrams })),
  }))
  upsertWeight.mockImplementation(async (_babyId, date, weightGrams) => {
    store.set(date, weightGrams)
    return { givenOn: date, weightGrams }
  })
  deleteWeight.mockImplementation(async (_babyId, date) => {
    store.delete(date)
    return null
  })
})

describe('WeightPanel — saisie / liste (US12.1)', () => {
  it('saisir un poids → ligne du jour, upsertWeight(babyId, date, grams)', async () => {
    renderPanel()
    expect(await screen.findByText('Aucune pesée enregistrée.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Poids (g)'), '4200')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('4.200 kg')).toBeInTheDocument()
    expect(upsertWeight.mock.calls[0]).toEqual(['b1', TODAY, 4200])
  })

  it('re-saisir aujourd\'hui → met à jour (pas de doublon)', async () => {
    renderPanel()
    await screen.findByText('Aucune pesée enregistrée.')

    await userEvent.type(screen.getByLabelText('Poids (g)'), '4200')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByText('4.200 kg')

    await userEvent.type(screen.getByLabelText('Poids (g)'), '4300')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('4.300 kg')).toBeInTheDocument()
    // Un seul jour → une seule ligne (upsert keyé date, aucun doublon).
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(upsertWeight).toHaveBeenCalledTimes(2)
  })

  it('✏️ pré-remplit le form (date + poids) pour re-saisir le même jour', async () => {
    store.set(TODAY, 4200)
    renderPanel()
    await screen.findByText('4.200 kg')

    await userEvent.click(screen.getByRole('button', { name: `Corriger le poids du ${TODAY}` }))

    expect(screen.getByLabelText('Poids (g)')).toHaveValue(4200)
    expect(screen.getByLabelText('Jour')).toHaveValue(TODAY)
  })

  it('supprimer une pesée → ligne retirée + notice de succès', async () => {
    store.set(TODAY, 4200)
    renderPanel()
    await screen.findByText('4.200 kg')

    await userEvent.click(screen.getByRole('button', { name: `Supprimer le poids du ${TODAY}` }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(deleteWeight.mock.calls[0]).toEqual(['b1', TODAY])
    expect(await screen.findByText('Aucune pesée enregistrée.')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('Poids supprimé.')
  })

  it('poids manquant → erreur locale, aucun appel API (garde-fou JS)', async () => {
    // Les bornes 0 < g ≤ 30000 sont déjà tenues nativement par min/max de l'input ; ici on couvre
    // le garde-fou JS (valeur non finie) en soumettant le champ poids vide.
    renderPanel()
    await screen.findByText('Aucune pesée enregistrée.')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText(/Poids invalide/)).toBeInTheDocument()
    expect(upsertWeight).not.toHaveBeenCalled()
  })

  it('invalidation par préfixe [\'babies\', babyId] après saisie (rafraîchit liste ET courbe)', async () => {
    const qc = makeClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    renderPanel(qc)
    await screen.findByText('Aucune pesée enregistrée.')

    await userEvent.type(screen.getByLabelText('Poids (g)'), '4200')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByText('4.200 kg')

    const invalidatedByPrefix = spy.mock.calls.some(
      (c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(['babies', 'b1']),
    )
    expect(invalidatedByPrefix).toBe(true)
  })
})
