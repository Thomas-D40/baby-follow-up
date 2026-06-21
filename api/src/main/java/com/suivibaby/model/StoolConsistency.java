package com.suivibaby.model;

/**
 * Consistance d'une selle (US5.1, D5-E). Enum applicatif fermé validé côté Java/ORM ; la colonne DB
 * reste {@code TEXT} (pas de type Postgres → extension future = ajouter une constante, sans
 * {@code ALTER TYPE}). Constantes en minuscules : le stockage comme la sérialisation JSON lisent
 * {@code "hard"}/{@code "soft"}/{@code "liquid"} (prose : dure / molle / liquide). Champ optionnel :
 * {@code null} = non renseigné. Une valeur hors enum échoue à la désérialisation JSON → 400.
 * NB : la <em>couleur</em> est volontairement hors périmètre v1 (D5-F).
 */
public enum StoolConsistency {
    hard,
    soft,
    liquid
}
