package com.suivibaby.test;

import com.suivibaby.entity.ActivationToken;
import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.Baby;
import com.suivibaby.entity.BabyCaregiver;
import com.suivibaby.entity.BottleFeeding;
import com.suivibaby.entity.Nap;
import com.suivibaby.model.MilkType;
import com.suivibaby.repository.ActivationTokenRepository;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyRepository;
import com.suivibaby.repository.BottleFeedingRepository;
import com.suivibaby.repository.NapRepository;
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
    AppUserRepository appUserRepository;

    @Inject
    BabyRepository babyRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    ActivationTokenRepository activationTokenRepository;

    @Inject
    BottleFeedingRepository bottleFeedingRepository;

    @Inject
    NapRepository napRepository;

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
        appUserRepository.persist(user);
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
        babyRepository.persist(baby);
        return baby.id;
    }

    @Transactional
    public void link(UUID userId, UUID babyId) {
        BabyCaregiver link = new BabyCaregiver();
        link.appUserId = userId;
        link.babyId = babyId;
        babyCaregiverRepository.persist(link);
    }

    @Transactional
    public void deleteUser(UUID userId) {
        appUserRepository.deleteById(userId);
    }

    /** Seed direct d'un biberon (Épic 3) — sert notamment au jalon IDOR (événement d'un autre bébé). */
    @Transactional
    public UUID createBottleFeeding(UUID babyId, UUID authorId, Instant occurredAt, int quantityMl,
                                    MilkType milkType) {
        BottleFeeding event = new BottleFeeding();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = occurredAt;
        event.quantityMl = quantityMl;
        event.milkType = milkType;
        event.authorId = authorId;
        event.createdAt = Instant.now();
        bottleFeedingRepository.persist(event);
        return event.id;
    }

    @Transactional
    public long countBottleFeeding(UUID babyId) {
        return bottleFeedingRepository.count("babyId", babyId);
    }

    /** Seed direct d'une sieste (Épic 4) — {@code endAt} null = ouverte ; sert au jalon IDOR et aux états. */
    @Transactional
    public UUID createNap(UUID babyId, UUID authorId, Instant startAt, Instant endAt) {
        Nap nap = new Nap();
        nap.id = UUID.randomUUID();
        nap.babyId = babyId;
        nap.startAt = startAt;
        nap.endAt = endAt;
        nap.authorId = authorId;
        nap.createdAt = Instant.now();
        napRepository.persist(nap);
        return nap.id;
    }

    @Transactional
    public long countNap(UUID babyId) {
        return napRepository.count("babyId", babyId);
    }

    @Transactional
    public UUID createToken(UUID userId, Instant expiresAt, Instant usedAt) {
        ActivationToken token = new ActivationToken();
        token.token = UUID.randomUUID();
        token.appUserId = userId;
        token.expiresAt = expiresAt;
        token.usedAt = usedAt;
        activationTokenRepository.persist(token);
        return token.token;
    }

    @Transactional
    public long countLink(UUID userId, UUID babyId) {
        return babyCaregiverRepository.count("appUserId = ?1 and babyId = ?2", userId, babyId);
    }

    @Transactional
    public boolean tokenConsumed(UUID token) {
        ActivationToken t = activationTokenRepository.findById(token);
        return t != null && t.usedAt != null;
    }
}
