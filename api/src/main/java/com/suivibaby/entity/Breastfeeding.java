package com.suivibaby.entity;

import com.suivibaby.model.BreastSide;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "breastfeeding")
public class Breastfeeding {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "side")
    public BreastSide side;

    @Column(name = "duration_minutes")
    public Integer durationMinutes;

    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
