package com.suivibaby.service;

import com.suivibaby.entity.MedicalCare;
import com.suivibaby.mapper.MedicalCareMapper;
import com.suivibaby.model.CareType;
import com.suivibaby.model.CreateMedicalCareRequest;
import com.suivibaby.model.MedicalCarePage;
import com.suivibaby.model.MedicalCareResponse;
import com.suivibaby.model.UpdateMedicalCareRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.MedicalCareRepository;
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
public class MedicalCareService {

    private static final int MAX_LIMIT = 50;
    private static final long FLOOR_DAYS = 730; // ~2 years (D3-D), heuristic sliding floor
    private static final long SKEW_MINUTES = 5; // clock skew tolerance (D3-D)

    @Inject
    MedicalCareRepository medicalCareRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    MedicalCareMapper medicalCareMapper;

    @Transactional
    public MedicalCareResponse create(UUID userId, UUID babyId, CreateMedicalCareRequest request) {
        requireLinked(userId, babyId);
        MedicalCare event = new MedicalCare();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.careType = parseType(request.careType());
        event.occurredAt = validateOccurredAt(request.occurredAt());
        event.authorId = userId;
        event.createdAt = Instant.now();
        medicalCareRepository.persist(event);
        return medicalCareMapper.toResponse(event);
    }

    public MedicalCarePage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : Cursor.decode(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 to know exactly whether a next page exists (otherwise nextCursor = null).
        List<MedicalCare> rows = medicalCareRepository.page(babyId, beforeTime, beforeId, pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            MedicalCare last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.occurredAt, last.id).encode();
        }
        return new MedicalCarePage(medicalCareMapper.toResponses(rows), nextCursor);
    }

    public List<MedicalCareResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return medicalCareMapper.toResponses(medicalCareRepository.listForDay(babyId, from, to));
    }

    // Per type (D15-K): the recap renders one chip per care type, so it calls this twice.
    public long countForDay(UUID userId, UUID babyId, CareType careType, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return medicalCareRepository.countForDay(babyId, careType, from, to);
    }

    @Transactional
    public MedicalCareResponse update(UUID userId, UUID babyId, UUID id, UpdateMedicalCareRequest request) {
        MedicalCare event = requireEvent(userId, babyId, id);
        if (request.occurredAt() != null) {
            event.occurredAt = validateOccurredAt(request.occurredAt());
        }
        if (request.careType() != null) {
            event.careType = request.careType();
        }
        return medicalCareMapper.toResponse(event); // managed entity, flushed on commit
    }

    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        medicalCareRepository.deleteById(id);
    }

    // --- Cross-cutting helpers (D3-H) ---

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    private MedicalCare requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        MedicalCare event = medicalCareRepository.findById(id);
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

    // Closed enum (D15-I): a care without a type is not a care. A value outside eye|nose is already
    // refused by Jackson at deserialization (400), like StoolConsistency; what reaches here is null,
    // i.e. an absent field — same rejection, message spelled out.
    private CareType parseType(CareType careType) {
        if (careType == null) {
            throw new BadRequestException("Type de soin inconnu.");
        }
        return careType;
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
