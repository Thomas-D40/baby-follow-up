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

    public List<StoolResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return stoolMapper.toResponses(stoolRepository.listForDay(babyId, from, to));
    }

    public long countForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return stoolRepository.countForDay(babyId, from, to);
    }

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

    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        stoolRepository.deleteById(id);
    }

    // --- Helpers transverses (D3-H) ---

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

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
