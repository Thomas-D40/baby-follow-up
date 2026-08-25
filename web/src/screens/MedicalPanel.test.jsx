import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MedicalPanel from './MedicalPanel'

vi.mock('../api', () => ({
  listTemperatures: vi.fn(),
  listMedicalCares: vi.fn(),
  createTemperature: vi.fn(),
  createMedicalCareAct: vi.fn(),
  updateTemperature: vi.fn(),
  updateMedicalCare: vi.fn(),
  // `useDeleteEvent` route vers les 6 clients de suppression : tous présents dans le mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
  deleteTemperature: vi.fn(),
  deleteMedicalCare: vi.fn(),
}))
import {
  listTemperatures,
  listMedicalCares,
  createTemperature,
  createMedicalCareAct,
  updateMedicalCare,
  deleteMedicalCare,
  deleteTemperature,
} from '../api'

const PREFIX = { queryKey: ['babies', 'b1'] }

const TEMP = { id: 't1', occurredAt: '2026-06-21T10:00:00.000Z', temperatureCelsiusX10: 384, authorId: 'a1' }
const EYE = { id: 'e1', occurredAt: '2026-06-21T09:00:00.000Z', careType: 'eye', authorId: 'a1' }
const NOSE = { id: 'n1', occurredAt: '2026-06-21T08:00:00.000Z', careType: 'nose', authorId: 'a1' }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(
    <QueryClientProvider client={qc}><MedicalPanel babyId="b1" /></QueryClientProvider>,
  ) }
}

const temperatureForm = () => screen.getByRole('form', { name: 'Température' })
const careForm = () => screen.getByRole('form', { name: 'Soin médical' })

describe('MedicalPanel — saisie (US15.1/US15.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue({ items: [], nextCursor: null })
    listMedicalCares.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('température : createTemperature une fois, notice, invalidation par préfixe', async () => {
    createTemperature.mockResolvedValue(TEMP)
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    const form = temperatureForm()
    await userEvent.type(within(form).getByLabelText('Température (°C)'), '37,8')
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createTemperature).toHaveBeenCalledTimes(1))
    expect(createTemperature.mock.calls[0][0]).toBe('b1')
    expect(createTemperature.mock.calls[0][1].temperatureCelsiusX10).toBe(378)
    expect(await screen.findByRole('status')).toHaveTextContent('Température enregistrée.')
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('soin : UN SEUL appel à l’acte composite, jamais deux créations par ressource', async () => {
    createMedicalCareAct.mockResolvedValue({ eye: EYE, nose: NOSE })
    renderPanel()

    const form = careForm()
    await userEvent.click(within(form).getByRole('button', { name: 'Yeux' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Nez' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createMedicalCareAct).toHaveBeenCalledTimes(1))
    expect(createMedicalCareAct.mock.calls[0][0]).toBe('b1')
    expect(createMedicalCareAct.mock.calls[0][1]).toMatchObject({ withEye: true, withNose: true })
    expect(await screen.findByRole('status')).toHaveTextContent('Soin enregistré.')
  })
})

describe('MedicalPanel — liste fusionnée : traduction du vocabulaire (K1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue({ items: [TEMP], nextCursor: null })
    listMedicalCares.mockResolvedValue({ items: [EYE, NOSE], nextCursor: null })
  })

  it('rend une ligne par acte, tri DESC, valeur formatée pour la température', async () => {
    renderPanel()

    const rows = await screen.findAllByRole('button', { name: /^Supprimer/ })
    expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/Supprimer la température/),
      expect.stringMatching(/Supprimer le soin des yeux/),
      expect.stringMatching(/Supprimer le soin du nez/),
    ])
    expect(screen.getByText(/38,4 °C/)).toBeInTheDocument()
  })

  it('LE PIÈGE : supprimer une ligne 👁 ET une ligne 👃 route vers deleteMedicalCare (pas de type « eye »)', async () => {
    deleteMedicalCare.mockResolvedValue(null)
    renderPanel()

    // Ligne 👁 : `careType: 'eye'` posé tel quel donnerait DELETE_CLIENT['eye'] === undefined → TypeError.
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer le soin des yeux/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))
    await waitFor(() => expect(deleteMedicalCare).toHaveBeenCalledTimes(1))
    expect(deleteMedicalCare.mock.calls[0]).toEqual(['b1', 'e1'])

    // Ligne 👃 : même client, autre id.
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer le soin du nez/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))
    await waitFor(() => expect(deleteMedicalCare).toHaveBeenCalledTimes(2))
    expect(deleteMedicalCare.mock.calls[1]).toEqual(['b1', 'n1'])

    expect(deleteTemperature).not.toHaveBeenCalled()
  })

  it('supprimer une ligne 🌡 route vers deleteTemperature', async () => {
    deleteTemperature.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la température/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteTemperature).toHaveBeenCalledTimes(1))
    expect(deleteTemperature.mock.calls[0]).toEqual(['b1', 't1'])
    expect(deleteMedicalCare).not.toHaveBeenCalled()
  })

  it('✏️ sur une ligne 👃 : PATCH par ressource avec le careType traduit', async () => {
    updateMedicalCare.mockResolvedValue({})
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier le soin du nez/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Soin : Nez')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateMedicalCare).toHaveBeenCalledTimes(1))
    expect(updateMedicalCare.mock.calls[0][0]).toBe('b1')
    expect(updateMedicalCare.mock.calls[0][1]).toBe('n1')
    expect(updateMedicalCare.mock.calls[0][2].careType).toBe('nose')
  })
})

describe('MedicalPanel — plafond d’affichage PAR TYPE (5 + 5)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('8 soins du nez + 3 températures : les 3 températures restent TOUTES visibles', async () => {
    // Avec un slice(0, 10) sur la FUSION (patron DiaperChangePanel), les 8 soins — tous plus
    // récents — évinceraient les températures de la liste où on vient de les saisir.
    const NOSES = Array.from({ length: 8 }, (_, i) => ({
      id: `n${i}`, occurredAt: `2026-06-21T2${i > 3 ? 3 : 0}:${String(10 + i).padStart(2, '0')}:00.000Z`, careType: 'nose',
    }))
    const TEMPS = Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`, occurredAt: `2026-06-21T0${i}:00:00.000Z`, temperatureCelsiusX10: 380 + i,
    }))
    listTemperatures.mockResolvedValue({ items: TEMPS, nextCursor: null })
    listMedicalCares.mockResolvedValue({ items: NOSES, nextCursor: null })
    renderPanel()

    // Les 3 températures sont là…
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Supprimer la température/ })).toHaveLength(3))
    // …et les soins sont plafonnés à 5 (5 + 5, jamais 10 sur la fusion).
    expect(screen.getAllByRole('button', { name: /Supprimer le soin du nez/ })).toHaveLength(5)
  })

  it('aucun acte : message vide dédié', async () => {
    listTemperatures.mockResolvedValue({ items: [], nextCursor: null })
    listMedicalCares.mockResolvedValue({ items: [], nextCursor: null })
    renderPanel()

    expect(await screen.findByText('Aucun acte médical enregistré.')).toBeInTheDocument()
  })
})
