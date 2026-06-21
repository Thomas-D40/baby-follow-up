package com.suivibaby.bootstrap;

import com.suivibaby.entity.AppUser;
import com.suivibaby.repository.AppUserRepository;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/** Lot A — admin bootstrap (D-F): created if absent on startup, idempotent. */
@QuarkusTest
class AdminBootstrapTest {

    static final String ADMIN_EMAIL = "admin@suivibaby.local";

    @Inject
    AdminBootstrap adminBootstrap;

    @Inject
    AppUserRepository appUserRepository;

    @Test
    @Transactional
    void admin_existe_apres_demarrage() {
        AppUser admin = appUserRepository.findByEmail(ADMIN_EMAIL);
        assertNotNull(admin, "le hook de démarrage doit avoir créé l'admin");
        assertEquals("admin", admin.role);
        assertNotNull(admin.passwordHash, "l'admin amorcé a un mot de passe (court-circuite l'activation)");
    }

    @Test
    @Transactional
    void ensureAdmin_est_idempotent() {
        long before = appUserRepository.countByEmail(ADMIN_EMAIL);
        assertEquals(1, before);

        boolean created = adminBootstrap.ensureAdmin();
        assertFalse(created, "no-op si l'admin est déjà présent");
        assertEquals(1, appUserRepository.countByEmail(ADMIN_EMAIL), "pas de doublon");
    }
}
