package com.suivibaby.entity;

import com.suivibaby.model.Sex;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "baby")
public class Baby {

    @Id
    public UUID id;

    @Column(name = "first_name", nullable = false)
    public String firstName;

    @Column(name = "birth_date")
    public LocalDate birthDate;

    @Enumerated(EnumType.STRING)
    public Sex sex;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
