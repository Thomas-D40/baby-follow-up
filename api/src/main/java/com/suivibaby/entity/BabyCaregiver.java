package com.suivibaby.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.util.UUID;

/**
 * N-N parent↔baby link. Binary (no caregiver role, D-E). The composite primary key guarantees
 * idempotent linking (US1.4); the membership filter (US1.5) relies on it. Data access goes
 * through {@code BabyCaregiverRepository}.
 */
@Entity
@Table(name = "baby_caregiver")
@IdClass(BabyCaregiverId.class)
public class BabyCaregiver {

    @Id
    @Column(name = "app_user_id")
    public UUID appUserId;

    @Id
    @Column(name = "baby_id")
    public UUID babyId;
}
