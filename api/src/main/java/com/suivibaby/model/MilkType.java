package com.suivibaby.model;

/**
 * Type de lait d'un biberon (US3.1, D3-F). Enum applicatif fermé validé côté Java/ORM ; la colonne
 * DB reste {@code TEXT} (pas de type Postgres → extension future = ajouter une constante, sans
 * {@code ALTER TYPE}). Constantes en minuscules : le stockage comme la sérialisation JSON lisent
 * {@code "breast"}/{@code "formula"}. Champ optionnel : {@code null} = non renseigné. Une valeur
 * hors enum échoue à la désérialisation JSON → 400. Extensions probables (non livrées) : {@code mixed},
 * {@code water}.
 */
public enum MilkType {
    breast,
    formula
}
