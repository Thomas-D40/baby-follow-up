package com.suivibaby.repository;

import com.suivibaby.entity.Dish;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class DishRepository implements PanacheRepositoryBase<Dish, UUID> {

    // Substring search on the normalized label (D18-AE). '!' is the LIKE escape character: the
    // wildcards of the user text are escaped so that "%" and "_" only ever match themselves.
    public List<Dish> search(String normalizedText, int limit) {
        String escaped = normalizedText
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return find("normalizedLabel like ?1 escape '!' order by normalizedLabel, id", "%" + escaped + "%")
                .page(0, limit).list();
    }

    public Dish findByNormalizedLabel(String normalized) {
        return find("normalizedLabel = ?1", normalized).firstResult();
    }

    // Idempotent insert: an existing dish is neither duplicated nor re-attributed (D18-AF), and a
    // concurrent insert of the same label cannot surface as a 500.
    public void insertIfAbsent(UUID id, String label, String normalized, UUID authorId) {
        getEntityManager()
                .createNativeQuery("INSERT INTO dish (id, label, normalized_label, author_id, created_at) "
                        + "VALUES (?1, ?2, ?3, ?4, now()) "
                        + "ON CONFLICT (normalized_label) DO NOTHING")
                .setParameter(1, id)
                .setParameter(2, label)
                .setParameter(3, normalized)
                .setParameter(4, authorId)
                .executeUpdate();
    }
}
