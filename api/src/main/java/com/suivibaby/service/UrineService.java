package com.suivibaby.service;

import com.suivibaby.entity.Urine;
import com.suivibaby.mapper.UrineMapper;
import com.suivibaby.model.CreateUrineRequest;
import com.suivibaby.model.UrinePage;
import com.suivibaby.model.UrineResponse;
import com.suivibaby.model.UpdateUrineRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.UrineRepository;
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
public class UrineService {

    private static final int MAX_LIMIT = 50;
    private static final long FLOOR_DAYS = 730; // ~2 ans (D3-D), plancher glissant heuristique
    private static final long SKEW_MINUTES = 5; // tolérance d'horloge (D3-D)

    @Inject
    UrineRepository urineRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    UrineMapper urineMapper;

    @Transactional
    public UrineResponse create(UUID userId, UUID babyId, CreateUrineRequest request) {
        requireLinked(userId, babyId);
        Urine event = new Urine();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = validateOccurredAt(request.occurredAt());
        event.authorId = userId;
        event.createdAt = Instant.now();
        urineRepository.persist(event);
        return urineMapper.toResponse(event);
    }

    public UrinePage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : Cursor.decode(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 pour savoir précisément s'il existe une page suivante (sinon nextCursor = null).
        List<Urine> rows = urineRepository.page(babyId, beforeTime, beforeId, pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            Urine last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.occurredAt, last.id).encode();
        }
        return new UrinePage(urineMapper.toResponses(rows), nextCursor);
    }

    public List<UrineResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return urineMapper.toResponses(urineRepository.listForDay(babyId, from, to));
    }

    public long countForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return urineRepository.countForDay(babyId, from, to);
    }

    @Transactional
    public UrineResponse update(UUID userId, UUID babyId, UUID id, UpdateUrineRequest request) {
        Urine event = requireEvent(userId, babyId, id);
        if (request.occurredAt() != null) {
            event.occurredAt = validateOccurredAt(request.occurredAt());
        }
        return urineMapper.toResponse(event); // entité managée flushée au commit
    }

    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        urineRepository.deleteById(id);
    }

    // --- Helpers transverses (D3-H) ---

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    private Urine requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        Urine event = urineRepository.findById(id);
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
