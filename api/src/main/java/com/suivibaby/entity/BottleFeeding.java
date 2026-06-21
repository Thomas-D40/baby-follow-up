package com.suivibaby.entity;

import com.suivibaby.model.MilkType;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Biberon donné (US3.1) — 1ʳᵉ table d'événement (Épic 3). Rattaché à un bébé via {@code baby_id}
 * (FK ON DELETE CASCADE, D2-H) ; l'accès est borné par l'appartenance au bébé (D3-C), filtrée au
 * service. Accès données via {@code BottleFeedingRepository}.
 */
@Entity
@Table(name = "bottle_feeding")
public class BottleFeeding {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    /** Instant UTC (D3-D) : le front envoie de l'ISO-8601 avec offset, stocké normalisé en UTC. */
    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    /** Borné applicativement 0 &lt; q ≤ 2000 (D3-E), pas de CHECK DB. */
    @Column(name = "quantity_ml", nullable = false)
    public int quantityMl;

    /** Optionnel. Stocké en TEXT ("breast"/"formula") ; validé par l'enum, pas par un CHECK DB (D3-F). */
    @Enumerated(EnumType.STRING)
    @Column(name = "milk_type")
    public MilkType milkType;

    /** Utilisateur ayant saisi l'événement — purement traçant (D3-I), resservira à l'Épic 6. */
    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
