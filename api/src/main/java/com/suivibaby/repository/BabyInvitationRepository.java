package com.suivibaby.repository;

import com.suivibaby.entity.BabyInvitation;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.UUID;

@ApplicationScoped
public class BabyInvitationRepository implements PanacheRepositoryBase<BabyInvitation, UUID> {

    /**
     * Invalide les invitations actives (non consommées) d'un bébé avant d'en émettre une nouvelle :
     * l'index partiel {@code uq_active_baby_invitation} n'autorise qu'une invit active par bébé.
     * Calque {@code ActivationTokenRepository.invalidateActiveTokens} (D8-C/K).
     */
    public long invalidateActiveInvitations(UUID babyId, Instant now) {
        return update("usedAt = ?1 where babyId = ?2 and usedAt is null", now, babyId);
    }
}
