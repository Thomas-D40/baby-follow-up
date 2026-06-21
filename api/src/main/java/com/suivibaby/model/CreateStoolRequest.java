package com.suivibaby.model;

import java.time.Instant;

/**
 * Charge de création d'une selle (US5.1). {@code occurredAt} optionnel (défaut = now si absent),
 * ISO-8601 avec offset → instant UTC (D3-D / D5-D). {@code consistency} optionnelle ; une valeur hors
 * enum échoue à la désérialisation JSON → 400 (D5-E). Aucun champ requis : un corps vide crée une
 * selle horodatée à « maintenant », sans consistance.
 */
public record CreateStoolRequest(Instant occurredAt, StoolConsistency consistency) {
}
