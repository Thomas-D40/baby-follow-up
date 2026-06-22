package com.suivibaby.entity;

import com.suivibaby.model.MilkType;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "bottle_feeding")
public class BottleFeeding {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    @Column(name = "quantity_ml", nullable = false)
    public int quantityMl;

    @Enumerated(EnumType.STRING)
    @Column(name = "milk_type")
    public MilkType milkType;

    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
