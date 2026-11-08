# Conventions — propreté du code (Suivi Baby)

Complète les principes génériques de la pipeline (juste milieu, anti over-engineering, relecture du
seul diff) avec ce qui est **propre à ce projet**. Les conventions d'architecture et de nommage
(couches, DTO/mapper, auth, Liquibase) sont dans le skill `suivi-baby-conventions`. En cas de
conflit, ce fichier prime sur les principes génériques.

Les règles vérifiables mécaniquement sont aussi dans [`checks.tsv`](checks.tsv), contrôlées
automatiquement sur le diff avant les relecteurs.

## 1. Seuils calibrés sur le dépôt

Les seuils génériques s'appliquent : services Java ≤ ~200 lignes aujourd'hui (`NapService` est le
plus gros), plus gros écran `CalendarPanel.jsx` à 340 lignes — **ne pas dépasser** ce plafond, et
viser ~300 pour un écran neuf.

## 2. Patrons à cloner

- **Back** : une ressource = controller + service + repository + mapper + DTO, comme `urine` ou `nap`.
- **Front** : un panneau = écran + formulaire en bottom sheet, comme `DiaperChangePanel`.

## 3. Commentaires

**Code neuf : commentaires en anglais, `//` uniquement, jamais de javadoc/JSDoc.** Les libellés d'UI
restent en français. Les commentaires existants en français ne sont **pas** traduits en masse : on
corrige là où on touche. Les directives Liquibase (`--changeset …`) ne sont pas des commentaires.

## 4. Front — découpage vue / service / modèle

Cible (décidée le 2026-11-08) : la **vue ne fait qu'afficher** et appelle un service pour obtenir ses
données et déclencher ses actions.

| Couche | Emplacement | Contenu | Interdit |
|---|---|---|---|
| **Vue** | `web/src/screens/*.jsx` | JSX, état purement visuel (onglet ouvert, sheet affichée), branchement des handlers | `useQuery`/`useMutation`/`useQueryClient`, import de `api/*`, calcul métier |
| **Service** | `web/src/services/<domaine>.js` | hooks `use…` : requêtes, mutations, clés de cache, invalidation, dérivations de données pour l'écran | JSX |
| **Modèle** | `web/src/<domaine>.js` (fonctions pures) + `web/src/api/*` (HTTP) | formatage, calculs, réconciliation d'état ; appels réseau | React |

- Un hook de service est **réutilisable** entre écrans : deux écrans qui lisent les mêmes données
  appellent le même hook, ils ne dupliquent pas la requête ni sa clé de cache.
- **Transition** : la règle s'impose au **code neuf** (nouvel écran, nouveau domaine). Les écrans
  existants, qui appellent encore React Query directement, ne sont **pas** restructurés au passage
  d'une feature : une passe de refacto dédiée les alignera. Le relecteur classe donc un accès aux
  données dans une vue **neuve** comme bloquant, et le même motif dans une vue existante comme
  observation hors périmètre.

## 5. Styles

- Styles dans `web/src/index.css` via les classes du design-system ; **pas de style inline**.
- Une classe partagée (ex. `.chip`) n'est jamais redéfinie : on ajoute un **modificateur**.

## 6. Tests

- Back : un `@Nested` par scénario d'AC ; fixtures `AuthFixture` / `TestDataFactory`.
- Front : un `describe` par scénario ; sélection par rôle et nom accessible plutôt que par classe CSS.
- Pièges connus du front (jsdom / jest-dom) :
  - pendant l'envoi, un bouton de soumission affiche « … » : un test anti double-tap **garde la
    référence** du bouton obtenue avant le clic, il ne le recherche pas par « Enregistrer » ;
  - `toHaveValue` n'accepte pas de matcher asymétrique (`expect.stringMatching`) : lire la valeur du
    champ et utiliser `toMatch` ;
  - un `<input type="number">` vide une saisie à virgule (`12,5`) : le cas « virgule » se teste sur la
    fonction de lecture du modèle (ex. `parseQuantity`), pas sur le formulaire.
