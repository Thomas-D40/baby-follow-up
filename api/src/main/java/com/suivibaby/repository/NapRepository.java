package com.suivibaby.repository;

import com.suivibaby.entity.Nap;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class NapRepository implements PanacheRepositoryBase<Nap, UUID> {

    public boolean existsOpen(UUID babyId) {
        return count("babyId = ?1 and endAt is null", babyId) > 0;
    }

    public Nap findCurrent(UUID babyId) {
        return find("babyId = ?1 and endAt is null", babyId).firstResult();
    }

    public Nap findLatest(UUID babyId) {
        return find("babyId = ?1 order by startAt desc, id desc", babyId).firstResult();
    }

    public List<Nap> page(UUID babyId, Instant beforeTime, UUID beforeId, int limit) {
        if (beforeTime == null) {
            return find("babyId = ?1 order by startAt desc, id desc", babyId)
                    .page(0, limit).list();
        }
        return find("babyId = ?1 and (startAt < ?2 or (startAt = ?2 and id < ?3)) "
                + "order by startAt desc, id desc", babyId, beforeTime, beforeId)
                .page(0, limit).list();
    }

    public List<Nap> listForDay(UUID babyId, Instant from, Instant to) {
        return find("babyId = ?1 and startAt < ?3 and (endAt is null or endAt > ?2) "
                + "order by startAt asc, id asc", babyId, from, to).list();
    }

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
