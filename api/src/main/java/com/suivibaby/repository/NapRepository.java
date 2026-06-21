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

    /**
     * Siestes chevauchant un jour (Épic 6, US6.1) : <strong>overlap</strong>
     * {@code start_at < to AND (end_at > from OR end_at IS NULL)} (D6-C) — une sieste de nuit apparaît
     * sur <em>tous</em> les jours qu'elle chevauche, pas seulement son jour de début. Triées
     * {@code start_at ASC, id ASC}. Borne basse ouverte sur {@code start_at} (range scan moins serré, R1) :
     * acceptable (table {@code nap} modeste), et on ne plancher pas {@code start_at} (exclurait une sieste
     * ouverte oubliée qu'on veut compter — D6-G).
     */
    public List<Nap> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and startAt < ?3 and (endAt is null or endAt > ?2) "
                + "order by startAt asc, id asc", babyId, from, to).list();
    }

    /**
     * Minutes de sommeil du jour {@code [from, to)} (US6.3), <strong>clippées</strong> à la fenêtre du
     * jour (D6-F) : {@code LEAST(COALESCE(end_at, now()), to) − GREATEST(start_at, from)} sur les siestes
     * en overlap. Sieste en cours comptée jusqu'à {@code now()} (D6-G). {@code 0} si aucune sieste.
     * SQL pur (TIMESTAMPTZ + {@code now()} homogènes).
     */
    public long sleepMinutesForDay(UUID babyId, Instant from, Instant to) {
        Number minutes = (Number) getEntityManager()
                .createNativeQuery("SELECT COALESCE(SUM(EXTRACT(EPOCH FROM ("
                        + "LEAST(COALESCE(end_at, now()), ?3) - GREATEST(start_at, ?2)"
                        + ")) / 60), 0) "
                        + "FROM nap WHERE baby_id = ?1 "
                        + "AND start_at < ?3 AND (end_at IS NULL OR end_at > ?2)")
                .setParameter(1, babyId)
                .setParameter(2, from)
                .setParameter(3, to)
                .getSingleResult();
        return Math.round(minutes.doubleValue());
    }
}
