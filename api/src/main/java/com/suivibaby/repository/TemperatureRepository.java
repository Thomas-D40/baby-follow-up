package com.suivibaby.repository;

import com.suivibaby.entity.Temperature;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

// Four methods instead of the usual keyset trio (page / listForDay / countForDay): maxForDay is an
// assumed exception (D15-K), the recap chip 🌡 carries the day's MAXIMUM, never a count.
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

    public long countForDay(UUID babyId, Instant from, Instant to) {
        return count("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3", babyId, from, to);
    }

    // Highest reading of the day, or NULL when the day holds no reading at all (D15-K).
    // Explicit JPQL through the EntityManager (same form as BottleFeedingRepository.sumQuantityForDay)
    // because count(...) is the ONLY aggregate PanacheRepositoryBase exposes: there is no max(...)
    // primitive, and .project(Class) is a DTO projection over entities, not a scalar one.
    // ⚠ Deliberately NO coalesce(..., 0) here, unlike sumQuantityForDay: getSingleResult() returns null
    // on an empty set without throwing, and that null IS the contract — no reading means no chip at
    // all, neither a 0 nor a dash. Do not "fix" this into a 0, do not wrap it in an Optional.
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
