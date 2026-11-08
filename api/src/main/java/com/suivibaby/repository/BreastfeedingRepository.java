package com.suivibaby.repository;

import com.suivibaby.entity.Breastfeeding;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class BreastfeedingRepository implements PanacheRepositoryBase<Breastfeeding, UUID> {

    // At equal start time the last entered comes first (US18.2: the reminder shows the last side noted),
    // so createdAt joins the keyset before id.
    public List<Breastfeeding> page(UUID babyId, Instant beforeTime, Instant beforeCreatedAt, UUID beforeId,
                                    int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by occurredAt desc, createdAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (occurredAt < ?2 or (occurredAt = ?2 and (createdAt < ?3 "
                + "or (createdAt = ?3 and id < ?4)))) order by occurredAt desc, createdAt desc, id desc",
                babyId, beforeTime, beforeCreatedAt, beforeId)
                .page(0, limit).list();
    }

    public List<Breastfeeding> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3 order by occurredAt asc, id asc",
                babyId, from, to).list();
    }

    public long countForDay(UUID babyId, Instant from, Instant to) {
        return count("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3", babyId, from, to);
    }
}
