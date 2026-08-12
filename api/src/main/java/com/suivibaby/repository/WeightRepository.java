package com.suivibaby.repository;

import com.suivibaby.entity.Weight;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class WeightRepository implements PanacheRepositoryBase<Weight, UUID> {

    // Full history sorted given_on ASC, capped at 2000 rows (anti-bug guard, D12-D′).
    // Panache has no LIMIT keyword → .range(0, 1999) (inclusive bounds).
    public List<Weight> listAll(UUID babyId) {
        return find("babyId = ?1", Sort.by("givenOn").ascending(), babyId)
                .range(0, 1999)
                .list();
    }

    // Date-keyed "last-writer-wins" upsert (D12-C′): ON CONFLICT DO UPDATE on the unique
    // constraint (baby_id, given_on) → overwrites the value AND the author. Native because Panache
    // cannot express ON CONFLICT.
    public void upsert(UUID babyId, LocalDate givenOn, int weightGrams, UUID authorId) {
        getEntityManager()
                .createNativeQuery("INSERT INTO weight "
                        + "(id, baby_id, given_on, weight_grams, author_id, created_at) "
                        + "VALUES (gen_random_uuid(), ?1, ?2, ?3, ?4, now()) "
                        + "ON CONFLICT (baby_id, given_on) DO UPDATE SET "
                        + "weight_grams = EXCLUDED.weight_grams, author_id = EXCLUDED.author_id")
                .setParameter(1, babyId)
                .setParameter(2, givenOn)
                .setParameter(3, weightGrams)
                .setParameter(4, authorId)
                .executeUpdate();
    }

    // Idempotent deletion (D12-D′): deletes 0 or 1 row, never errors if absent.
    public long deleteByKey(UUID babyId, LocalDate givenOn) {
        return delete("babyId = ?1 and givenOn = ?2", babyId, givenOn);
    }
}
