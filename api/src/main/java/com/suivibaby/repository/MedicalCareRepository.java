package com.suivibaby.repository;

import com.suivibaby.entity.MedicalCare;
import com.suivibaby.model.CareType;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class MedicalCareRepository implements PanacheRepositoryBase<MedicalCare, UUID> {

    // Keyset listing, ALL care types mixed: the panel shows one chronological list of medical acts.
    public List<MedicalCare> page(UUID babyId, Instant beforeTime, UUID beforeId, int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by occurredAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (occurredAt < ?2 or (occurredAt = ?2 and id < ?3)) "
                + "order by occurredAt desc, id desc", babyId, beforeTime, beforeId)
                .page(0, limit).list();
    }

    // Day slice, ALL care types: the recap timeline merges every event of the day in one list.
    public List<MedicalCare> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and occurredAt >= ?2 and occurredAt < ?3 order by occurredAt asc, id asc",
                babyId, from, to).list();
    }

    // ⚠ Signature deviates from UrineRepository.countForDay(babyId, from, to) on purpose: the recap
    // renders TWO distinct chips (👁 and 👃, D15-K), so the count is PER TYPE and the caller makes two
    // calls. A single all-types count would be unusable — it could not tell the two chips apart.
    public long countForDay(UUID babyId, CareType careType, Instant from, Instant to) {
        return count("babyId = ?1 and careType = ?2 and occurredAt >= ?3 and occurredAt < ?4",
                babyId, careType, from, to);
    }
}
