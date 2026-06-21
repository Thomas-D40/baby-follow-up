package com.suivibaby.service;

import com.suivibaby.entity.BottleFeeding;
import com.suivibaby.mapper.BottleFeedingMapper;
import com.suivibaby.model.BottleFeedingPage;
import com.suivibaby.model.BottleFeedingResponse;
import com.suivibaby.model.CreateBottleFeedingRequest;
import com.suivibaby.model.UpdateBottleFeedingRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BottleFeedingRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

/**
 * CRUD des biberons sous le filtre d'appartenance au bébé (US3.1, D3-B/D3-C/D3-I). Pas de clé
 * d'idempotence (D3-A) : {@code INSERT} simple. L'isolation/IDOR (D3-C) repose sur deux checks → 404
 * chacun : (1) {@code isLinked(currentUser, babyId-path)} ; (2) {@code event.baby_id == babyId-path}.
 * Les entités ne quittent jamais cette couche : les appelants reçoivent des {@link BottleFeedingResponse}.
 */
@ApplicationScoped
public class BottleFeedingService {

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 50;
    private static final int MAX_QUANTITY_ML = 2000;
    private static final long FLOOR_DAYS = 730; // ~2 ans (D3-D), plancher glissant heuristique
    private static final long SKEW_MINUTES = 5; // tolérance d'horloge (D3-D)

    @Inject
    BottleFeedingRepository bottleFeedingRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    BottleFeedingMapper bottleFeedingMapper;

    /** Création (US3.1) : {@code author_id} = utilisateur courant, {@code occurredAt} défaut = now. */
    @Transactional
    public BottleFeedingResponse create(UUID userId, UUID babyId, CreateBottleFeedingRequest request) {
        requireLinked(userId, babyId);
        BottleFeeding event = new BottleFeeding();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = validateOccurredAt(request.occurredAt());
        event.quantityMl = validateQuantity(request.quantityMl());
        event.milkType = request.milkType();
        event.authorId = userId;
        event.createdAt = Instant.now();
        bottleFeedingRepository.persist(event);
        return bottleFeedingMapper.toResponse(event);
    }

    /** Liste paginée keyset (D3-J), récent→ancien. {@code before == null} = 1ʳᵉ page. */
    public BottleFeedingPage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : Cursor.decode(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 pour savoir précisément s'il existe une page suivante (sinon nextCursor = null).
        List<BottleFeeding> rows = bottleFeedingRepository.page(babyId, beforeTime, beforeId, pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            BottleFeeding last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.occurredAt, last.id).encode();
        }
        return new BottleFeedingPage(bottleFeedingMapper.toResponses(rows), nextCursor);
    }

    /** Édition partielle (D3-B), ouverte à tout caregiver lié (D3-I). Champs non-null seulement. */
    @Transactional
    public BottleFeedingResponse update(UUID userId, UUID babyId, UUID id, UpdateBottleFeedingRequest request) {
        BottleFeeding event = requireEvent(userId, babyId, id);
        if (request.occurredAt() != null) {
            event.occurredAt = validateOccurredAt(request.occurredAt());
        }
        if (request.quantityMl() != null) {
            event.quantityMl = validateQuantity(request.quantityMl());
        }
        if (request.milkType() != null) {
            event.milkType = request.milkType();
        }
        return bottleFeedingMapper.toResponse(event); // entité managée flushée au commit
    }

    /** Suppression (D3-B), ouverte à tout caregiver lié (D3-I). */
    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        bottleFeedingRepository.deleteById(id);
    }

    // --- Helpers transverses (D3-H) ---

    /** Check IDOR n°1 (D3-C) : appartenance au bébé du path. Non lié → 404 (anti-énumération). */
    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    /**
     * Checks IDOR n°1 + n°2 (D3-C) : (1) bébé lié à l'utilisateur ; (2) l'événement appartient bien à
     * ce bébé. Chaque échec → 404 strict (jamais 400/403), y compris pour un id d'événement forgé
     * pointant un bébé d'autrui (jalon US1.5).
     */
    private BottleFeeding requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        BottleFeeding event = bottleFeedingRepository.findById(id);
        if (event == null || !event.babyId.equals(babyId)) {
            throw new NotFoundException();
        }
        return event;
    }

    private int resolveLimit(int limit) {
        if (limit < 1) {
            throw new BadRequestException("Paramètre limit invalide.");
        }
        return Math.min(limit, MAX_LIMIT);
    }

    /** Borne {@code 0 < quantityMl ≤ 2000} (D3-E). Null/hors-bornes → 400. */
    private int validateQuantity(Integer quantityMl) {
        if (quantityMl == null || quantityMl <= 0 || quantityMl > MAX_QUANTITY_ML) {
            throw new BadRequestException("Quantité invalide (0 < quantityMl ≤ 2000).");
        }
        return quantityMl;
    }

    /** Bornes {@code now − 2 ans ≤ occurredAt ≤ now + 5 min} (D3-D). Défaut = now si absent. */
    private Instant validateOccurredAt(Instant occurredAt) {
        Instant now = Instant.now();
        Instant value = occurredAt == null ? now : occurredAt;
        if (value.isAfter(now.plus(SKEW_MINUTES, ChronoUnit.MINUTES))) {
            throw new BadRequestException("occurredAt dans le futur.");
        }
        if (value.isBefore(now.minus(FLOOR_DAYS, ChronoUnit.DAYS))) {
            throw new BadRequestException("occurredAt trop ancien.");
        }
        return value;
    }
}
