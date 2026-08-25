package com.suivibaby.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "temperature")
public class Temperature {

    @Id
    public UUID id;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Column(name = "occurred_at", nullable = false)
    public Instant occurredAt;

    // Tenths of a degree Celsius, primitive: the column is NOT NULL and the service always sets it.
    @Column(name = "temperature_celsius_x10", nullable = false)
    public int temperatureCelsiusX10;

    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
