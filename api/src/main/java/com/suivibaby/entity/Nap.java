package com.suivibaby.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Sieste (Épic 4) — 1ᵉʳ événement à état : un seul enregistrement, ouvert au début ({@code end_at}
 * NULL) puis mis à jour à la fin (D7 / D4-A). Au plus une sieste ouverte par bébé, garanti par l'index
 * unique partiel {@code uq_open_nap WHERE end_at IS NULL} (D4-C). Rattachée à un bébé via
 * {@code baby_id} (FK ON DELETE CASCADE) ; accès borné par l'appartenance (D4-G), filtré au service.
 */
@Entity
@Table(name = "nap")
public class Nap {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    /** Instant UTC (D3-D) : le front envoie de l'ISO-8601 avec offset, stocké normalisé en UTC. */
    @Column(name = "start_at", nullable = false)
    public Instant startAt;

    /** NULL tant que la sieste est ouverte ; posé à la fin (D4-A). La durée se dérive (end − start). */
    @Column(name = "end_at")
    public Instant endAt;

    /** Utilisateur ayant démarré la sieste — purement traçant (D4-I), non réécrit par end/reopen. */
    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
