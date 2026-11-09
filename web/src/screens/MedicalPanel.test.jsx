import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MedicalPanel from './MedicalPanel'

vi.mock('../api', () => ({
  listTemperatures: vi.fn(),
  createTemperature: vi.fn(),
  updateTemperature: vi.fn(),
  // Declared only to assert the Medical sheet never reads cares (Épic 22): they live in CarePanel.
  listMedicalCares: vi.fn(),
  // `useDeleteEvent` routes to the 9 delete clients: all present in the mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  deleteUrine: vi.fn(),
  deleteTemperature: vi.fn(),
  deleteMedicalCare: vi.fn(),
  deleteBreastfeeding: vi.fn(),
  deleteSolidMeal: vi.fn(),
  deleteMedication: vi.fn(),
  // `useUpdateEvent` (editing an intake) reads its 9 clients at module load: all declared.
  updateBottleFeeding: vi.fn(),
  updateNap: vi.fn(),
  updateStool: vi.fn(),
  updateUrine: vi.fn(),
  updateMedicalCare: vi.fn(),
  updateBreastfeeding: vi.fn(),
  updateSolidMeal: vi.fn(),
  updateMedication: vi.fn(),
  listMedications: vi.fn(),
  createMedication: vi.fn(),
}))
import {
  listTemperatures,
  listMedicalCares,
  createTemperature,
  deleteTemperature,
  deleteMedication,
  listMedications,
  createMedication,
  updateMedication,
} from '../api'

const PREFIX = { queryKey: ['babies', 'b1'] }
const EMPTY = { items: [], nextCursor: null }

const TEMP = { id: 't1', occurredAt: '2026-06-21T10:00:00.000Z', temperatureCelsiusX10: 384, authorId: 'a1' }
const EYE = { id: 'e1', occurredAt: '2026-06-21T09:00:00.000Z', careType: 'eye', authorId: 'a1' }
const MED = {
  id: 'm1', occurredAt: '2026-06-21T08:10:00.000Z', medicationName: 'Doliprane', dosage: '1 dose 6 kg', authorId: 'a1',
}
const TEMP_EARLY = { id: 't1', occurredAt: '2026-06-21T08:00:00.000Z', temperatureCelsiusX10: 384, authorId: 'a1' }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(
    <QueryClientProvider client={qc}><MedicalPanel babyId="b1" /></QueryClientProvider>,
  ) }
}

const temperatureForm = () => screen.getByRole('form', { name: 'Température' })

describe('MedicalPanel — saisie de la température (US15.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue(EMPTY)
    listMedications.mockResolvedValue(EMPTY)
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
})

describe('MedicalPanel — la température reste dans la rubrique Médical (Épic 22, D22-H)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue({ items: [TEMP], nextCursor: null })
    listMedications.mockResolvedValue(EMPTY)
  })

  it('titres de section dans l’ordre : Température, Médicament, Derniers actes médicaux', () => {
    renderPanel()

    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Température', 'Médicament', 'Derniers actes médicaux',
    ])
  })

  it('une température enregistrée apparaît dans « Derniers actes médicaux », valeur formatée', async () => {
    renderPanel()

    expect(await screen.findByRole('button', { name: /Supprimer la température du/ })).toBeInTheDocument()
    expect(screen.getByText(/38,4 °C/)).toBeInTheDocument()
  })

  it('supprimer une ligne 🌡 route vers deleteTemperature', async () => {
    deleteTemperature.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la température/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteTemperature).toHaveBeenCalledTimes(1))
    expect(deleteTemperature.mock.calls[0]).toEqual(['b1', 't1'])
  })

  it('aucun acte : message vide dédié', async () => {
    listTemperatures.mockResolvedValue(EMPTY)
    renderPanel()

    expect(await screen.findByText('Aucun acte médical enregistré.')).toBeInTheDocument()
  })
})

describe('MedicalPanel — plus de soins (Épic 22)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue(EMPTY)
    listMedicalCares.mockResolvedValue({ items: [EYE], nextCursor: null })
    listMedications.mockResolvedValue({ items: [MED], nextCursor: null })
  })

  it('ni formulaire de soin ni liste de soins : seule la prise de Doliprane est listée, listMedicalCares jamais appelé', async () => {
    renderPanel()

    const deletes = await screen.findAllByRole('button', { name: /^Supprimer/ })
    expect(deletes).toHaveLength(1)
    expect(deletes[0].closest('li')).toHaveTextContent(/· 💊 Médicament · Doliprane/)
    expect(screen.queryByRole('form', { name: 'Soin médical' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Type de soin' })).not.toBeInTheDocument()
    expect(listMedicalCares).not.toHaveBeenCalled()
  })
})

describe('MedicalPanel — températures et prises mêlées (Épic 22)', () => {
  it('température 08:00, Doliprane 08:10, soin du nez 08:20 : la prise puis la température, aucune ligne de soin', async () => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue({ items: [TEMP_EARLY], nextCursor: null })
    listMedications.mockResolvedValue({ items: [MED], nextCursor: null })
    listMedicalCares.mockResolvedValue({
      items: [{ id: 'n1', occurredAt: '2026-06-21T08:20:00.000Z', careType: 'nose' }], nextCursor: null,
    })
    renderPanel()

    const deletes = await screen.findAllByRole('button', { name: /^Supprimer/ })
    expect(deletes.map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Supprimer le médicament du/),
      expect.stringMatching(/^Supprimer la température du/),
    ])
    expect(deletes[0].closest('li')).toHaveTextContent(/· 💊 Médicament · Doliprane/)
    expect(screen.queryByText(/Nez/)).not.toBeInTheDocument()
  })
})

describe('MedicalPanel — plafond 5 + 5 (Épic 22, D22-H)', () => {
  it('7 températures et 7 prises : les 5 plus récentes de chaque type, fusionnées par heure décroissante', async () => {
    vi.clearAllMocks()
    // Each list is already newest first, like the server. Hours interleave so the merged order is
    // unambiguous: T0 20h, P0 19h, T1 18h, P1 17h, … (temperature before the intake of the next hour).
    const TEMPS = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`, occurredAt: `2026-06-21T${String(20 - 2 * i).padStart(2, "0")}:00:00.000Z`, temperatureCelsiusX10: 381 + i,
    }))
    const MEDS = Array.from({ length: 7 }, (_, i) => ({
      id: `m${i}`, occurredAt: `2026-06-21T${String(19 - 2 * i).padStart(2, '0')}:00:00.000Z`,
      medicationName: `Prise${i}`, dosage: null,
    }))
    listTemperatures.mockResolvedValue({ items: TEMPS, nextCursor: null })
    listMedications.mockResolvedValue({ items: MEDS, nextCursor: null })
    renderPanel()

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Supprimer/ })).toHaveLength(10))
    expect(screen.getAllByRole('button', { name: /Supprimer la température du/ })).toHaveLength(5)
    expect(screen.getAllByRole('button', { name: /Supprimer le médicament du/ })).toHaveLength(5)

    // Hard-coded expected order of the ten rows (never re-derived by parsing the FR date).
    const rows = screen.getAllByRole('button', { name: /^Supprimer/ }).map((b) => b.closest('li'))
    const EXPECTED = [
      /🌡 Température · 38,1 °C/, /💊 Médicament · Prise0/,
      /🌡 Température · 38,2 °C/, /💊 Médicament · Prise1/,
      /🌡 Température · 38,3 °C/, /💊 Médicament · Prise2/,
      /🌡 Température · 38,4 °C/, /💊 Médicament · Prise3/,
      /🌡 Température · 38,5 °C/, /💊 Médicament · Prise4/,
    ]
    expect(rows).toHaveLength(EXPECTED.length)
    EXPECTED.forEach((pattern, i) => expect(rows[i]).toHaveTextContent(pattern))
    // The two oldest temperatures and the two oldest intakes are cut.
    expect(screen.queryByText(/38,6 °C/)).not.toBeInTheDocument()
    expect(screen.queryByText(/38,7 °C/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Prise5/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Prise6/)).not.toBeInTheDocument()
  })
})

// ── Épic 19 (US19.1): medication intakes in the Medical sheet ─────────────────────────────────────
const medicationForm = () => screen.getByRole('form', { name: 'Prise de médicament' })
const optionsGroup = () => within(medicationForm()).getByRole('group', { name: 'Choix du médicament' })
const medicationOption = (name) => within(optionsGroup()).getByRole('button', { name })
const optionNames = () => within(optionsGroup()).getAllByRole('button').map((b) => b.textContent.trim())
const OPENING_OPTIONS = ['Doliprane', 'Advil', 'Ventoline', 'Célestène', 'Amoxicilline', 'Smecta', 'Autre']

describe('MedicalPanel — la section Médicament (Épic 19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue(EMPTY)
    listMedications.mockResolvedValue(EMPTY)
  })

  it('à l’ouverture : sept options dans l’ordre, aucune enfoncée, posologie vide, aucun champ libre', () => {
    renderPanel()

    expect(optionNames()).toEqual(OPENING_OPTIONS)
    OPENING_OPTIONS.forEach((name) => expect(medicationOption(name)).toHaveAttribute('aria-pressed', 'false'))
    expect(within(medicationForm()).getByRole('textbox', { name: 'Posologie' })).toHaveValue('')
    expect(within(medicationForm()).queryByRole('textbox', { name: 'Médicament' })).not.toBeInTheDocument()
  })

  it('Doliprane + « 1 dose 6 kg » : createMedication une fois, confirmation, UNE invalidation par préfixe', async () => {
    createMedication.mockResolvedValue(MED)
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(medicationOption('Doliprane'))
    await userEvent.type(within(medicationForm()).getByRole('textbox', { name: 'Posologie' }), '1 dose 6 kg')
    await userEvent.click(within(medicationForm()).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createMedication).toHaveBeenCalledTimes(1))
    expect(createMedication.mock.calls[0]).toEqual([
      'b1', { occurredAt: expect.any(String), medicationName: 'Doliprane', dosage: '1 dose 6 kg' },
    ])
    expect(await screen.findByRole('status')).toHaveTextContent('Médicament enregistré.')
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
    // Back to the opening state.
    await waitFor(() => expect(within(medicationForm()).getByRole('textbox', { name: 'Posologie' })).toHaveValue(''))
    OPENING_OPTIONS.forEach((name) => expect(medicationOption(name)).toHaveAttribute('aria-pressed', 'false'))
  })

  it('aucune option : « Choisissez un médicament. » et rien n’est envoyé', async () => {
    renderPanel()

    await userEvent.click(within(medicationForm()).getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('Choisissez un médicament.')).toBeInTheDocument()
    expect(createMedication).not.toHaveBeenCalled()
  })

  it('aucune mémoire : après une prise « Gaviscon » via Autre, la section ne propose toujours que les sept options', async () => {
    const GAVISCON = { id: 'm7', occurredAt: '2026-06-21T09:00:00.000Z', medicationName: 'Gaviscon', dosage: null, authorId: 'a1' }
    createMedication.mockResolvedValue(GAVISCON)
    renderPanel()

    await userEvent.click(medicationOption('Autre'))
    await userEvent.type(within(medicationForm()).getByRole('textbox', { name: 'Médicament' }), 'Gaviscon')
    // The refetch triggered by the write now returns the new intake.
    listMedications.mockResolvedValue({ items: [GAVISCON], nextCursor: null })
    await userEvent.click(within(medicationForm()).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('button', { name: /Supprimer le médicament/ })).toBeInTheDocument()
    expect(optionNames()).toEqual(OPENING_OPTIONS)
  })
})

describe('MedicalPanel — les prises dans « Derniers actes médicaux » (Épic 19, D19-D)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue({ items: [TEMP_EARLY], nextCursor: null })
    listMedications.mockResolvedValue({ items: [MED], nextCursor: null })
  })

  it('la prise de 08:10 est au-dessus de la température de 08:00, ligne « 💊 Médicament · Doliprane · 1 dose 6 kg »', async () => {
    renderPanel()

    const rows = await screen.findAllByRole('button', { name: /^Supprimer/ })
    expect(rows.map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/Supprimer le médicament du/),
      expect.stringMatching(/Supprimer la température du/),
    ])
    expect(rows[0].closest('li')).toHaveTextContent(/· 💊 Médicament · Doliprane · 1 dose 6 kg/)
  })

  it('7 prises et 2 températures : les 5 prises les plus récentes et les 2 températures', async () => {
    // Already newest first, like the server; distinct names tell which ones are kept.
    const SEVEN = Array.from({ length: 7 }, (_, i) => ({
      id: `m${i}`, occurredAt: `2026-06-21T${20 - i}:00:00.000Z`, medicationName: `Prise${i}`, dosage: null,
    }))
    const TWO_TEMPS = [
      { id: 't1', occurredAt: '2026-06-21T08:00:00.000Z', temperatureCelsiusX10: 384 },
      { id: 't2', occurredAt: '2026-06-21T07:00:00.000Z', temperatureCelsiusX10: 372 },
    ]
    listMedications.mockResolvedValue({ items: SEVEN, nextCursor: null })
    listTemperatures.mockResolvedValue({ items: TWO_TEMPS, nextCursor: null })
    renderPanel()

    await waitFor(() => expect(screen.getAllByRole('button', { name: /Supprimer le médicament du/ })).toHaveLength(5))
    expect(screen.getAllByRole('button', { name: /Supprimer la température du/ })).toHaveLength(2)
    ;['Prise0', 'Prise1', 'Prise2', 'Prise3', 'Prise4'].forEach((name) => {
      expect(screen.getByText(new RegExp(name))).toBeInTheDocument()
    })
    expect(screen.queryByText(/Prise5/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Prise6/)).not.toBeInTheDocument()
  })

  it('✏️ sur une prise : feuille « Modifier le médicament » avec Doliprane, la posologie, et rien d’autre (D19-I)', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier le médicament du/ }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Modifier le médicament')
    const form = within(dialog).getByRole('form', { name: 'Modifier le médicament' })
    const group = within(form).getByRole('group', { name: 'Choix du médicament' })
    expect(within(group).getByRole('button', { name: 'Doliprane' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(form).getByRole('textbox', { name: 'Posologie' })).toHaveValue('1 dose 6 kg')
    expect(within(form).getAllByRole('textbox')).toHaveLength(1)
    expect(within(form).queryByLabelText('Température (°C)')).not.toBeInTheDocument()
    expect(within(form).queryByRole('group', { name: 'Type de soin' })).not.toBeInTheDocument()
  })

  it('corriger « Dolipran » → Doliprane, posologie effacée : updateMedication(b1, id, patch), confirmation, feuille fermée', async () => {
    listMedications.mockResolvedValue({ items: [{ ...MED, medicationName: 'Dolipran' }], nextCursor: null })
    updateMedication.mockResolvedValue({})
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    await userEvent.click(await screen.findByRole('button', { name: /Modifier le médicament du/ }))
    const dialog = screen.getByRole('dialog')
    const form = within(dialog).getByRole('form', { name: 'Modifier le médicament' })
    await userEvent.click(within(within(form).getByRole('group', { name: 'Choix du médicament' }))
      .getByRole('button', { name: 'Doliprane' }))
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Posologie' }))
    await userEvent.click(within(form).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateMedication).toHaveBeenCalledTimes(1))
    expect(updateMedication.mock.calls[0]).toEqual([
      'b1', 'm1', { occurredAt: expect.any(String), medicationName: 'Doliprane', dosage: null },
    ])
    expect(await screen.findByRole('status')).toHaveTextContent('Médicament mis à jour.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))).toHaveLength(1)
  })

  it('🗑 sur une prise : invite « Supprimer ce médicament ? » puis deleteMedication(b1, id) et « Médicament supprimé. »', async () => {
    deleteMedication.mockResolvedValue(null)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer le médicament du/ }))
    expect(screen.getByText('Supprimer ce médicament ?')).toBeInTheDocument()
    expect(deleteMedication).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteMedication).toHaveBeenCalledTimes(1))
    expect(deleteMedication.mock.calls[0]).toEqual(['b1', 'm1'])
    expect(deleteTemperature).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Médicament supprimé.')
  })
})
