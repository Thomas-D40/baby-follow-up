package com.suivibaby.repository;

import com.suivibaby.entity.BabyCaregiver;
import com.suivibaby.entity.BabyCaregiverId;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class BabyCaregiverRepository implements PanacheRepositoryBase<BabyCaregiver, BabyCaregiverId> {

    public boolean isLinked(UUID appUserId, UUID babyId) {
        return count("appUserId = ?1 and babyId = ?2", appUserId, babyId) > 0;
    }

    /** Vrai uniquement si l'utilisateur est lié à CE bébé ET en tant qu'owner (D8-G). */
    public boolean isOwner(UUID appUserId, UUID babyId) {
        return count("appUserId = ?1 and babyId = ?2 and isOwner = true", appUserId, babyId) > 0;
    }

    public List<UUID> findBabyIdsByUserId(UUID appUserId) {
        return find("appUserId", appUserId).stream().map(bc -> bc.babyId).toList();
    }

    /** Membres du cercle d'un bébé (D8-N). Bornée au bébé, jamais un annuaire global. */
    public List<BabyCaregiver> listByBaby(UUID babyId) {
        return list("babyId", babyId);
    }

    public BabyCaregiver findLink(UUID appUserId, UUID babyId) {
        return find("appUserId = ?1 and babyId = ?2", appUserId, babyId).firstResult();
    }

    public long countOwners(UUID babyId) {
        return count("babyId = ?1 and isOwner = true", babyId);
    }

    public void deleteLink(UUID appUserId, UUID babyId) {
        delete("appUserId = ?1 and babyId = ?2", appUserId, babyId);
    }

    /**
     * Création de lien idempotente en explicitant {@code is_owner} (D8-F/H/R5) : ne JAMAIS se reposer
     * sur le DEFAULT true de la colonne. {@code owner=true} à la création d'un bébé (le créateur),
     * {@code owner=false} à l'acceptation d'une invitation.
     */
    public void linkIdempotent(UUID appUserId, UUID babyId, boolean owner) {
        getEntityManager()
                .createNativeQuery("INSERT INTO baby_caregiver (app_user_id, baby_id, is_owner) "
                        + "VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING")
                .setParameter(1, appUserId)
                .setParameter(2, babyId)
                .setParameter(3, owner)
                .executeUpdate();
    }
}
