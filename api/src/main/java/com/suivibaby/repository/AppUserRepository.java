package com.suivibaby.repository;

import com.suivibaby.entity.AppUser;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class AppUserRepository implements PanacheRepositoryBase<AppUser, UUID> {

    public AppUser findByEmail(String email) {
        return find("email", email).firstResult();
    }

    public long countByEmail(String email) {
        return count("email", email);
    }

    // Newest account first, email as the tie-break so the order is total and stable (D20-I, D20-R).
    public List<AppUser> listAllNewestFirst() {
        return listAll(Sort.descending("createdAt").and("email"));
    }
}
