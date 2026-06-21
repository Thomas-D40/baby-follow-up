package com.suivibaby.repository;

import com.suivibaby.entity.BabyCaregiver;
import com.suivibaby.entity.BabyCaregiverId;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;
import java.util.UUID;

/** Parent↔baby link access: membership test (US1.5) and idempotent insert (US1.4). */
@ApplicationScoped
public class BabyCaregiverRepository implements PanacheRepositoryBase<BabyCaregiver, BabyCaregiverId> {

    public boolean isLinked(UUID appUserId, UUID babyId) {
        return count("appUserId = ?1 and babyId = ?2", appUserId, babyId) > 0;
    }

    public List<UUID> babyIdsOf(UUID appUserId) {
        return find("appUserId", appUserId).stream().map(bc -> bc.babyId).toList();
    }

    /** Idempotent insert ({@code ON CONFLICT DO NOTHING} on the composite PK). */
    public void linkIdempotent(UUID appUserId, UUID babyId) {
        getEntityManager()
                .createNativeQuery("INSERT INTO baby_caregiver (app_user_id, baby_id) "
                        + "VALUES (?1, ?2) ON CONFLICT DO NOTHING")
                .setParameter(1, appUserId)
                .setParameter(2, babyId)
                .executeUpdate();
    }
}
