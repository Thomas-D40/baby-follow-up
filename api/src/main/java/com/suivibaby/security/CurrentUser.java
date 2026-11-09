package com.suivibaby.security;

import com.suivibaby.entity.AppUser;
import com.suivibaby.repository.AppUserRepository;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

@RequestScoped
public class CurrentUser {

    @Inject
    SecurityIdentity identity;

    @Inject
    AppUserRepository appUserRepository;

    @ConfigProperty(name = "quarkus.http.auth.form.timeout")
    Duration sessionTimeout;

    // Empty for an anonymous request, an unknown principal or a stale session; for the routes that
    // tolerate no session.
    public Optional<AppUser> find() {
        if (identity == null || identity.isAnonymous()) {
            return Optional.empty();
        }
        return Optional.ofNullable(appUserRepository.findByEmail(identity.getPrincipal().getName()))
                .filter(user -> !isStaleSession(user, Instant.now()));
    }

    // A pending account cannot log in (its hash is unusable), so a session resolving to a recently created
    // one can only come from the cookie of a deleted account that had the same email: the cookie holds
    // nothing but the expiry and the email. Such a cookie must not open the recreated account (D24-W).
    // The bound is the cookie lifetime: older pending accounts (wrongly back-marked by 016) keep their session.
    boolean isStaleSession(AppUser user, Instant now) {
        return user.activatedAt == null && user.createdAt.isAfter(now.minus(sessionTimeout));
    }

    public AppUser require() {
        return find().orElseThrow(() -> new WebApplicationException(Response.Status.UNAUTHORIZED));
    }
}
