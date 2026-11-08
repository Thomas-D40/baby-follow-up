import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SolidMealForm from './SolidMealForm'

// The form searches the dish list (services/dishes), so it needs a QueryClientProvider and the
// searchDishes client; a vi.mock factory throws on access to an undeclared export.
vi.mock('../api', () => ({
  searchDishes: vi.fn(),
}))
import { searchDishes } from '../api'

function renderForm(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined)
  return {
    onSubmit,
    ...render(<QueryClientProvider client={qc}><SolidMealForm {...props} onSubmit={onSubmit} /></QueryClientProvider>),
  }
}

const dish = () => screen.getByLabelText('Plat')
const save = () => screen.getByRole('button', { name: 'Enregistrer' })
const proposals = () => screen.getByRole('group', { name: 'Propositions de plats' })
const portions = () => screen.getByRole('group', { name: 'Portion' })
const portion = (name) => within(portions()).getByRole('button', { name })

beforeEach(() => {
  vi.clearAllMocks()
  searchDishes.mockResolvedValue({ items: [], exactMatch: false })
})

describe('SolidMealForm — saisie d’un repas (US18.3)', () => {
  it('le champ Plat est un texte libre, sans maxLength (le message de longueur doit rester atteignable)', () => {
    renderForm()

    expect(dish()).toHaveAttribute('type', 'text')
    expect(dish()).not.toHaveAttribute('maxlength')
  })

  it('rien de tapé : le groupe « Propositions de plats » ne porte que Purée puis Compote', () => {
    renderForm()

    expect(within(proposals()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Purée', 'Compote'])
  })

  it('aucune portion enfoncée à l’ouverture', () => {
    renderForm()

    ;['Goûté', 'La moitié', 'Tout'].forEach((name) => {
      expect(portion(name)).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('Purée en un toucher', () => {
    it('toucher « Purée » remplit le champ ; Enregistrer envoie { dish: Purée, portion: null, addToDishes: false }', async () => {
      const { onSubmit } = renderForm()

      await userEvent.click(within(proposals()).getByRole('button', { name: 'Purée' }))
      expect(dish()).toHaveValue('Purée')
      await userEvent.click(save())

      expect(onSubmit).toHaveBeenCalledTimes(1)
      expect(onSubmit.mock.calls[0][0]).toEqual({
        occurredAt: expect.any(String), dish: 'Purée', portion: null, addToDishes: false,
      })
    })

    it('toucher « Compote » remplit le champ avec Compote', async () => {
      renderForm()

      await userEvent.click(within(proposals()).getByRole('button', { name: 'Compote' }))

      expect(dish()).toHaveValue('Compote')
    })
  })

  describe('plat libre + portion', () => {
    it('« Purée de carottes » + « La moitié » → portion: half', async () => {
      const { onSubmit } = renderForm()

      await userEvent.type(dish(), 'Purée de carottes')
      await userEvent.click(portion('La moitié'))
      expect(portion('La moitié')).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(save())

      expect(onSubmit.mock.calls[0][0]).toEqual({
        occurredAt: expect.any(String), dish: 'Purée de carottes', portion: 'half', addToDishes: false,
      })
    })

    it('toucher une autre portion bascule : une seule enfoncée', async () => {
      renderForm()

      await userEvent.click(portion('Goûté'))
      await userEvent.click(portion('Tout'))

      expect(portion('Goûté')).toHaveAttribute('aria-pressed', 'false')
      expect(portion('Tout')).toHaveAttribute('aria-pressed', 'true')
    })

    it('toucher la portion enfoncée la relâche : payload portion: null', async () => {
      const { onSubmit } = renderForm()

      await userEvent.type(dish(), 'Compote')
      await userEvent.click(portion('Tout'))
      await userEvent.click(portion('Tout'))
      expect(portion('Tout')).toHaveAttribute('aria-pressed', 'false')
      await userEvent.click(save())

      expect(onSubmit.mock.calls[0][0].portion).toBeNull()
    })
  })

  describe('plat obligatoire', () => {
    it.each(['', '   '])('plat « %s » → « Indiquez le plat. », onSubmit non appelé', async (raw) => {
      const { onSubmit } = renderForm()

      if (raw) await userEvent.type(dish(), raw)
      await userEvent.click(save())

      expect(screen.getByText('Indiquez le plat.')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe('plat trop long', () => {
    it('61 caractères → « Le plat ne doit pas dépasser 60 caractères. », onSubmit non appelé', async () => {
      const { onSubmit } = renderForm()

      fireEvent.change(dish(), { target: { value: 'x'.repeat(61) } })
      await userEvent.click(save())

      expect(screen.getByText('Le plat ne doit pas dépasser 60 caractères.')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('60 caractères sont acceptés', async () => {
      const { onSubmit } = renderForm()

      fireEvent.change(dish(), { target: { value: 'x'.repeat(60) } })
      await userEvent.click(save())

      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
  })

  it('le plat est envoyé mis en forme : bords retirés, blancs répétés réduits', async () => {
    const { onSubmit } = renderForm()

    fireEvent.change(dish(), { target: { value: '  Compote   Pomme-poire ' } })
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0].dish).toBe('Compote Pomme-poire')
  })

  it('après succès en création, le plat et la portion sont vidés', async () => {
    renderForm()

    await userEvent.type(dish(), 'Compote')
    await userEvent.click(portion('Goûté'))
    await userEvent.click(save())

    await waitFor(() => expect(dish()).toHaveValue(''))
    expect(portion('Goûté')).toHaveAttribute('aria-pressed', 'false')
  })

  it('désactive le bouton pendant la soumission : deux clics, un seul appel (anti double-tap)', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    renderForm({ onSubmit })

    await userEvent.type(dish(), 'Compote')
    // Keep the element: while busy its label turns to « … », like every other form.
    const btn = save()
    await userEvent.click(btn)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(btn).toBeDisabled()

    await userEvent.click(btn)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolve()
    await waitFor(() => expect(btn).not.toBeDisabled())
    expect(btn).toHaveAccessibleName('Enregistrer')
  })

  it('erreur serveur 400 → « Données invalides. » ; autre erreur → « Échec de l’enregistrement. »', async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('-> 400'), { status: 400 }))
      .mockRejectedValueOnce(Object.assign(new Error('-> 500'), { status: 500 }))
    renderForm({ onSubmit })

    await userEvent.type(dish(), 'Compote')
    await userEvent.click(save())
    expect(await screen.findByText('Données invalides.')).toBeInTheDocument()

    await userEvent.click(save())
    expect(await screen.findByText('Échec de l\'enregistrement.')).toBeInTheDocument()
  })
})

describe('SolidMealForm — heure pilotée par la feuille (D18-AL)', () => {
  it('affiche `time`, signale les changements et soumet cette heure', async () => {
    const onTimeChange = vi.fn()
    const { onSubmit } = renderForm({ time: '2026-11-08T14:00', onTimeChange })

    expect(screen.getByLabelText('Quand')).toHaveValue('2026-11-08T14:00')
    fireEvent.change(screen.getByLabelText('Quand'), { target: { value: '2026-11-08T15:30' } })
    expect(onTimeChange).toHaveBeenCalledWith('2026-11-08T15:30')

    await userEvent.type(dish(), 'Compote')
    await userEvent.click(save())
    expect(onSubmit.mock.calls[0][0].occurredAt).toBe(new Date('2026-11-08T14:00').toISOString())
  })
})

describe('SolidMealForm — mode édition (US18.3, D18-AR)', () => {
  const INITIAL = { occurredAt: '2026-06-21T08:30:00.000Z', dish: 'Purée de carrotes', portion: 'all' }

  it('préremplit le plat, la portion et l’heure depuis `initial`', () => {
    renderForm({ initial: INITIAL })

    expect(dish()).toHaveValue('Purée de carrotes')
    expect(portion('Tout')).toHaveAttribute('aria-pressed', 'true')
    expect(portion('La moitié')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Quand').value).not.toBe('')
  })

  it('le patch porte { occurredAt, dish, portion } et AUCUN drapeau addToDishes', async () => {
    const { onSubmit } = renderForm({ initial: INITIAL })

    fireEvent.change(dish(), { target: { value: 'Purée de carottes' } })
    await userEvent.click(portion('Tout')) // releases the portion
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), dish: 'Purée de carottes', portion: null,
    })
    expect(Object.keys(onSubmit.mock.calls[0][0]).sort()).toEqual(['dish', 'occurredAt', 'portion'])
  })

  it('les champs ne sont pas réinitialisés après succès', async () => {
    renderForm({ initial: INITIAL })

    await userEvent.click(save())
    await waitFor(() => expect(save()).not.toBeDisabled())

    expect(dish()).toHaveValue('Purée de carrotes')
    expect(portion('Tout')).toHaveAttribute('aria-pressed', 'true')
  })

  it('le plat reste obligatoire à l’édition', async () => {
    const { onSubmit } = renderForm({ initial: INITIAL })

    fireEvent.change(dish(), { target: { value: '  ' } })
    await userEvent.click(save())

    expect(screen.getByText('Indiquez le plat.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('aucune case « Ajouter à mes plats », quel que soit le résultat de la recherche (D18-AR)', async () => {
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
    renderForm({ initial: INITIAL })

    fireEvent.change(dish(), { target: { value: 'Yaourt à la vanille' } })
    await waitFor(() => expect(searchDishes).toHaveBeenCalledWith('Yaourt à la vanille'))

    expect(screen.queryByRole('checkbox', { name: 'Ajouter à mes plats' })).toBeNull()
    expect(screen.queryByText('Ce plat sera proposé à tous les utilisateurs')).toBeNull()
  })

  it('les propositions du référentiel restent offertes à l’édition', async () => {
    searchDishes.mockResolvedValue({ items: [{ id: 'd1', label: 'Purée de carottes' }], exactMatch: false })
    renderForm({ initial: INITIAL })

    expect(await within(proposals()).findByRole('button', { name: 'Purée de carottes' })).toBeInTheDocument()
  })
})

describe('SolidMealForm — propositions du référentiel (US18.4, D18-U)', () => {
  const SUGGESTIONS = [
    { id: 'd1', label: 'Carottes râpées' },
    { id: 'd2', label: 'Purée de carottes' },
  ]

  it('en tapant : Purée, Compote, puis les résultats dans l’ordre reçu', async () => {
    searchDishes.mockResolvedValue({ items: SUGGESTIONS, exactMatch: false })
    renderForm()

    await userEvent.type(dish(), 'car')

    await waitFor(() => expect(within(proposals()).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Purée', 'Compote', 'Carottes râpées', 'Purée de carottes']))
    expect(searchDishes.mock.calls.at(-1)[0]).toBe('car')
  })

  it('rien de tapé : seulement Purée et Compote, aucune recherche', async () => {
    renderForm()

    expect(within(proposals()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Purée', 'Compote'])
    expect(searchDishes).not.toHaveBeenCalled()
  })

  it('choisir une proposition remplit le champ ; Enregistrer envoie ce plat', async () => {
    searchDishes.mockResolvedValue({ items: SUGGESTIONS, exactMatch: false })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'car')

    await userEvent.click(await within(proposals()).findByRole('button', { name: 'Purée de carottes' }))
    expect(dish()).toHaveValue('Purée de carottes')
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0].dish).toBe('Purée de carottes')
  })

  it('un libellé de proposition est rendu comme du texte, jamais interprété', async () => {
    searchDishes.mockResolvedValue({ items: [{ id: 'x', label: '<b>gras</b>' }], exactMatch: false })
    renderForm()
    await userEvent.type(dish(), 'gras')

    expect(await within(proposals()).findByRole('button', { name: '<b>gras</b>' })).toBeInTheDocument()
  })
})

describe('SolidMealForm — case « Ajouter à mes plats » (US18.4, D18-AF/D18-AG)', () => {
  const addBox = () => screen.queryByRole('checkbox', { name: 'Ajouter à mes plats' })
  const MENTION = 'Ce plat sera proposé à tous les utilisateurs'

  it('avant toute frappe : pas de case', () => {
    renderForm()

    expect(addBox()).toBeNull()
  })

  it('un plat libre inconnu du référentiel : case décochée + mention', async () => {
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
    renderForm()

    await userEvent.type(dish(), 'Gratin de courgettes')

    await waitFor(() => expect(addBox()).toBeInTheDocument())
    expect(addBox()).not.toBeChecked()
    expect(screen.getByText(MENTION)).toBeInTheDocument()
  })

  it('un plat déjà présent (exactMatch vrai) : pas de case', async () => {
    searchDishes.mockResolvedValue({ items: [{ id: 'd1', label: 'Purée de carottes' }], exactMatch: true })
    renderForm()

    await userEvent.type(dish(), 'purée de carottes')
    await waitFor(() => expect(searchDishes).toHaveBeenCalled())

    await waitFor(() => expect(within(proposals()).getByRole('button', { name: 'Purée de carottes' })).toBeInTheDocument())
    expect(addBox()).toBeNull()
    expect(screen.queryByText(MENTION)).toBeNull()
  })

  it.each(['Purée', 'Compote'])('toucher « %s » : jamais de case', async (name) => {
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
    renderForm()

    await userEvent.click(within(proposals()).getByRole('button', { name }))
    await waitFor(() => expect(searchDishes).toHaveBeenCalled())

    expect(addBox()).toBeNull()
  })

  it('recherche pendante : la case n’est pas proposée avant la réponse', async () => {
    searchDishes.mockReturnValue(new Promise(() => {}))
    renderForm()

    await userEvent.type(dish(), 'Gratin')
    await waitFor(() => expect(searchDishes).toHaveBeenCalled())

    expect(addBox()).toBeNull()
  })

  it('cochée : le corps envoyé porte addToDishes: true', async () => {
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'Gratin de courgettes')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))

    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), dish: 'Gratin de courgettes', portion: null, addToDishes: true,
    })
  })

  it('décochée (défaut) : addToDishes: false', async () => {
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'Gratin de courgettes')
    await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' })

    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0].addToDishes).toBe(false)
  })

  it('une case masquée n’envoie jamais true : cochée puis plat devenu existant → addToDishes: false', async () => {
    searchDishes.mockImplementation(async (q) => (
      q === 'Yaourt nature'
        ? { items: [{ id: 'd1', label: 'Yaourt nature' }], exactMatch: true }
        : { items: [], exactMatch: false }
    ))
    const { onSubmit } = renderForm()
    await userEvent.type(dish(), 'Yaourt')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))

    await userEvent.type(dish(), ' nature')
    await waitFor(() => expect(addBox()).toBeNull())
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0].addToDishes).toBe(false)
  })

  it('après un enregistrement réussi, la case revient décochée pour le plat suivant', async () => {
    searchDishes.mockResolvedValue({ items: [], exactMatch: false })
    renderForm()
    await userEvent.type(dish(), 'Gratin')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' }))
    await userEvent.click(save())
    await waitFor(() => expect(dish()).toHaveValue(''))

    await userEvent.type(dish(), 'Soupe')

    expect(await screen.findByRole('checkbox', { name: 'Ajouter à mes plats' })).not.toBeChecked()
  })
})
