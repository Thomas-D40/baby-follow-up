package com.suivibaby.test;

import com.suivibaby.entity.ActivationToken;
import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.Baby;
import com.suivibaby.entity.BabyCaregiver;
import com.suivibaby.entity.BabyInvitation;
import com.suivibaby.entity.BottleFeeding;
import com.suivibaby.entity.Dish;
import com.suivibaby.entity.Breastfeeding;
import com.suivibaby.entity.MedicalCare;
import com.suivibaby.entity.Medication;
import com.suivibaby.entity.Nap;
import com.suivibaby.entity.SolidMeal;
import com.suivibaby.entity.Stool;
import com.suivibaby.entity.Temperature;
import com.suivibaby.entity.Urine;
import com.suivibaby.entity.VitaminIntake;
import com.suivibaby.entity.Weight;
import com.suivibaby.model.BreastSide;
import com.suivibaby.model.CareType;
import com.suivibaby.model.MealPortion;
import com.suivibaby.model.MilkType;
import com.suivibaby.model.StoolConsistency;
import com.suivibaby.model.VitaminType;
import com.suivibaby.repository.ActivationTokenRepository;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyInvitationRepository;
import com.suivibaby.repository.BabyRepository;
import com.suivibaby.repository.BottleFeedingRepository;
import com.suivibaby.repository.BreastfeedingRepository;
import com.suivibaby.repository.DishRepository;
import com.suivibaby.repository.MedicalCareRepository;
import com.suivibaby.repository.MedicationRepository;
import com.suivibaby.repository.NapRepository;
import com.suivibaby.repository.SolidMealRepository;
import com.suivibaby.repository.StoolRepository;
import com.suivibaby.repository.TemperatureRepository;
import com.suivibaby.repository.UrineRepository;
import com.suivibaby.repository.VitaminIntakeRepository;
import com.suivibaby.repository.WeightRepository;
import com.suivibaby.security.PasswordUtil;
import com.suivibaby.service.DishLabels;
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

    @Inject
    TemperatureRepository temperatureRepository;

    @Inject
    MedicalCareRepository medicalCareRepository;

    @Inject
    BreastfeedingRepository breastfeedingRepository;

    @Inject
    SolidMealRepository solidMealRepository;

    @Inject
    DishRepository dishRepository;

    @Inject
    MedicationRepository medicationRepository;

    /** Unique email to isolate test methods (the database persists across the whole run). */
    public String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID() + "@test.local";
    }

    public UUID createUser(String email, String firstName, String role, String plainPassword) {
        return createUser(email, firstName, role, plainPassword, Instant.now());
    }

    // Variant with a chosen creation date, to test the "newest first" ordering of the accounts list.
    @Transactional
    public UUID createUser(String email, String firstName, String role, String plainPassword, Instant createdAt) {
        AppUser user = new AppUser();
        user.id = UUID.randomUUID();
        user.email = email;
        user.firstName = firstName;
        user.role = role;
        user.passwordHash = plainPassword == null
                ? PasswordUtil.unusablePlaceholder() // pending activation: not loginnable (as in prod)
                : PasswordUtil.hash(plainPassword);
        user.createdAt = createdAt;
        // Accounts with a password are activated, as in prod; a pending account has no activation date.
        user.activatedAt = plainPassword == null ? null : user.createdAt;
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

    // Direct seed of a temperature reading (Épic 15) — used by the keyset and IDOR milestones.
    @Transactional
    public UUID createTemperature(UUID babyId, UUID authorId, Instant occurredAt, int celsiusX10) {
        Temperature event = new Temperature();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = occurredAt;
        event.temperatureCelsiusX10 = celsiusX10;
        event.authorId = authorId;
        event.createdAt = Instant.now();
        temperatureRepository.persist(event);
        return event.id;
    }

    @Transactional
    public long countTemperature(UUID babyId) {
        return temperatureRepository.count("babyId", babyId);
    }

    // Highest reading of a window, NULL when there is none (D15-K). Wrapped here because the
    // repository needs an active session, which a bare test method does not have.
    @Transactional
    public Integer maxTemperatureForDay(UUID babyId, Instant from, Instant to) {
        return temperatureRepository.maxForDay(babyId, from, to);
    }

    // Direct seed of an eye/nose care (Épic 15) — used by the keyset and IDOR milestones.
    @Transactional
    public UUID createMedicalCare(UUID babyId, UUID authorId, CareType careType, Instant occurredAt) {
        MedicalCare event = new MedicalCare();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.careType = careType;
        event.occurredAt = occurredAt;
        event.authorId = authorId;
        event.createdAt = Instant.now();
        medicalCareRepository.persist(event);
        return event.id;
    }

    @Transactional
    public long countMedicalCare(UUID babyId) {
        return medicalCareRepository.count("babyId", babyId);
    }

    // Per-type count (D15-K): the recap renders one chip per care type, so the two are counted apart.
    @Transactional
    public long countMedicalCare(UUID babyId, CareType careType) {
        return medicalCareRepository.count("babyId = ?1 and careType = ?2", babyId, careType);
    }

    // Direct seed of a breastfeeding (Épic 18) — side and duration are optional (null = not specified).
    @Transactional
    public UUID createBreastfeeding(UUID babyId, UUID authorId, Instant occurredAt, BreastSide side,
                                    Integer durationMinutes) {
        Breastfeeding event = new Breastfeeding();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = occurredAt;
        event.side = side;
        event.durationMinutes = durationMinutes;
        event.authorId = authorId;
        event.createdAt = Instant.now();
        breastfeedingRepository.persist(event);
        return event.id;
    }

    // Seed with a chosen id and entry time, to test the tie-break at equal start time (US18.2).
    @Transactional
    public void createBreastfeeding(UUID id, UUID babyId, UUID authorId, Instant occurredAt, BreastSide side,
                                    Instant createdAt) {
        Breastfeeding event = new Breastfeeding();
        event.id = id;
        event.babyId = babyId;
        event.occurredAt = occurredAt;
        event.side = side;
        event.authorId = authorId;
        event.createdAt = createdAt;
        breastfeedingRepository.persist(event);
    }

    @Transactional
    public long countBreastfeeding(UUID babyId) {
        return breastfeedingRepository.count("babyId", babyId);
    }

    // Direct seed of a solid meal (Épic 18) — `dish` is free text (not a reference to the dish list).
    @Transactional
    public UUID createSolidMeal(UUID babyId, UUID authorId, Instant occurredAt, String dish,
                                MealPortion portion) {
        SolidMeal event = new SolidMeal();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = occurredAt;
        event.dish = dish;
        event.portion = portion;
        event.authorId = authorId;
        event.createdAt = Instant.now();
        solidMealRepository.persist(event);
        return event.id;
    }

    @Transactional
    public long countSolidMeal(UUID babyId) {
        return solidMealRepository.count("babyId", babyId);
    }

    // Stored text of a meal's dish, to check what the service actually persisted (D18-AD).
    @Transactional
    public String solidMealDish(UUID mealId) {
        SolidMeal meal = solidMealRepository.findById(mealId);
        return meal == null ? null : meal.dish;
    }

    // Direct seed of a medication intake (Épic 19) — name and dosage are stored as given (free text).
    @Transactional
    public UUID createMedication(UUID babyId, UUID authorId, Instant occurredAt, String medicationName,
                                 String dosage) {
        Medication event = new Medication();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = occurredAt;
        event.medicationName = medicationName;
        event.dosage = dosage;
        event.authorId = authorId;
        event.createdAt = Instant.now();
        medicationRepository.persist(event);
        return event.id;
    }

    @Transactional
    public long countMedication(UUID babyId) {
        return medicationRepository.count("babyId", babyId);
    }

    // Stored name of an intake, to check what the service actually persisted (null once deleted).
    @Transactional
    public String medicationName(UUID id) {
        Medication event = medicationRepository.findById(id);
        return event == null ? null : event.medicationName;
    }

    // Stored dosage of an intake (null when no dosage, or when the intake is gone).
    @Transactional
    public String medicationDosage(UUID id) {
        Medication event = medicationRepository.findById(id);
        return event == null ? null : event.dosage;
    }

    // Direct seed of a shared dish (Épic 18). The label is stored as given; the normalized form
    // (uniqueness + search column) comes from the same function production uses.
    @Transactional
    public UUID createDish(UUID authorId, String label) {
        Dish dish = new Dish();
        dish.id = UUID.randomUUID();
        dish.label = label;
        dish.normalizedLabel = DishLabels.normalize(label);
        dish.authorId = authorId;
        dish.createdAt = Instant.now();
        dishRepository.persist(dish);
        return dish.id;
    }

    // Stored label of a dish, null once it has been deleted.
    @Transactional
    public String dishLabel(UUID dishId) {
        Dish dish = dishRepository.findById(dishId);
        return dish == null ? null : dish.label;
    }

    // Number of dishes whose normalized label equals the normalization of `label` (0 or 1: UNIQUE).
    @Transactional
    public long countDishesNormalized(String label) {
        return dishRepository.count("normalizedLabel", DishLabels.normalize(label));
    }

    // Removes the shared dish(es) whose normalized label equals the normalization of `label` (Épic 23).
    // « Purée » and « Compote » are global singletons now ordinary dishes: a test that depends on
    // their presence or absence resets them first.
    @Transactional
    public long deleteDishesNormalized(String label) {
        return dishRepository.delete("normalizedLabel", DishLabels.normalize(label));
    }

    @Transactional
    public UUID dishAuthor(UUID dishId) {
        Dish dish = dishRepository.findById(dishId);
        return dish == null ? null : dish.authorId;
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

    // Direct seed of an invitation (Épic 17: it names its recipient) — usedAt null = active, else consumed.
    @Transactional
    public UUID createInvitation(UUID babyId, UUID createdBy, UUID inviteeUserId, Instant expiresAt,
                                 Instant usedAt) {
        BabyInvitation invitation = new BabyInvitation();
        invitation.token = UUID.randomUUID();
        invitation.babyId = babyId;
        invitation.createdBy = createdBy;
        invitation.inviteeUserId = inviteeUserId;
        invitation.inviteeFirstName = "Invité";
        invitation.expiresAt = expiresAt;
        invitation.usedAt = usedAt;
        invitation.acceptedBy = null;
        babyInvitationRepository.persist(invitation);
        return invitation.token;
    }

    // Recipient the invitation was issued to (Épic 17).
    @Transactional
    public UUID invitationInvitee(UUID token) {
        BabyInvitation i = babyInvitationRepository.findById(token);
        return i == null ? null : i.inviteeUserId;
    }

    @Transactional
    public UUID invitationCreatedBy(UUID token) {
        BabyInvitation i = babyInvitationRepository.findById(token);
        return i == null ? null : i.createdBy;
    }

    // Account that actually accepted the invitation (null while pending or after a revocation).
    @Transactional
    public UUID invitationAcceptedBy(UUID token) {
        BabyInvitation i = babyInvitationRepository.findById(token);
        return i == null ? null : i.acceptedBy;
    }

    @Transactional
    public Instant invitationExpiresAt(UUID token) {
        BabyInvitation i = babyInvitationRepository.findById(token);
        return i == null ? null : i.expiresAt;
    }

    // === Épic 17 : lecteurs d'état de compte ===

    // Activation date of an account, null while it is pending (Épic 17, D17-V).
    @Transactional
    public Instant activatedAt(UUID userId) {
        AppUser user = appUserRepository.findById(userId);
        return user == null ? null : user.activatedAt;
    }

    // Stored hash, to prove that a refused request left the credentials untouched.
    @Transactional
    public String passwordHash(UUID userId) {
        AppUser user = appUserRepository.findById(userId);
        return user == null ? null : user.passwordHash;
    }

    @Transactional
    public String userFirstName(UUID userId) {
        AppUser user = appUserRepository.findById(userId);
        return user == null ? null : user.firstName;
    }

    @Transactional
    public String userRole(UUID userId) {
        AppUser user = appUserRepository.findById(userId);
        return user == null ? null : user.role;
    }

    // Id of the account holding this email, null when none exists.
    @Transactional
    public UUID userIdByEmail(String email) {
        AppUser user = appUserRepository.findByEmail(email);
        return user == null ? null : user.id;
    }

    @Transactional
    public long countUsersByEmail(String email) {
        return appUserRepository.countByEmail(email);
    }

    // All activation tokens of an account, consumed or not.
    @Transactional
    public long countActivationTokens(UUID userId) {
        return activationTokenRepository.count("appUserId", userId);
    }

    // Activation tokens still usable (not consumed): a regenerated link must leave exactly one (Épic 20).
    @Transactional
    public long countActiveActivationTokens(UUID userId) {
        return activationTokenRepository.count("appUserId = ?1 and usedAt is null", userId);
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
