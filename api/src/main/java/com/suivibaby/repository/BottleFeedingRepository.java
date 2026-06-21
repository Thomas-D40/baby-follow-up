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

    /**
     * Biberons d'un jour (Épic 6, US6.1), point semi-ouvert {@code occurred_at ∈ [from, to)} (D6-C),
     * triés {@code occurred_at ASC, id ASC} (axe « par jour », pas keyset — §1 du plan). Range scan
     * propre sur {@code idx_bottle_feeding_baby_time}.
     */
    public List<BottleFeeding> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3 order by occurredAt asc, id asc",
                babyId, from, to).list();
    }

    /** Somme des ml du jour {@code [from, to)} (US6.3), {@code 0} si aucun biberon. */
    public int sumQuantityForDay(UUID babyId, Instant from, Instant to) {
        Long sum = getEntityManager().createQuery(
                        "select coalesce(sum(b.quantityMl), 0) from BottleFeeding b "
                                + "where b.babyId = :baby and b.occurredAt >= :from and b.occurredAt < :to",
                        Long.class)
                .setParameter("baby", babyId)
                .setParameter("from", from)
                .setParameter("to", to)
                .getSingleResult();
        return sum.intValue();
    }
}
