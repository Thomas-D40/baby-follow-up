package com.suivibaby.repository;

import com.suivibaby.entity.Nap;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Accès aux siestes : état courant, dernière sieste (reopen), page keyset descendante (D3-J). */
@ApplicationScoped
public class NapRepository implements PanacheRepositoryBase<Nap, UUID> {

    /** Y a-t-il une sieste ouverte pour ce bébé ? (pré-check 409 de start/reopen, D4-C/D4-D). */
    public boolean existsOpen(UUID babyId) {
        return count("babyId = ?1 and endAt is null", babyId) > 0;
    }

    /** La sieste ouverte du bébé (au plus une, garantie par {@code uq_open_nap}), ou null. */
    public Nap findCurrent(UUID babyId) {
        return find("babyId = ?1 and endAt is null", babyId).firstResult();
    }

    /** La dernière sieste du bébé — tri déterministe {@code start_at DESC, id DESC} (reopen, D4-E). */
    public Nap findLatest(UUID babyId) {
        return find("babyId = ?1 order by startAt desc, id desc", babyId).firstResult();
    }

    /**
     * Page keyset triée {@code start_at DESC, id DESC} (D3-J / D4-L). {@code beforeTime == null} = 1ʳᵉ
     * page ; sinon on ne retient que ce qui est strictement « avant » le curseur (startAt, id), la
     * comparaison lexicographique étant déroulée pour rester index-friendly
     * ({@code (baby_id, start_at DESC, id DESC)}).
     */
    public List<Nap> page(UUID babyId, Instant beforeTime, UUID beforeId, int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by startAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (startAt < ?2 or (startAt = ?2 and id < ?3)) "
                + "order by startAt desc, id desc", babyId, beforeTime, beforeId)
                .page(0, limit).list();
    }
}
