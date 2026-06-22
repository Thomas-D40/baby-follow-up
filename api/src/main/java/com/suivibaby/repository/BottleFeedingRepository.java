package com.suivibaby.repository;

import com.suivibaby.entity.BottleFeeding;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class BottleFeedingRepository implements PanacheRepositoryBase<BottleFeeding, UUID> {

    public List<BottleFeeding> page(UUID babyId, Instant beforeTime, UUID beforeId, int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by occurredAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (occurredAt < ?2 or (occurredAt = ?2 and id < ?3)) "
                + "order by occurredAt desc, id desc", babyId, beforeTime, beforeId)
                .page(0, limit).list();
    }

    public List<BottleFeeding> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3 order by occurredAt asc, id asc",
                babyId, from, to).list();
    }

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
