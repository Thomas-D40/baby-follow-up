package com.suivibaby.security;

import com.suivibaby.entity.AppUser;
import com.suivibaby.repository.AppUserRepository;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import java.util.Optional;

@RequestScoped
public class CurrentUser {

    @Inject
    SecurityIdentity identity;

    @Inject
    AppUserRepository appUserRepository;

    // Empty for an anonymous request or an unknown principal; for the routes that tolerate no session.
    public Optional<AppUser> find() {
        if (identity == null || identity.isAnonymous()) {
            return Optional.empty();
        }
        return Optional.ofNullable(appUserRepository.findByEmail(identity.getPrincipal().getName()));
    }

    public AppUser require() {
        return find().orElseThrow(() -> new WebApplicationException(Response.Status.UNAUTHORIZED));
    }
}
