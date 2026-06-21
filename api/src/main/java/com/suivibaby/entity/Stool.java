package com.suivibaby.entity;

import com.suivibaby.model.StoolConsistency;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Selle (US5.1) — événement ponctuel (Épic 5), même forme que {@link BottleFeeding}. Rattachée à un
 * bébé via {@code baby_id} (FK ON DELETE CASCADE) ; l'accès est borné par l'appartenance au bébé
 * (D5-C), filtrée au service. Accès données via {@code StoolRepository}.
 */
@Entity
@Table(name = "stool")
public class Stool {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    /** Instant UTC (D3-D / D5-D) : le front envoie de l'ISO-8601 avec offset, stocké normalisé en UTC. */
    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    /** Optionnelle. Stockée en TEXT ("hard"/"soft"/"liquid") ; validée par l'enum, pas par un CHECK DB (D5-E). */
    @Enumerated(EnumType.STRING)
    @Column(name = "consistency")
    public StoolConsistency consistency;

    /** Utilisateur ayant saisi l'événement — purement traçant (D5-H), resservira à l'Épic 6. */
    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
