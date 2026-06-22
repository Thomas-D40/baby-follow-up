package com.suivibaby.repository;

import com.suivibaby.entity.Baby;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class BabyRepository implements PanacheRepositoryBase<Baby, UUID> {

    public List<Baby> listByIds(Collection<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        return list("id in ?1", ids);
    }
}
