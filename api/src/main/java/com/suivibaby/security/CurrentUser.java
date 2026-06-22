package com.suivibaby.security;

import com.suivibaby.entity.AppUser;
import com.suivibaby.repository.AppUserRepository;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

@RequestScoped
public class CurrentUser {

    @Inject
    SecurityIdentity identity;

    @Inject
    AppUserRepository appUserRepository;

    public AppUser require() {
        if (identity == null || identity.isAnonymous()) {
            throw new WebApplicationException(Response.Status.UNAUTHORIZED);
        }
        AppUser user = appUserRepository.findByEmail(identity.getPrincipal().getName());
        if (user == null) {
            throw new WebApplicationException(Response.Status.UNAUTHORIZED);
        }
        return user;
    }
}
