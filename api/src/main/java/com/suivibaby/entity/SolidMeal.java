package com.suivibaby.entity;

import com.suivibaby.model.MealPortion;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "solid_meal")
public class SolidMeal {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    @Column(name = "dish", nullable = false)
    public String dish;

    @Enumerated(EnumType.STRING)
    @Column(name = "portion")
    public MealPortion portion;

    @Column(name = "author_id")
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
