package com.suivibaby.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Tracked baby. Introduced in Epic 1 (D-B) to unblock linking (US1.4) and isolation (US1.5).
 * Functional management (creation via UI/endpoint) comes in Epic 2.
 */
@Entity
@Table(name = "baby")
public class Baby {

    @Id
    public UUID id;

    @Column(name = "first_name", nullable = false)
    public String firstName;

    @Column(name = "birth_date")
    public LocalDate birthDate;

    public String sex;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
