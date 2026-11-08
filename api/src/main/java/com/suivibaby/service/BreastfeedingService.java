package com.suivibaby.service;

import com.suivibaby.entity.Breastfeeding;
import com.suivibaby.mapper.BreastfeedingMapper;
import com.suivibaby.model.BreastfeedingPage;
import com.suivibaby.model.BreastfeedingResponse;
import com.suivibaby.model.CreateBreastfeedingRequest;
import com.suivibaby.model.UpdateBreastfeedingRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BreastfeedingRepository;
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
public class BreastfeedingService {

    private static final int MAX_LIMIT = 50;
    private static final int MIN_DURATION_MINUTES = 1;
    private static final int MAX_DURATION_MINUTES = 120;
    private static final long FLOOR_DAYS = 730; // ~2 years, sliding floor (same as every event)
    private static final long SKEW_MINUTES = 5; // clock tolerance (same as every event)

    @Inject
    BreastfeedingRepository breastfeedingRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    BreastfeedingMapper breastfeedingMapper;

    @Transactional
    public BreastfeedingResponse create(UUID userId, UUID babyId, CreateBreastfeedingRequest request) {
        requireLinked(userId, babyId);
        Breastfeeding event = new Breastfeeding();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = validateOccurredAt(request.occurredAt());
        event.side = request.side();
        event.durationMinutes = validateDuration(request.durationMinutes());
        event.authorId = userId;
        event.createdAt = Instant.now();
        breastfeedingRepository.persist(event);
        return breastfeedingMapper.toResponse(event);
    }

    public BreastfeedingPage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : decodeCursor(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        Instant beforeCreatedAt = cursor == null ? null : cursor.createdAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 tells whether a next page exists (otherwise nextCursor = null).
        List<Breastfeeding> rows = breastfeedingRepository.page(babyId, beforeTime, beforeCreatedAt, beforeId,
                pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            Breastfeeding last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.occurredAt, last.createdAt, last.id).encode();
        }
        return new BreastfeedingPage(breastfeedingMapper.toResponses(rows), nextCursor);
    }

    public List<BreastfeedingResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return breastfeedingMapper.toResponses(breastfeedingRepository.listForDay(babyId, from, to));
    }

    public long countForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return breastfeedingRepository.countForDay(babyId, from, to);
    }

    @Transactional
    public BreastfeedingResponse update(UUID userId, UUID babyId, UUID id, UpdateBreastfeedingRequest request) {
        Breastfeeding event = requireEvent(userId, babyId, id);
        if (request == null) {
            throw new BadRequestException("Corps de requête requis.");
        }
        // Unlike bottle/stool (null = unchanged), the two optional fields are CLEARED by null: the
        // edit form always sends every field, and "back to unspecified" (side) or "no duration" must
        // be expressible. Only the required occurredAt keeps "null = unchanged" (D18-AC).
        if (request.occurredAt() != null) {
            event.occurredAt = validateOccurredAt(request.occurredAt());
        }
        event.side = request.side();
        event.durationMinutes = validateDuration(request.durationMinutes());
        return breastfeedingMapper.toResponse(event); // managed entity flushed at commit
    }

    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        breastfeedingRepository.deleteById(id);
    }

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    private Breastfeeding requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        Breastfeeding event = breastfeedingRepository.findById(id);
        if (event == null || !event.babyId.equals(babyId)) {
            throw new NotFoundException();
        }
        return event;
    }

    // This keyset needs the entry time: a two-part token (another list's) cannot position a page here.
    private Cursor decodeCursor(String token) {
        Cursor cursor = Cursor.decode(token);
        if (cursor.createdAt() == null) {
            throw new BadRequestException("Curseur invalide.");
        }
        return cursor;
    }

    private int resolveLimit(int limit) {
        if (limit < 1) {
            throw new BadRequestException("Paramètre limit invalide.");
        }
        return Math.min(limit, MAX_LIMIT);
    }

    private Integer validateDuration(Integer durationMinutes) {
        if (durationMinutes != null
                && (durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES)) {
            throw new BadRequestException("Durée invalide (1 ≤ durationMinutes ≤ 120).");
        }
        return durationMinutes;
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
