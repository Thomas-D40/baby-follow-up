package com.suivibaby.bootstrap;

import com.suivibaby.entity.AppUser;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.security.PasswordUtil;
import io.quarkus.logging.Log;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class AdminBootstrap {

    // Optional<String>: a property defined as empty ("") is seen as absent by SmallRye.
    @ConfigProperty(name = "app.bootstrap.admin-email")
    Optional<String> email;

    @ConfigProperty(name = "app.bootstrap.admin-first-name", defaultValue = "Admin")
    String firstName;

    @ConfigProperty(name = "app.bootstrap.admin-password-hash")
    Optional<String> passwordHash;

    @ConfigProperty(name = "app.bootstrap.admin-password")
    Optional<String> plainPassword;

    @Inject
    AppUserRepository appUserRepository;

    void onStart(@Observes StartupEvent event) {
        ensureAdmin();
    }

    @Transactional
    public boolean ensureAdmin() {
        String adminEmail = email.filter(s -> !s.isBlank()).orElse(null);
        if (adminEmail == null) {
            Log.info("Admin bootstrap: no app.bootstrap.admin-email configured, skipped.");
            return false;
        }
        if (appUserRepository.findByEmail(adminEmail) != null) {
            return false; // idempotent: admin already present
        }

        String hash = resolveHash();
        if (hash == null) {
            Log.warnf("Admin bootstrap '%s': neither hash nor password provided, creation skipped.", adminEmail);
            return false;
        }

        AppUser admin = new AppUser();
        admin.id = UUID.randomUUID();
        admin.email = adminEmail;
        admin.firstName = firstName;
        admin.role = "admin";
        admin.passwordHash = hash;
        admin.createdAt = Instant.now();
        appUserRepository.persist(admin);
        Log.infof("Admin bootstrap '%s' created.", adminEmail);
        return true;
    }

    private String resolveHash() {
        String hash = passwordHash.filter(s -> !s.isBlank()).orElse(null);
        if (hash != null) {
            return hash;
        }
        return plainPassword.filter(s -> !s.isBlank())
                .map(PasswordUtil::hash)
                .orElse(null);
    }
}
