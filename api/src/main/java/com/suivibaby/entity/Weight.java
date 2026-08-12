package com.suivibaby.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "weight")
public class Weight {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Column(name = "given_on", nullable = false)
    public LocalDate givenOn;

    @Column(name = "weight_grams", nullable = false)
    public int weightGrams;

    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
