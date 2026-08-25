package com.suivibaby.entity;

import com.suivibaby.model.CareType;
import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "medical_care")
public class MedicalCare {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Enumerated(EnumType.STRING)
    @Column(name = "care_type", nullable = false)
    public CareType careType;

    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
