package com.suivibaby.model;

import java.time.Instant;
import java.util.UUID;

/**
 * Projection d'une sieste exposée au front (Épic 4). {@code endAt} = {@code null} tant que la sieste
 * est en cours (le front en déduit le bouton contextuel et masque l'édition de la fin, D4-F/D4-L).
 * Instants sérialisés en UTC (affichage Europe/Paris = Épic 6). {@code authorId} = auteur traçant (D4-I).
 */
public record NapResponse(UUID id, Instant startAt, Instant endAt, UUID authorId) {
}
