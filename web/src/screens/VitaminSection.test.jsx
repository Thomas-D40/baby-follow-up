import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VitaminSection from './VitaminSection'

vi.mock('../api', () => ({
  getVitamins: vi.fn(),
  setVitamin: vi.fn(),
  unsetVitamin: vi.fn(),
}))
import { getVitamins, setVitamin, unsetVitamin } from '../api'

const DAY = {
  date: '2026-08-12',
  items: [
    { vitaminType: 'd', given: true, authorId: 'u1' },
    { vitaminType: 'k', given: false, authorId: null },
  ],
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(
    <QueryClientProvider client={qc}>
      <VitaminSection babyId="b1" date="2026-08-12" />
    </QueryClientProvider>,
  ) }
}

describe('VitaminSection — cases à cocher du récap (US9.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVitamins.mockResolvedValue(DAY)
    setVitamin.mockResolvedValue({ vitaminType: 'k', given: true, authorId: 'u1' })
    unsetVitamin.mockResolvedValue(null)
  })

  it('rend une case par type, reflète l’état given du jour', async () => {
    renderSection()
    const d = await screen.findByRole('checkbox', { name: /Vitamine D/ })
    const k = await screen.findByRole('checkbox', { name: /Vitamine K/ })
    expect(d).toBeChecked()
    expect(k).not.toBeChecked()
  })

  it('cocher une vitamine non donnée appelle setVitamin(babyId, type, date)', async () => {
    renderSection()
    const k = await screen.findByRole('checkbox', { name: /Vitamine K/ })
    await userEvent.click(k)

    await waitFor(() => expect(setVitamin).toHaveBeenCalled())
    expect(setVitamin.mock.calls[0]).toEqual(['b1', 'k', '2026-08-12'])
    expect(unsetVitamin).not.toHaveBeenCalled()
  })

  it('décocher une vitamine donnée appelle unsetVitamin(babyId, type, date)', async () => {
    renderSection()
    const d = await screen.findByRole('checkbox', { name: /Vitamine D/ })
    await userEvent.click(d)

    await waitFor(() => expect(unsetVitamin).toHaveBeenCalled())
    expect(unsetVitamin.mock.calls[0]).toEqual(['b1', 'd', '2026-08-12'])
    expect(setVitamin).not.toHaveBeenCalled()
  })

  it('rafraîchit après toggle par PRÉFIXE [babies, b1] : getVitamins ré-appelé (D7-C/US11.3)', async () => {
    const { qc } = renderSection()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await waitFor(() => expect(getVitamins).toHaveBeenCalledTimes(1))
    const k = await screen.findByRole('checkbox', { name: /Vitamine K/ })
    await userEvent.click(k)
    await waitFor(() => expect(getVitamins).toHaveBeenCalledTimes(2))
    // Garde-fou : prouve le PRÉFIXE, pas la clé propre ['babies','b1','vitamins',date]. Si
    // VitaminSection.jsx:30 régressait vers sa clé propre, getVitamins serait quand même rappelé 2×
    // (la clé propre est incluse dans le préfixe) → seule cette assertion attraperait la régression.
    expect(spy.mock.calls[0][0]).toEqual({ queryKey: ['babies', 'b1'] })
  })

  it('anti-double-saisie : les cases sont désactivées pendant l’écriture (D9-G)', async () => {
    // setVitamin qui ne se résout jamais → la mutation reste "pending".
    setVitamin.mockReturnValue(new Promise(() => {}))
    renderSection()
    const k = await screen.findByRole('checkbox', { name: /Vitamine K/ })
    await userEvent.click(k)

    await waitFor(() => expect(k).toBeDisabled())
    expect(screen.getByRole('checkbox', { name: /Vitamine D/ })).toBeDisabled()
  })

  it('échec de chargement : affiche une alerte, pas une section vide muette', async () => {
    getVitamins.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderSection()
    expect(await screen.findByRole('alert')).toHaveTextContent('Vitamines indisponibles.')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('échec de toggle : affiche une alerte, la case reste pilotée par l’état serveur', async () => {
    setVitamin.mockRejectedValue(Object.assign(new Error('-> 400'), { status: 400 }))
    renderSection()
    const k = await screen.findByRole('checkbox', { name: /Vitamine K/ })
    await userEvent.click(k)

    expect(await screen.findByRole('alert')).toHaveTextContent("Échec de l'enregistrement.")
    // Aucun refetch réussi → la case K reste décochée (état serveur inchangé).
    expect(screen.getByRole('checkbox', { name: /Vitamine K/ })).not.toBeChecked()
  })
})
