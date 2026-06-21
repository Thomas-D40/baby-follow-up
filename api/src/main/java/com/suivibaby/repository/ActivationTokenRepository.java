package com.suivibaby.repository;

import com.suivibaby.entity.ActivationToken;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.UUID;

/** Activation token access. */
@ApplicationScoped
public class ActivationTokenRepository implements PanacheRepositoryBase<ActivationToken, UUID> {

    /**
     * Invalidates every active (unused) token of the user. Enforces "at most one active per user"
     * before issuing a new token.
     */
    public long invalidateActiveTokens(UUID appUserId, Instant now) {
        return update("usedAt = ?1 where appUserId = ?2 and usedAt is null", now, appUserId);
    }
}
