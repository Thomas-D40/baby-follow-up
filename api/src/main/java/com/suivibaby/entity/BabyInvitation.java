package com.suivibaby.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Invitation de partage d'un bébé (Épic 8). Token usage-unique, calqué sur {@code ActivationToken}
 * (D8-C). L'expiration est vérifiée applicativement (now() non immutable, hors index partiel).
 */
@Entity
@Table(name = "baby_invitation")
public class BabyInvitation {

    @Id
    public UUID token;

    @Column(name = "baby_id", nullable = false)
    public UUID babyId;

    @Column(name = "created_by", nullable = false)
    public UUID createdBy;

    @Column(name = "expires_at", nullable = false)
    public Instant expiresAt;

    @Column(name = "used_at")
    public Instant usedAt;

    @Column(name = "accepted_by")
    public UUID acceptedBy;

    public boolean isExpired(Instant now) {
        return expiresAt.isBefore(now);
    }

    public boolean isConsumed() {
        return usedAt != null;
    }
}
