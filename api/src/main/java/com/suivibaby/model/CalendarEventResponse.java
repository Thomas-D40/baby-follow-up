package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Projection unifiée et plate d'un événement du jour (Épic 6, US6.1, D6-H). Un seul type commun rend
 * la liste hétérogène (biberon/sieste/selle) triable par heure. Les champs hors-type valent {@code null} :
 * {@code quantityMl}/{@code milkType} (biberon), {@code endAt} (sieste — {@code null} = en cours),
 * {@code consistency} (selle). {@code startAt} = {@code occurred_at} (points) ou {@code start_at} (sieste).
 * {@code type}+{@code id} routent l'édition vers le bon endpoint (Épic 7). Instants sérialisés en UTC,
 * affichés en Europe/Paris côté front (D6-D).
 */
public record CalendarEventResponse(CalendarEventType type, UUID id, Instant startAt, Instant endAt,
                                    UUID authorId, Integer quantityMl, MilkType milkType,
                                    StoolConsistency consistency) {
}
