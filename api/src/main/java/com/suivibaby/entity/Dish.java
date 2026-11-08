package com.suivibaby.entity;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "dish")
public class Dish {

    @Id
    public UUID id;

    @Column(name = "label", nullable = false)
    public String label;

    @Column(name = "normalized_label", nullable = false)
    public String normalizedLabel;

    @Column(name = "author_id", nullable = false)
    public UUID authorId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}
