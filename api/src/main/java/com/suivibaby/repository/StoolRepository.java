package com.suivibaby.repository;

import com.suivibaby.entity.Stool;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Accès aux selles : page keyset descendante (D3-J / D5-I). */
@ApplicationScoped
public class StoolRepository implements PanacheRepositoryBase<Stool, UUID> {

    /**
     * Page keyset triée {@code occurred_at DESC, id DESC} (D3-J). {@code beforeTime == null} = 1ʳᵉ
     * page ; sinon on ne retient que ce qui est strictement « avant » le curseur (occurredAt, id),
     * la comparaison lexicographique étant déroulée pour rester index-friendly
     * ({@code (baby_id, occurred_at DESC, id DESC)}).
     */
    public List<Stool> page(UUID babyId, Instant beforeTime, UUID beforeId, int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by occurredAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (occurredAt < ?2 or (occurredAt = ?2 and id < ?3)) "
                + "order by occurredAt desc, id desc", babyId, beforeTime, beforeId)
                .page(0, limit).list();
    }

    /**
     * Selles d'un jour (Épic 6, US6.1), point semi-ouvert {@code occurred_at ∈ [from, to)} (D6-C),
     * triées {@code occurred_at ASC, id ASC}. Range scan propre sur {@code idx_stool_baby_time}.
     */
    public List<Stool> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3 order by occurredAt asc, id asc",
                babyId, from, to).list();
    }

    /** Nombre de selles du jour {@code [from, to)} (US6.3). */
    public long countForDay(UUID babyId, Instant from, Instant to) {
        return count("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3", babyId, from, to);
    }
}
