package com.suivibaby.repository;

import com.suivibaby.entity.BottleFeeding;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Accès aux biberons : page keyset descendante (D3-J). */
@ApplicationScoped
public class BottleFeedingRepository implements PanacheRepositoryBase<BottleFeeding, UUID> {

    /**
     * Page keyset triée {@code occurred_at DESC, id DESC} (D3-J). {@code beforeTime == null} = 1ʳᵉ
     * page ; sinon on ne retient que ce qui est strictement « avant » le curseur (occurredAt, id),
     * la comparaison lexicographique étant déroulée pour rester index-friendly
     * ({@code (baby_id, occurred_at DESC, id DESC)}).
     */
    public List<BottleFeeding> page(UUID babyId, Instant beforeTime, UUID beforeId, int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by occurredAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (occurredAt < ?2 or (occurredAt = ?2 and id < ?3)) "
                + "order by occurredAt desc, id desc", babyId, beforeTime, beforeId)
                .page(0, limit).list();
    }
}
