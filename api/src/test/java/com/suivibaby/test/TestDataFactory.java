package com.suivibaby.test;

import com.suivibaby.entity.ActivationToken;
import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.Baby;
import com.suivibaby.entity.BabyCaregiver;
import com.suivibaby.repository.ActivationTokenRepository;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyRepository;
import com.suivibaby.security.PasswordUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Test data fixture (D-D): seed admin/parent/baby + link + tokens, reusable. Goes through the
 * repository layer (like production code). All writes are transactional.
 */
@ApplicationScoped
public class TestDataFactory {

    @Inject
    AppUserRepository users;

    @Inject
    BabyRepository babies;

    @Inject
    BabyCaregiverRepository caregivers;

    @Inject
    ActivationTokenRepository tokens;

    /** Unique email to isolate test methods (the database persists across the whole run). */
    public String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@test.local";
    }

    @Transactional
    public UUID createUser(String email, String firstName, String role, String plainPassword) {
        AppUser user = new AppUser();
        user.id = UUID.randomUUID();
        user.email = email;
        user.firstName = firstName;
        user.role = role;
        user.passwordHash = plainPassword == null
                ? PasswordUtil.unusablePlaceholder() // pending activation: not loginnable (as in prod)
                : PasswordUtil.hash(plainPassword);
        user.createdAt = Instant.now();
        users.persist(user);
        return user.id;
    }

    public UUID createAdmin(String email, String plainPassword) {
        return createUser(email, "Admin", "admin", plainPassword);
    }

    public UUID createActiveParent(String email, String plainPassword) {
        return createUser(email, "Parent", "parent", plainPassword);
    }

    /** Pending-activation parent: no usable password. */
    public UUID createPendingParent(String email) {
        return createUser(email, "Parent", "parent", null);
    }

    @Transactional
    public UUID createBaby(String firstName) {
        Baby baby = new Baby();
        baby.id = UUID.randomUUID();
        baby.firstName = firstName;
        baby.createdAt = Instant.now();
        babies.persist(baby);
        return baby.id;
    }

    @Transactional
    public void link(UUID userId, UUID babyId) {
        BabyCaregiver link = new BabyCaregiver();
        link.appUserId = userId;
        link.babyId = babyId;
        caregivers.persist(link);
    }

    @Transactional
    public void deleteUser(UUID userId) {
        users.deleteById(userId);
    }

    @Transactional
    public UUID createToken(UUID userId, Instant expiresAt, Instant usedAt) {
        ActivationToken token = new ActivationToken();
        token.token = UUID.randomUUID();
        token.appUserId = userId;
        token.expiresAt = expiresAt;
        token.usedAt = usedAt;
        tokens.persist(token);
        return token.token;
    }

    @Transactional
    public long countLink(UUID userId, UUID babyId) {
        return caregivers.count("appUserId = ?1 and babyId = ?2", userId, babyId);
    }

    @Transactional
    public boolean tokenConsumed(UUID token) {
        ActivationToken t = tokens.findById(token);
        return t != null && t.usedAt != null;
    }
}
