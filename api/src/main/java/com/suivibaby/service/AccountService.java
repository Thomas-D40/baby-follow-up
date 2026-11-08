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

@ApplicationScoped
public class AccountService {

    @ConfigProperty(name = "app.activation.base-url", defaultValue = "")
    String activationBaseUrl;

    @Inject
    AppUserRepository appUserRepository;

    @Inject
    ActivationService activationService;

    @Transactional
    public CreateUserResponse createParent(String email, String firstName) {
        if (appUserRepository.findByEmail(email) != null) {
            throw new ClientErrorException("Email déjà utilisé.", Response.Status.CONFLICT);
        }
        AppUser user = newPendingParent(email, firstName);
        appUserRepository.persist(user);

        UUID token = activationService.issueToken(user.id);
        return new CreateUserResponse(user.id, buildLink(token));
    }

    // Existing account is returned untouched (name included); a new one is pending and has no
    // activation token: the invitation itself carries the password definition (D17-D).
    @Transactional
    public UUID findOrCreateParent(String email, String firstName) {
        AppUser existing = appUserRepository.findByEmail(email);
        if (existing != null) {
            return existing.id;
        }
        AppUser user = newPendingParent(email, firstName);
        appUserRepository.persist(user);
        return user.id;
    }

    @Transactional
    public CreateUserResponse regenerateActivationLink(UUID userId) {
        if (appUserRepository.findById(userId) == null) {
            throw new NotFoundException("Utilisateur introuvable.");
        }
        UUID token = activationService.issueToken(userId);
        return new CreateUserResponse(userId, buildLink(token));
    }

    private AppUser newPendingParent(String email, String firstName) {
        AppUser user = new AppUser();
        user.id = UUID.randomUUID();
        user.email = email;
        user.firstName = firstName;
        user.role = "parent";
        user.passwordHash = PasswordUtil.unusablePlaceholder(); // pending activation: not loginnable
        user.createdAt = Instant.now(); // activatedAt stays null until the password is defined
        return user;
    }

    private String buildLink(UUID token) {
        return activationBaseUrl + "/activate?token=" + token;
    }
}
