package com.suivibaby.repository;

import com.suivibaby.entity.BabyInvitation;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class BabyInvitationRepository implements PanacheRepositoryBase<BabyInvitation, UUID> {

    // Voids every active invitation of a baby, whoever the recipient is. Kept for the admin revocation
    // (D8-K); emission only voids the invitation of the same recipient (see below).
    // Mirrors ActivationTokenRepository.invalidateActiveTokens.
    public long invalidateActiveInvitations(UUID babyId, Instant now) {
        return update("usedAt = ?1 where babyId = ?2 and usedAt is null", now, babyId);
    }

    // The partial index uq_active_baby_invitation allows one active invitation per (baby, recipient):
    // re-inviting someone voids only that person's previous link (D17-I).
    public long invalidateActiveInvitationsForInvitee(UUID babyId, UUID inviteeUserId, Instant now) {
        return update("usedAt = ?1 where babyId = ?2 and inviteeUserId = ?3 and usedAt is null",
                now, babyId, inviteeUserId);
    }
}
