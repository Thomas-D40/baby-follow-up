package com.suivibaby.entity;

import com.suivibaby.model.VitaminType;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * État-jour « vitamine donnée » (US9.1, D9-A) : la **présence** d'une ligne = donnée pour un
 * (bébé, type, jour) ; son absence = non donnée. Ni heure, ni dose. L'unicité
 * (baby_id, vitamin_type, given_on) rend le doublon impossible par construction (D9-G).
 */
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
