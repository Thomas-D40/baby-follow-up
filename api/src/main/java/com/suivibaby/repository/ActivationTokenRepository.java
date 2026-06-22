package com.suivibaby.repository;

import com.suivibaby.entity.ActivationToken;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class ActivationTokenRepository implements PanacheRepositoryBase<ActivationToken, UUID> {

    public long invalidateActiveTokens(UUID appUserId, Instant now) {
        return update("usedAt = ?1 where appUserId = ?2 and usedAt is null", now, appUserId);
    }
}
