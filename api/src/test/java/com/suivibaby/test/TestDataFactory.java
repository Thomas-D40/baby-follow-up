package com.suivibaby.test;

import com.suivibaby.entity.ActivationToken;
import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.Baby;
import com.suivibaby.entity.BabyCaregiver;
import com.suivibaby.entity.BabyInvitation;
import com.suivibaby.entity.BottleFeeding;
import com.suivibaby.entity.Nap;
import com.suivibaby.entity.Stool;
import com.suivibaby.entity.Urine;
import com.suivibaby.entity.VitaminIntake;
import com.suivibaby.entity.Weight;
import com.suivibaby.model.MilkType;
import com.suivibaby.model.StoolConsistency;
import com.suivibaby.model.VitaminType;
import com.suivibaby.repository.ActivationTokenRepository;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyInvitationRepository;
import com.suivibaby.repository.BabyRepository;
import com.suivibaby.repository.BottleFeedingRepository;
import com.suivibaby.repository.NapRepository;
import com.suivibaby.repository.StoolRepository;
import com.suivibaby.repository.UrineRepository;
import com.suivibaby.repository.VitaminIntakeRepository;
import com.suivibaby.repository.WeightRepository;
import com.suivibaby.security.PasswordUtil;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.time.LocalDate;
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

    @Inject
    StoolRepository stoolRepository;

    @Inject
    UrineRepository urineRepository;

    @Inject
    BabyInvitationRepository babyInvitationRepository;

    @Inject
    VitaminIntakeRepository vitaminIntakeRepository;

    @Inject
    WeightRepository weightRepository;

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

    /** Lien owner (is_owner=true) : sémantique par défaut des liens pré-Épic 8 (backfill D8-H). */
    @Transactional
    public void link(UUID userId, UUID babyId) {
        linkWithOwner(userId, babyId, true);
    }

    /** Lien non-owner (is_owner=false) : sémantique d'une acceptation d'invitation (D8-F). */
    @Transactional
    public void linkAsCaregiver(UUID userId, UUID babyId) {
        linkWithOwner(userId, babyId, false);
    }

    @Transactional
    public void linkWithOwner(UUID userId, UUID babyId, boolean owner) {
        BabyCaregiver link = new BabyCaregiver();
        link.appUserId = userId;
        link.babyId = babyId;
        link.isOwner = owner;
        babyCaregiverRepository.persist(link);
    }

    @Transactional
    public boolean isOwner(UUID userId, UUID babyId) {
        return babyCaregiverRepository.isOwner(userId, babyId);
    }

    @Transactional
    public boolean isLinkedHelper(UUID userId, UUID babyId) {
        return babyCaregiverRepository.isLinked(userId, babyId);
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

    /** Seed direct d'une selle (Épic 5) — sert notamment au jalon IDOR (événement d'un autre bébé). */
    @Transactional
    public UUID createStool(UUID babyId, UUID authorId, Instant occurredAt, StoolConsistency consistency) {
        Stool event = new Stool();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = occurredAt;
        event.consistency = consistency;
        event.authorId = authorId;
        event.createdAt = Instant.now();
        stoolRepository.persist(event);
        return event.id;
    }

    @Transactional
    public long countStool(UUID babyId) {
        return stoolRepository.count("babyId", babyId);
    }

    /** Seed direct d'une miction (Épic urine) — sert notamment au jalon IDOR (événement d'un autre bébé). */
    @Transactional
    public UUID createUrine(UUID babyId, UUID authorId, Instant occurredAt) {
        Urine event = new Urine();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = occurredAt;
        event.authorId = authorId;
        event.createdAt = Instant.now();
        urineRepository.persist(event);
        return event.id;
    }

    @Transactional
    public long countUrine(UUID babyId) {
        return urineRepository.count("babyId", babyId);
    }

    /** Seed direct d'un état-vitamine (Épic 9) — présence de ligne = donnée (D9-A). Sert au jalon IDOR. */
    @Transactional
    public UUID giveVitamin(UUID babyId, UUID authorId, VitaminType type, LocalDate givenOn) {
        VitaminIntake row = new VitaminIntake();
        row.id = UUID.randomUUID();
        row.babyId = babyId;
        row.vitaminType = type;
        row.givenOn = givenOn;
        row.authorId = authorId;
        row.createdAt = Instant.now();
        vitaminIntakeRepository.persist(row);
        return row.id;
    }

    @Transactional
    public long countVitamin(UUID babyId) {
        return vitaminIntakeRepository.count("babyId", babyId);
    }

    // Number of weight rows for a baby (Épic 12) — checks per-day uniqueness (upsert, D12-C′).
    @Transactional
    public long countWeight(UUID babyId) {
        return weightRepository.count("babyId", babyId);
    }

    // Current author of a day's weigh-in (Épic 12) — checks "last-writer-wins" (D12-C′).
    @Transactional
    public UUID weightAuthorId(UUID babyId, LocalDate givenOn) {
        Weight row = weightRepository.find("babyId = ?1 and givenOn = ?2", babyId, givenOn).firstResult();
        return row == null ? null : row.authorId;
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

    // === Épic 8 : invitations de partage ===

    /** Seed direct d'une invitation (Épic 8) — {@code usedAt} null = active, sinon consommée. */
    @Transactional
    public UUID createInvitation(UUID babyId, UUID createdBy, Instant expiresAt, Instant usedAt) {
        BabyInvitation invitation = new BabyInvitation();
        invitation.token = UUID.randomUUID();
        invitation.babyId = babyId;
        invitation.createdBy = createdBy;
        invitation.expiresAt = expiresAt;
        invitation.usedAt = usedAt;
        invitation.acceptedBy = null;
        babyInvitationRepository.persist(invitation);
        return invitation.token;
    }

    @Transactional
    public boolean invitationConsumed(UUID token) {
        BabyInvitation i = babyInvitationRepository.findById(token);
        return i != null && i.usedAt != null;
    }

    @Transactional
    public long countActiveInvitations(UUID babyId) {
        return babyInvitationRepository.count("babyId = ?1 and usedAt is null", babyId);
    }
}
