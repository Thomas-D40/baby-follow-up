package com.suivibaby.repository;

import com.suivibaby.entity.AppUser;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.UUID;

@ApplicationScoped
public class AppUserRepository implements PanacheRepositoryBase<AppUser, UUID> {

    public AppUser findByEmail(String email) {
        return find("email", email).firstResult();
    }

    public long countByEmail(String email) {
        return count("email", email);
    }
}
