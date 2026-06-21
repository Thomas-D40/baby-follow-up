package com.suivibaby.service;

import com.suivibaby.entity.ActivationToken;
import com.suivibaby.entity.AppUser;
import com.suivibaby.repository.ActivationTokenRepository;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.security.PasswordUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/** Activation-token lifecycle and password definition (US1.2). */
@ApplicationScoped
public class ActivationService {

    @ConfigProperty(name = "app.activation.ttl-days", defaultValue = "7")
    long ttlDays;

    @Inject
    ActivationTokenRepository tokens;

    @Inject
    AppUserRepository users;

    /**
     * Issues a new token for the user and <strong>invalidates any previous active token</strong>
     * (at most one active per user). Returns the token value (UUID).
     */
    @Transactional
    public UUID issueToken(UUID appUserId) {
        tokens.invalidateActiveTokens(appUserId, Instant.now());

        ActivationToken token = new ActivationToken();
        token.token = UUID.randomUUID();
        token.appUserId = appUserId;
        token.expiresAt = Instant.now().plus(ttlDays, ChronoUnit.DAYS);
        token.usedAt = null;
        tokens.persist(token);
        return token.token;
    }

    /**
     * Activates the account: stores the password (BCrypt) and consumes the token.
     *
     * <ul>
     *   <li>Unknown / consumed / expired token → 410 (Gone).</li>
     *   <li>Password &lt; 12 → 400, <strong>without consuming the token</strong>.</li>
     * </ul>
     */
    @Transactional
    public void activate(String rawToken, String password) {
        ActivationToken token = loadValidToken(rawToken);

        // Validated AFTER the token check but BEFORE any mutation: token not consumed on rejection.
        if (!PasswordUtil.meetsPolicy(password)) {
            throw new BadRequestException("Le mot de passe doit comporter au moins "
                    + PasswordUtil.MIN_LENGTH + " caractères.");
        }

        AppUser user = users.findById(token.appUserId);
        if (user == null) {
            throw new ClientErrorException("Compte introuvable.", Response.Status.GONE);
        }

        user.passwordHash = PasswordUtil.hash(password);
        token.usedAt = Instant.now();
        // persisted via dirty checking (entities managed within the transaction)
    }

    /** Token pre-validation (GET): throws 410 if invalid, no-op otherwise. */
    public void checkUsable(String rawToken) {
        loadValidToken(rawToken);
    }

    private ActivationToken loadValidToken(String rawToken) {
        UUID id;
        try {
            id = UUID.fromString(rawToken);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw gone();
        }
        ActivationToken token = tokens.findById(id);
        if (token == null || token.isConsumed() || token.isExpired(Instant.now())) {
            throw gone();
        }
        return token;
    }

    private ClientErrorException gone() {
        return new ClientErrorException(
                "Lien d'activation invalide ou expiré ; demandez un nouveau lien.",
                Response.Status.GONE);
    }
}
