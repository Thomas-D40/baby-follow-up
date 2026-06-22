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

@ApplicationScoped
public class ActivationService {

    @ConfigProperty(name = "app.activation.ttl-days", defaultValue = "7")
    long ttlDays;

    @Inject
    ActivationTokenRepository activationTokenRepository;

    @Inject
    AppUserRepository appUserRepository;

    @Transactional
    public UUID issueToken(UUID appUserId) {
        activationTokenRepository.invalidateActiveTokens(appUserId, Instant.now());

        ActivationToken token = new ActivationToken();
        token.token = UUID.randomUUID();
        token.appUserId = appUserId;
        token.expiresAt = Instant.now().plus(ttlDays, ChronoUnit.DAYS);
        token.usedAt = null;
        activationTokenRepository.persist(token);
        return token.token;
    }

    @Transactional
    public void activate(String rawToken, String password) {
        ActivationToken token = loadValidToken(rawToken);

        // Validated AFTER the token check but BEFORE any mutation: token not consumed on rejection.
        if (!PasswordUtil.meetsPolicy(password)) {
            throw new BadRequestException("Le mot de passe doit comporter au moins "
                    + PasswordUtil.MIN_LENGTH + " caractères.");
        }

        AppUser user = appUserRepository.findById(token.appUserId);
        if (user == null) {
            throw new ClientErrorException("Compte introuvable.", Response.Status.GONE);
        }

        user.passwordHash = PasswordUtil.hash(password);
        token.usedAt = Instant.now();
        // persisted via dirty checking (entities managed within the transaction)
    }

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
        ActivationToken token = activationTokenRepository.findById(id);
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
