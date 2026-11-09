package com.suivibaby.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "medication")
public class Medication {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    @Column(name = "medication_name", nullable = false)
    public String medicationName;

    @Column(name = "dosage")
    public String dosage;

    @Column(name = "author_id")
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
