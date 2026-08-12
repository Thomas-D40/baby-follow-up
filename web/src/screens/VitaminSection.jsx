import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getVitamins, setVitamin, unsetVitamin } from '../api'
import { vitaminItems, vitaminLabel } from '../vitamin'

/**
 * Section « Vitamines » du récap jour (US9.1, D9-H) : une case à cocher par type (d/k). État-jour
 * idempotent (D9-A) — cocher = `setVitamin` (POST 200), décocher = `unsetVitamin` (DELETE 204).
 *
 * - Requête `['babies', babyId, 'vitamins', date]`, **invalidée par préfixe** `['babies', babyId]`
 *   après chaque toggle (D7-C) → cohérent avec les totaux/événements du même jour.
 * - **Anti-double-saisie** (D9-G) : les cases se désactivent pendant l'écriture ; `retry: 0`.
 * - « Case décochée = non donnée = non renseignée » (décision produit, cf. §6 du plan) : pas de
 *   distinction, pas de garde-fou anti-surdosage — une rubrique de cases, ni plus ni moins.
 * - **Remontée d'erreur** : échec de chargement (`getVitamins`) ou de toggle → message `role="alert"`
 *   (jamais avaler un échec en silence). La case reste pilotée par l'état serveur : un toggle échoué
 *   ne la change pas.
 */
export default function VitaminSection({ babyId, date }) {
  const qc = useQueryClient()

  const vitaminsQuery = useQuery({
    queryKey: ['babies', babyId, 'vitamins', date],
    queryFn: () => getVitamins(babyId, date),
  })

  const toggle = useMutation({
    mutationFn: ({ type, given }) =>
      given ? setVitamin(babyId, type, date) : unsetVitamin(babyId, type, date),
    retry: 0,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['babies', babyId] }),
  })

  const items = vitaminItems(vitaminsQuery.data)

  return (
    <div className="vitamins">
      <span className="vitamins-title">Vitamines</span>
      {vitaminsQuery.isError ? (
        <p role="alert" className="error-text">Vitamines indisponibles.</p>
      ) : (
        <>
          <ul className="vitamin-list">
            {items.map((it) => (
              <li key={it.vitaminType}>
                <label className="vitamin-check">
                  <input
                    type="checkbox"
                    checked={it.given}
                    disabled={toggle.isPending}
                    onChange={(e) => toggle.mutate({ type: it.vitaminType, given: e.target.checked })}
                  />
                  <span>{vitaminLabel(it.vitaminType)}</span>
                </label>
              </li>
            ))}
          </ul>
          {toggle.isError && <p role="alert" className="error-text">Échec de l'enregistrement.</p>}
        </>
      )}
    </div>
  )
}
