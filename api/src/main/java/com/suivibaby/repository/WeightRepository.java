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

    /**
     * Historique complet trié given_on ASC, borné à 2000 lignes (garde-fou anti-bug, D12-D′).
     * Panache n'a pas de mot-clé {@code LIMIT} → {@code .range(0, 1999)} (bornes inclusives).
     */
    public List<Weight> listAll(UUID babyId) {
        return find("babyId = ?1", Sort.by("givenOn").ascending(), babyId)
                .range(0, 1999)
                .list();
    }

    /**
     * Upsert keyé date « dernier écrivain gagne » (D12-C′) : {@code ON CONFLICT DO UPDATE} sur la
     * contrainte unique (baby_id, given_on) → écrase la valeur ET l'author. Natif car Panache ne sait
     * pas exprimer {@code ON CONFLICT}.
     */
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

    /** Suppression idempotente (D12-D′) : supprime 0 ou 1 ligne, jamais d'erreur si absente. */
    public long deleteByKey(UUID babyId, LocalDate givenOn) {
        return delete("babyId = ?1 and givenOn = ?2", babyId, givenOn);
    }
}
