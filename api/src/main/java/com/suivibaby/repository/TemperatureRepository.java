package com.suivibaby.repository;

import com.suivibaby.entity.Temperature;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

// Keyset trio with ONE substitution: maxForDay takes the place of the usual countForDay (D15-K),
// because the recap chip 🌡 carries the day's MAXIMUM and is never a count. No countForDay here:
// nothing would call it.
@ApplicationScoped
public class TemperatureRepository implements PanacheRepositoryBase<Temperature, UUID> {

    public List<Temperature> page(UUID babyId, Instant beforeTime, UUID beforeId, int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by occurredAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (occurredAt < ?2 or (occurredAt = ?2 and id < ?3)) "
                + "order by occurredAt desc, id desc", babyId, beforeTime, beforeId)
                .page(0, limit).list();
    }

    public List<Temperature> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3 order by occurredAt asc, id asc",
                babyId, from, to).list();
    }

    // Highest reading of the day, or NULL when the day holds no reading at all (D15-K).
    // Explicit JPQL through the EntityManager (same form as BottleFeedingRepository.sumQuantityForDay)
    // because count(...) is the ONLY aggregate PanacheRepositoryBase exposes: there is no max(...)
    // primitive, and .project(Class) is a DTO projection over entities, not a scalar one.
    // ⚠ Deliberately NO coalesce(..., 0) here, unlike sumQuantityForDay: that null IS the contract —
    // no reading means no chip at all, neither a 0 nor a dash. Do not "fix" this into a 0, do not
    // wrap it in an Optional.
    // Why getSingleResult() is safe on an empty day: an aggregate WITHOUT `group by` always yields
    // exactly ONE row, whose value is NULL — so there is no empty result set to trip over. Do NOT
    // generalise this to a non-aggregate query: there, an empty set makes getSingleResult() throw
    // NoResultException.
    public Integer maxForDay(UUID babyId, Instant from, Instant to) {
        return getEntityManager().createQuery(
                        "select max(t.temperatureCelsiusX10) from Temperature t "
                                + "where t.babyId = :baby and t.occurredAt >= :from and t.occurredAt < :to",
                        Integer.class)
                .setParameter("baby", babyId)
                .setParameter("from", from)
                .setParameter("to", to)
                .getSingleResult();
    }
}
