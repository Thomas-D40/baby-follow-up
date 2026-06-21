package com.suivibaby.service;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateUserResponse;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.security.PasswordUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.util.UUID;

/** Parent account creation and activation-link generation (US1.1). */
@ApplicationScoped
public class AccountService {

    @ConfigProperty(name = "app.activation.base-url", defaultValue = "")
    String activationBaseUrl;

    @Inject
    AppUserRepository appUserRepository;

    @Inject
    ActivationService activationService;

    /**
     * Creates a parent account in "pending activation" state (no usable password) and issues its
     * activation link. Email already used → 409.
     */
    @Transactional
    public CreateUserResponse createParent(String email, String firstName) {
        if (appUserRepository.findByEmail(email) != null) {
            throw new ClientErrorException("Email déjà utilisé.", Response.Status.CONFLICT);
        }
        AppUser user = new AppUser();
        user.id = UUID.randomUUID();
        user.email = email;
        user.firstName = firstName;
        user.role = "parent";
        user.passwordHash = PasswordUtil.unusablePlaceholder(); // pending activation: not loginnable
        user.createdAt = Instant.now();
        appUserRepository.persist(user);

        UUID token = activationService.issueToken(user.id);
        return new CreateUserResponse(user.id, buildLink(token));
    }

    /** Regenerates the activation link (invalidates the previous one). 404 if the user does not exist. */
    @Transactional
    public CreateUserResponse regenerateActivationLink(UUID userId) {
        if (appUserRepository.findById(userId) == null) {
            throw new NotFoundException("Utilisateur introuvable.");
        }
        UUID token = activationService.issueToken(userId);
        return new CreateUserResponse(userId, buildLink(token));
    }

    private String buildLink(UUID token) {
        return activationBaseUrl + "/activate?token=" + token;
    }
}
