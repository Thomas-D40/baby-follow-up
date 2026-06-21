package com.suivibaby.service;

import com.suivibaby.entity.Stool;
import com.suivibaby.mapper.StoolMapper;
import com.suivibaby.model.CreateStoolRequest;
import com.suivibaby.model.StoolPage;
import com.suivibaby.model.StoolResponse;
import com.suivibaby.model.UpdateStoolRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.StoolRepository;
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
 * CRUD des selles sous le filtre d'appartenance au bébé (US5.1, D5-B/D5-C/D5-H). Événement ponctuel,
 * comme le biberon (D5-A) : pas de clé d'idempotence (D5-G), {@code INSERT} simple. L'isolation/IDOR
 * (D5-C) repose sur deux checks → 404 chacun : (1) {@code isLinked(currentUser, babyId-path)} ;
 * (2) {@code event.baby_id == babyId-path}. Les entités ne quittent jamais cette couche : les appelants
 * reçoivent des {@link StoolResponse}.
 */
@ApplicationScoped
public class StoolService {

    private static final int MAX_LIMIT = 50;
    private static final long FLOOR_DAYS = 730; // ~2 ans (D3-D), plancher glissant heuristique
    private static final long SKEW_MINUTES = 5; // tolérance d'horloge (D3-D)

    @Inject
    StoolRepository stoolRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    StoolMapper stoolMapper;

    /** Création (US5.1) : {@code author_id} = utilisateur courant, {@code occurredAt} défaut = now. */
    @Transactional
    public StoolResponse create(UUID userId, UUID babyId, CreateStoolRequest request) {
        requireLinked(userId, babyId);
        Stool event = new Stool();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = validateOccurredAt(request.occurredAt());
        event.consistency = request.consistency(); // optionnelle ; hors enum → 400 à la désérialisation
        event.authorId = userId;
        event.createdAt = Instant.now();
        stoolRepository.persist(event);
        return stoolMapper.toResponse(event);
    }

    /** Liste paginée keyset (D3-J / D5-I), récent→ancien. {@code before == null} = 1ʳᵉ page. */
    public StoolPage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : Cursor.decode(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 pour savoir précisément s'il existe une page suivante (sinon nextCursor = null).
        List<Stool> rows = stoolRepository.page(babyId, beforeTime, beforeId, pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            Stool last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.occurredAt, last.id).encode();
        }
        return new StoolPage(stoolMapper.toResponses(rows), nextCursor);
    }

    /**
     * Selles d'un jour pour le calendrier (Épic 6, US6.1) : point {@code occurred_at ∈ [from, to)}
     * (D6-C), tri {@code occurred_at ASC}. {@code assertLinked} → 404 si non lié (D6-E).
     */
    public List<StoolResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return stoolMapper.toResponses(stoolRepository.listForDay(babyId, from, to));
    }

    /** Nombre de selles du jour {@code [from, to)} (US6.3). {@code assertLinked} → 404 (D6-E). */
    public long countForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return stoolRepository.countForDay(babyId, from, to);
    }

    /** Édition partielle (D5-B, API only D5-J), ouverte à tout caregiver lié (D5-H). Champs non-null seulement. */
    @Transactional
    public StoolResponse update(UUID userId, UUID babyId, UUID id, UpdateStoolRequest request) {
        Stool event = requireEvent(userId, babyId, id);
        if (request.occurredAt() != null) {
            event.occurredAt = validateOccurredAt(request.occurredAt());
        }
        if (request.consistency() != null) {
            event.consistency = request.consistency();
        }
        return stoolMapper.toResponse(event); // entité managée flushée au commit
    }

    /** Suppression (D5-B), ouverte à tout caregiver lié (D5-H). */
    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        stoolRepository.deleteById(id);
    }

    // --- Helpers transverses (D3-H) ---

    /** Check IDOR n°1 (D5-C) : appartenance au bébé du path. Non lié → 404 (anti-énumération). */
    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    /**
     * Checks IDOR n°1 + n°2 (D5-C) : (1) bébé lié à l'utilisateur ; (2) l'événement appartient bien à
     * ce bébé. Chaque échec → 404 strict (jamais 400/403), y compris pour un id d'événement forgé
     * pointant un bébé d'autrui (jalon US1.5).
     */
    private Stool requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        Stool event = stoolRepository.findById(id);
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

    /** Bornes {@code now − 2 ans ≤ occurredAt ≤ now + 5 min} (D3-D / D5-D). Défaut = now si absent. */
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
