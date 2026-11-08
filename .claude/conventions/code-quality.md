# Conventions — propreté du code (Suivi Baby)

Référentiel du relecteur « propreté ». Il complète les conventions d'architecture et de nommage
(skill `suivi-baby-conventions` : couches, DTO/mapper, nommage, auth, Liquibase, tests) sans les
répéter. **Le code existant est la référence** : un ajout qui ressemble à ses voisins est correct par
défaut.

## 1. Principe : le juste milieu

Une classe a **un périmètre cohérent** (une ressource, un écran, un calcul), pas **une seule
méthode**. On ne découpe pas pour découper ; on découpe quand la lecture souffre.

| Signal | Seuil indicatif | Ce qu'on fait |
|---|---|---|
| Classe Java (service, controller) | > ~250 lignes | se demander si deux responsabilités cohabitent ; sinon, laisser |
| Composant React | > ~300 lignes | extraire un sous-composant **visuel** ou une **fonction pure** testable |
| Méthode / fonction | > ~30 lignes **ou** > 3 niveaux d'imbrication | extraire une étape nommée |
| Paramètres | > 4 | regrouper dans un DTO existant ou nouveau |
| Branches d'un `if/else`/`switch` | > ~5 | table de correspondance (`Map`, objet JS) |

Les seuils sont des **signaux**, pas des règles : une méthode de 35 lignes linéaire et lisible
passe ; une de 15 lignes à quatre conditions imbriquées ne passe pas.

## 2. Contre l'over-engineering

- **Cloner le patron voisin** (une ressource = controller + service + repository + mapper + DTO,
  comme `urine` / `nap`). Pas de nouvelle couche, pas de nouveau pattern pour un besoin qui se clone.
- **Pas d'interface à implémentation unique**, pas de factory/strategy/builder « au cas où ».
- **Règle de trois** : on factorise à la **troisième** occurrence, pas à la deuxième. Deux services
  qui se ressemblent restent deux services.
- Pas de paramètre, d'option ou de généricité qu'aucun appel n'utilise.
- Pas de gestion d'erreur pour un cas impossible ; pas de `try/catch` qui avale.

## 3. Contre la sous-structuration

- Pas de méthode **omnipotente** (valide + charge + calcule + mappe + persiste dans un bloc) :
  le service orchestre des étapes nommées (`requireLinked`, `validateStartAt`, …).
- Logique sujette aux bugs silencieux (dates, fuseaux, agrégats, réconciliation d'état) → **fonction
  pure** extraite et testée à part.
- Pas de duplication **à l'intérieur** d'un même fichier (constante, condition, formatage répétés).
- Pas de nombre magique : constante nommée (`DEFAULT_LIMIT`, `SKEW_MINUTES`).

## 4. Lisibilité

- Nommage explicite (cf. `suivi-baby-conventions` §3) ; booléens en `is…`/`has…`.
- **Commentaires du code neuf en anglais, `//` uniquement, jamais de javadoc/JSDoc.** Un commentaire
  dit **pourquoi**, jamais ce que la ligne fait. Les libellés d'UI restent en français.
- Pas de code mort, de `console.log`, de `System.out`, de `TODO` sans suite, d'import inutilisé.
- Les commentaires existants en français ne sont **pas** traduits en masse : on corrige là où on touche.

## 5. Front — découpage vue / service / modèle

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
- Styles dans `web/src/index.css` via les classes du design-system ; **pas de style inline**.
- Une classe partagée (ex. `.chip`) n'est jamais redéfinie : on ajoute un **modificateur**.

## 6. Tests

- Un test = un scénario d'AC nommé (`@Nested` / `describe` par scénario).
- Les tests réutilisent les fixtures (`AuthFixture`, `TestDataFactory`) plutôt que de reconstruire.
- Pas d'assertion sur un détail d'implémentation (classe CSS exacte, appel interne) quand une
  assertion sur le comportement visible existe (rôle, texte, statut HTTP).

## 7. Ce que le relecteur ne fait pas

- Il ne relit **que le diff** de la branche, pas le dépôt. Un défaut préexistant hors diff →
  « observation hors périmètre », jamais une correction demandée.
- Il ne réclame pas de refactor de l'existant pour un besoin qui se clone.
