package com.suivibaby.repository;

import com.suivibaby.entity.SolidMeal;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class SolidMealRepository implements PanacheRepositoryBase<SolidMeal, UUID> {

    public List<SolidMeal> page(UUID babyId, Instant beforeTime, UUID beforeId, int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by occurredAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (occurredAt < ?2 or (occurredAt = ?2 and id < ?3)) "
                + "order by occurredAt desc, id desc", babyId, beforeTime, beforeId)
                .page(0, limit).list();
    }

    public List<SolidMeal> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3 order by occurredAt asc, id asc",
                babyId, from, to).list();
    }

    // The whole history of the baby, one column: the suggestions are merged and capped in memory.
    public List<String> listDishesNewestFirst(UUID babyId) {
        return getEntityManager().createQuery(
                        "select m.dish from SolidMeal m where m.babyId = :baby order by m.occurredAt desc, m.id desc",
                        String.class)
                .setParameter("baby", babyId)
                .getResultList();
    }

    public long countForDay(UUID babyId, Instant from, Instant to) {
        return count("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3", babyId, from, to);
    }
}
