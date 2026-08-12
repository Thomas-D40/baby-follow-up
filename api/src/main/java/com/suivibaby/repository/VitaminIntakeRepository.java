package com.suivibaby.repository;

import com.suivibaby.entity.VitaminIntake;
import com.suivibaby.model.VitaminType;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class VitaminIntakeRepository implements PanacheRepositoryBase<VitaminIntake, UUID> {

    /**
     * Coche idempotente (D9-B/D9-G) : {@code ON CONFLICT DO NOTHING} sur la contrainte unique
     * (baby_id, vitamin_type, given_on). Le double-tap **et** la réponse-perdue-après-commit sont
     * absorbés — l'{@code author_id} reste celui du premier cocheur (pas de {@code DO UPDATE}, D9-F).
     * Calque {@code BabyCaregiverRepository.linkIdempotent}.
     */
    public void insertIfAbsent(UUID babyId, VitaminType type, LocalDate givenOn, UUID authorId) {
        getEntityManager()
                .createNativeQuery("INSERT INTO vitamin_intake "
                        + "(id, baby_id, vitamin_type, given_on, author_id, created_at) "
                        + "VALUES (gen_random_uuid(), ?1, ?2, ?3, ?4, now()) "
                        + "ON CONFLICT (baby_id, vitamin_type, given_on) DO NOTHING")
                .setParameter(1, babyId)
                .setParameter(2, type.name())
                .setParameter(3, givenOn)
                .setParameter(4, authorId)
                .executeUpdate();
    }

    public VitaminIntake findByKey(UUID babyId, VitaminType type, LocalDate givenOn) {
        return find("babyId = ?1 and vitaminType = ?2 and givenOn = ?3", babyId, type, givenOn)
                .firstResult();
    }

    /** Décoche idempotente (D9-B) : supprime 0 ou 1 ligne, jamais d'erreur si absente. */
    public long deleteByKey(UUID babyId, VitaminType type, LocalDate givenOn) {
        return delete("babyId = ?1 and vitaminType = ?2 and givenOn = ?3", babyId, type, givenOn);
    }

    /** Lignes présentes (donc « données ») pour un bébé et un jour — au plus une par type. */
    public List<VitaminIntake> listForDay(UUID babyId, LocalDate givenOn) {
        return list("babyId = ?1 and givenOn = ?2", babyId, givenOn);
    }
}
