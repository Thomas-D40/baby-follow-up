package com.suivibaby.security;

import com.suivibaby.entity.AppUser;
import com.suivibaby.repository.AppUserRepository;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

/**
 * Resolves the current authenticated user from the session cookie identity.
 *
 * <p>"Deleted-user cookie" case: the identity is carried by the stateless cookie, but the
 * {@code app_user} row no longer exists → return 401 (re-login required).
 */
@RequestScoped
public class CurrentUser {

    @Inject
    SecurityIdentity identity;

    @Inject
    AppUserRepository users;

    public AppUser require() {
        if (identity == null || identity.isAnonymous()) {
            throw new WebApplicationException(Response.Status.UNAUTHORIZED);
        }
        AppUser user = users.findByEmail(identity.getPrincipal().getName());
        if (user == null) {
            throw new WebApplicationException(Response.Status.UNAUTHORIZED);
        }
        return user;
    }
}
