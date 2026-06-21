package com.suivibaby.model;

import java.time.Instant;

/**
 * Charge de création d'un biberon (US3.1). {@code occurredAt} optionnel (défaut = now si absent),
 * ISO-8601 avec offset → instant UTC (D3-D). {@code quantityMl} requis et borné {@code 0 < q ≤ 2000}
 * (D3-E) — validé au service (400 si null/hors-bornes). {@code milkType} optionnel ; une valeur hors
 * enum échoue à la désérialisation JSON → 400 (D3-F).
 */
public record CreateBottleFeedingRequest(Instant occurredAt, Integer quantityMl, MilkType milkType) {
}
