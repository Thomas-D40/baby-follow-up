package com.suivibaby.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Single-use activation token (US1.2). At most one active per user (partial unique index
 * {@code WHERE used_at IS NULL}): regeneration invalidates the previous one by setting
 * {@code usedAt}. Data access goes through {@code ActivationTokenRepository}.
 */
@Entity
@Table(name = "activation_token")
public class ActivationToken {

    @Id
    public UUID token;

    @Column(name = "app_user_id", nullable = false)
    public UUID appUserId;

    @Column(name = "expires_at", nullable = false)
    public Instant expiresAt;

    /** Null until the token has been used; set on activation or regeneration. */
    @Column(name = "used_at")
    public Instant usedAt;

    public boolean isExpired(Instant now) {
        return expiresAt.isBefore(now);
    }

    public boolean isConsumed() {
        return usedAt != null;
    }
}
