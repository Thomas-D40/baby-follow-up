package com.suivibaby.entity;

import com.suivibaby.model.VitaminType;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "vitamin_intake")
public class VitaminIntake {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Enumerated(EnumType.STRING)
    @Column(name = "vitamin_type", nullable = false)
    public VitaminType vitaminType;

    @Column(name = "given_on", nullable = false)
    public LocalDate givenOn;

    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
