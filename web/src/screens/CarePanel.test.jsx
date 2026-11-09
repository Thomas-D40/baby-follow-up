import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CarePanel from './CarePanel'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

vi.mock('../api', () => ({
  listMedicalCares: vi.fn(),
  createMedicalCareAct: vi.fn(),
  updateMedicalCare: vi.fn(),
  // Must never be called by the Soins sheet (asserted below).
  listTemperatures: vi.fn(),
  listMedications: vi.fn(),
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
  // `useUpdateEvent` reads its 9 clients at module load: all declared.
  updateBottleFeeding: vi.fn(),
  updateNap: vi.fn(),
  updateStool: vi.fn(),
  updateUrine: vi.fn(),
  updateTemperature: vi.fn(),
  updateBreastfeeding: vi.fn(),
  updateSolidMeal: vi.fn(),
  updateMedication: vi.fn(),
}))
import {
  listMedicalCares,
  createMedicalCareAct,
  updateMedicalCare,
  deleteMedicalCare,
  listTemperatures,
  listMedications,
} from '../api'

const PREFIX = { queryKey: ['babies', 'b1'] }
const EMPTY = { items: [], nextCursor: null }

// Server order: occurredAt descending.
const EYE = { id: 'e1', occurredAt: '2026-06-21T09:00:00.000Z', careType: 'eye', authorId: 'a1' }
const NOSE = { id: 'n1', occurredAt: '2026-06-21T08:00:00.000Z', careType: 'nose', authorId: 'a1' }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const spy = vi.spyOn(qc, 'invalidateQueries')
  return { qc, spy, ...render(
    <QueryClientProvider client={qc}><CarePanel babyId="b1" /></QueryClientProvider>,
  ) }
}

const careForm = () => screen.getByRole('form', { name: 'Soin médical' })
const save = () => within(careForm()).getByRole('button', { name: 'Enregistrer' })
const rows = () => screen.getAllByRole('listitem')
const prefixInvalidations = (spy) =>
  spy.mock.calls.filter((c) => JSON.stringify(c[0]) === JSON.stringify(PREFIX))

beforeEach(() => {
  vi.clearAllMocks()
  listMedicalCares.mockResolvedValue(EMPTY)
})

describe('CarePanel — noter un soin', () => {
  it('Yeux + Nez + Enregistrer : UN SEUL acte composite, confirmation, invalidation du préfixe, deux lignes en tête', async () => {
    createMedicalCareAct.mockResolvedValue({ eye: EYE, nose: NOSE })
    const { spy } = renderPanel()
    await screen.findByText('Aucun soin enregistré.')

    await userEvent.click(within(careForm()).getByRole('button', { name: 'Yeux' }))
    await userEvent.click(within(careForm()).getByRole('button', { name: 'Nez' }))
    // The refetch triggered by the write now returns the two new cares (same hour: server tie-break).
    listMedicalCares.mockResolvedValue({ items: [EYE, NOSE], nextCursor: null })
    await userEvent.click(save())

    await waitFor(() => expect(createMedicalCareAct).toHaveBeenCalledTimes(1))
    expect(createMedicalCareAct.mock.calls[0]).toEqual([
      'b1', { occurredAt: expect.any(String), withEye: true, withNose: true },
    ])
    expect(await screen.findByRole('status')).toHaveTextContent('Soin enregistré.')
    expect(prefixInvalidations(spy)).toHaveLength(1)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(rows()[0]).toHaveTextContent('👁 Yeux')
    expect(rows()[1]).toHaveTextContent('👃 Nez')
  })

  it('l’heure saisie dans « Quand » part dans l’acte', async () => {
    createMedicalCareAct.mockResolvedValue({ eye: EYE })
    renderPanel()

    await userEvent.click(within(careForm()).getByRole('button', { name: 'Yeux' }))
    fireEvent.change(within(careForm()).getByLabelText('Quand'), { target: { value: '2026-06-21T07:30' } })
    await userEvent.click(save())

    await waitFor(() => expect(createMedicalCareAct).toHaveBeenCalledTimes(1))
    expect(createMedicalCareAct.mock.calls[0][1]).toEqual({
      occurredAt: toOccurredAtIso('2026-06-21T07:30'), withEye: true, withNose: false,
    })
  })
})

describe('CarePanel — un soin doit être choisi', () => {
  it('rien de coché : « Enregistrer » désactivé, un clic n’appelle rien (D22-S)', async () => {
    renderPanel()
    await screen.findByText('Aucun soin enregistré.')

    expect(save()).toBeDisabled()
    await userEvent.click(save())

    expect(createMedicalCareAct).not.toHaveBeenCalled()
  })
})

describe('CarePanel — la liste ne montre que des soins', () => {
  it('7 soins du nez : les 5 plus récents dans l’ordre reçu, ni température ni médicament', async () => {
    // Already newest first, like the server; the date tells which ones are kept.
    const NOSES = Array.from({ length: 7 }, (_, i) => ({
      id: `n${i}`, occurredAt: `2026-06-21T${20 - i}:00:00.000Z`, careType: 'nose',
    }))
    listMedicalCares.mockResolvedValue({ items: NOSES, nextCursor: null })
    renderPanel()

    const deletes = await screen.findAllByRole('button', { name: /^Supprimer le soin du nez du/ })
    expect(deletes).toHaveLength(5)
    // The same labels, rebuilt from the first five fixtures in the same order.
    const expected = NOSES.slice(0, 5).map((n) =>
      `Supprimer le soin du nez du ${new Date(n.occurredAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`)
    expect(deletes.map((b) => b.getAttribute('aria-label'))).toEqual(expected)
    expect(listTemperatures).not.toHaveBeenCalled()
    expect(listMedications).not.toHaveBeenCalled()
    expect(screen.queryByText(/Température/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Médicament/)).not.toBeInTheDocument()
  })

  it('« Derniers soins » est le seul titre h4, après le formulaire (aucun titre au-dessus)', async () => {
    renderPanel()
    await screen.findByText('Aucun soin enregistré.')

    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['Derniers soins'])
    const form = careForm()
    const heading = screen.getByRole('heading', { level: 4, name: 'Derniers soins' })
    expect(form.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('CarePanel — aucun soin', () => {
  it('liste vide : « Aucun soin enregistré. »', async () => {
    renderPanel()

    expect(await screen.findByText('Aucun soin enregistré.')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})

describe('CarePanel — soins existants', () => {
  it('un soin des yeux et un soin du nez déjà enregistrés : deux lignes, sans aucune écriture', async () => {
    listMedicalCares.mockResolvedValue({ items: [EYE, NOSE], nextCursor: null })
    renderPanel()

    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(rows()[0]).toHaveTextContent('👁 Yeux')
    expect(rows()[1]).toHaveTextContent('👃 Nez')
    expect(createMedicalCareAct).not.toHaveBeenCalled()
    expect(listMedicalCares).toHaveBeenCalledTimes(1)
    expect(listMedicalCares.mock.calls[0]).toEqual(['b1'])
  })
})

describe('CarePanel — modifier un soin', () => {
  // `NOSE.occurredAt` rendered in the machine's local time: no TZ is pinned, so the date part is
  // derived instead of hard-coded.
  const date = () => toLocalInputValue(new Date(NOSE.occurredAt)).slice(0, 10)

  beforeEach(() => {
    listMedicalCares.mockResolvedValue({ items: [NOSE], nextCursor: null })
  })

  it('✏️ sur le soin du nez, heure corrigée à 07:45 : PATCH réduit à l’heure, confirmation, feuille fermée', async () => {
    updateMedicalCare.mockResolvedValue({})
    const { spy } = renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier le soin du nez du/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /Modifier le soin du nez/ })).toBeInTheDocument()
    expect(within(dialog).getByText('Soin : Nez')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Quand'), { target: { value: `${date()}T07:45` } })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(updateMedicalCare).toHaveBeenCalledTimes(1))
    expect(updateMedicalCare.mock.calls[0]).toEqual([
      'b1', 'n1', { occurredAt: toOccurredAtIso(`${date()}T07:45`) },
    ])
    expect(await screen.findByRole('status')).toHaveTextContent('Soin mis à jour.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(prefixInvalidations(spy)).toHaveLength(1)
  })

  it('✏️ sur un soin des yeux : la feuille d’édition l’annonce comme un soin des yeux', async () => {
    listMedicalCares.mockResolvedValue({ items: [EYE], nextCursor: null })
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier le soin des yeux du/ }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: /Modifier le soin des yeux/ })).toBeInTheDocument()
    expect(within(dialog).getByText('Soin : Yeux')).toBeInTheDocument()
  })

  it('Échap ferme la feuille d’édition sans erreur et sans appel réseau', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier le soin du nez du/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateMedicalCare).not.toHaveBeenCalled()
  })

  it('le bouton « Fermer » ferme la feuille d’édition sans appel réseau', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Modifier le soin du nez du/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fermer' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(updateMedicalCare).not.toHaveBeenCalled()
  })
})

describe('CarePanel — supprimer un soin', () => {
  beforeEach(() => {
    listMedicalCares.mockResolvedValue({ items: [EYE, NOSE], nextCursor: null })
    deleteMedicalCare.mockResolvedValue(null)
  })

  it('🗑 sur le soin du nez : invite, puis deleteMedicalCare(b1, id) et « Soin du nez supprimé. »', async () => {
    const { spy } = renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer le soin du nez du/ }))
    expect(screen.getByText('Supprimer ce soin du nez ?')).toBeInTheDocument()
    expect(deleteMedicalCare).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteMedicalCare).toHaveBeenCalledTimes(1))
    expect(deleteMedicalCare.mock.calls[0]).toEqual(['b1', 'n1'])
    expect(await screen.findByRole('status')).toHaveTextContent('Soin du nez supprimé.')
    expect(prefixInvalidations(spy)).toHaveLength(1)
  })

  it('🗑 sur le soin des yeux : même client, autre id — pas de type « eye » non routé (K1)', async () => {
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer le soin des yeux du/ }))
    expect(screen.getByText('Supprimer ce soin des yeux ?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteMedicalCare).toHaveBeenCalledTimes(1))
    expect(deleteMedicalCare.mock.calls[0]).toEqual(['b1', 'e1'])
    expect(await screen.findByRole('status')).toHaveTextContent('Soin des yeux supprimé.')
  })
})

describe('CarePanel — double-tap', () => {
  it('deux touches rapides sur « Enregistrer » : un seul acte, bouton désactivé', async () => {
    let resolve
    createMedicalCareAct.mockImplementation(() => new Promise((r) => { resolve = r }))
    renderPanel()
    await screen.findByText('Aucun soin enregistré.')

    await userEvent.click(within(careForm()).getByRole('button', { name: 'Nez' }))
    // The submit button shows « … » while sending: keep the reference taken before the click.
    const submit = save()
    await userEvent.click(submit)
    await userEvent.click(submit)

    expect(createMedicalCareAct).toHaveBeenCalledTimes(1)
    expect(submit).toBeDisabled()

    resolve({ nose: NOSE })
    // Back to the opening state once settled (nothing ticked), still a single act.
    await waitFor(() => expect(within(careForm()).getByRole('button', { name: 'Nez' })).toHaveAttribute('aria-pressed', 'false'))
    expect(createMedicalCareAct).toHaveBeenCalledTimes(1)
  })
})

describe('CarePanel — ouverture : le formulaire de soin d’aujourd’hui', () => {
  it('formulaire « Soin médical » : Yeux et Nez non cochés, « Quand » sur maintenant, aucun appel de lecture hors soins', async () => {
    renderPanel()
    await screen.findByText('Aucun soin enregistré.')

    const group = within(careForm()).getByRole('group', { name: 'Type de soin' })
    expect(within(group).getByRole('button', { name: 'Yeux' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(group).getByRole('button', { name: 'Nez' })).toHaveAttribute('aria-pressed', 'false')
    // Read the value then match it: toHaveValue does not take an asymmetric matcher.
    expect(within(careForm()).getByLabelText('Quand').value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(listTemperatures).not.toHaveBeenCalled()
    expect(listMedications).not.toHaveBeenCalled()
  })
})
