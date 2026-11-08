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
  createMedicalCareAct,
  updateMedicalCare,
  deleteMedicalCare,
  deleteTemperature,
  deleteMedication,
  listMedications,
  createMedication,
  updateMedication,
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
    listMedications.mockResolvedValue({ items: [], nextCursor: null })
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
    listMedications.mockResolvedValue({ items: [], nextCursor: null })
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

  it('✏️ sur une ligne 👃 : PATCH par ressource, réduit au seul champ édité', async () => {
    updateMedicalCare.mockResolvedValue({})
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier le soin du nez/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Soin : Nez')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateMedicalCare).toHaveBeenCalledTimes(1))
    expect(updateMedicalCare.mock.calls[0][0]).toBe('b1')
    expect(updateMedicalCare.mock.calls[0][1]).toBe('n1')
    // Le libellé « Soin : Nez » prouve la traduction ; le type reste immuable, donc hors du patch.
    expect(updateMedicalCare.mock.calls[0][2]).toEqual({ occurredAt: expect.any(String) })
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
    listMedications.mockResolvedValue({ items: [], nextCursor: null })
    renderPanel()

    // Les 3 températures sont là…
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Supprimer la température/ })).toHaveLength(3))
    // …et les soins sont plafonnés à 5 (5 + 5, jamais 10 sur la fusion).
    expect(screen.getAllByRole('button', { name: /Supprimer le soin du nez/ })).toHaveLength(5)
  })

  it('aucun acte : message vide dédié', async () => {
    listTemperatures.mockResolvedValue({ items: [], nextCursor: null })
    listMedicalCares.mockResolvedValue({ items: [], nextCursor: null })
    listMedications.mockResolvedValue({ items: [], nextCursor: null })
    renderPanel()

    expect(await screen.findByText('Aucun acte médical enregistré.')).toBeInTheDocument()
  })
})

// ── Épic 19 (US19.1): medication intakes in the Medical sheet ─────────────────────────────────────
const MED = {
  id: 'm1', occurredAt: '2026-06-21T08:10:00.000Z', medicationName: 'Doliprane', dosage: '1 dose 6 kg', authorId: 'a1',
}
const TEMP_EARLY = { id: 't1', occurredAt: '2026-06-21T08:00:00.000Z', temperatureCelsiusX10: 384, authorId: 'a1' }

const medicationForm = () => screen.getByRole('form', { name: 'Prise de médicament' })
const optionsGroup = () => within(medicationForm()).getByRole('group', { name: 'Choix du médicament' })
const medicationOption = (name) => within(optionsGroup()).getByRole('button', { name })
const optionNames = () => within(optionsGroup()).getAllByRole('button').map((b) => b.textContent.trim())
const OPENING_OPTIONS = ['Doliprane', 'Advil', 'Ventoline', 'Célestène', 'Amoxicilline', 'Smecta', 'Autre']

describe('MedicalPanel — la section Médicament (Épic 19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTemperatures.mockResolvedValue({ items: [], nextCursor: null })
    listMedicalCares.mockResolvedValue({ items: [], nextCursor: null })
    listMedications.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('les titres de section sont dans l’ordre : Température, Soin des yeux / du nez, Médicament, Derniers actes médicaux', () => {
    renderPanel()

    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Température', 'Soin des yeux / du nez', 'Médicament', 'Derniers actes médicaux',
    ])
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
    listMedicalCares.mockResolvedValue({ items: [], nextCursor: null })
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
