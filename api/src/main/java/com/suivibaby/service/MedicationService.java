package com.suivibaby.service;

import com.suivibaby.entity.Medication;
import com.suivibaby.mapper.MedicationMapper;
import com.suivibaby.model.CreateMedicationRequest;
import com.suivibaby.model.MedicationPage;
import com.suivibaby.model.MedicationResponse;
import com.suivibaby.model.UpdateMedicationRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.MedicationRepository;
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
public class MedicationService {

    private static final int MAX_LIMIT = 50;
    private static final int MAX_TEXT_LENGTH = 60; // name and dosage
    private static final long FLOOR_DAYS = 730; // ~2 years, sliding floor (same as every event)
    private static final long SKEW_MINUTES = 5; // clock tolerance (same as every event)

    @Inject
    MedicationRepository medicationRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    MedicationMapper medicationMapper;

    @Transactional
    public MedicationResponse create(UUID userId, UUID babyId, CreateMedicationRequest request) {
        requireLinked(userId, babyId);
        requireBody(request);
        Medication event = new Medication();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = validateOccurredAt(request.occurredAt());
        event.medicationName = validateName(request.medicationName());
        event.dosage = validateDosage(request.dosage());
        event.authorId = userId;
        event.createdAt = Instant.now();
        medicationRepository.persist(event);
        return medicationMapper.toResponse(event);
    }

    public MedicationPage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : Cursor.decode(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 tells whether a next page exists (otherwise nextCursor = null).
        List<Medication> rows = medicationRepository.page(babyId, beforeTime, beforeId, pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            Medication last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.occurredAt, last.id).encode();
        }
        return new MedicationPage(medicationMapper.toResponses(rows), nextCursor);
    }

    public List<MedicationResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return medicationMapper.toResponses(medicationRepository.listForDay(babyId, from, to));
    }

    public long countForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return medicationRepository.countForDay(babyId, from, to);
    }

    @Transactional
    public MedicationResponse update(UUID userId, UUID babyId, UUID id, UpdateMedicationRequest request) {
        Medication event = requireEvent(userId, babyId, id);
        requireBody(request);
        // The optional dosage is CLEARED by null (the edit form always sends every field), while the
        // required occurredAt and medicationName keep "null = unchanged" (D19-P).
        if (request.occurredAt() != null) {
            event.occurredAt = validateOccurredAt(request.occurredAt());
        }
        if (request.medicationName() != null) {
            event.medicationName = validateName(request.medicationName());
        }
        event.dosage = validateDosage(request.dosage());
        return medicationMapper.toResponse(event); // managed entity flushed at commit
    }

    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        medicationRepository.deleteById(id);
    }

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    private Medication requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        Medication event = medicationRepository.findById(id);
        if (event == null || !event.babyId.equals(babyId)) {
            throw new NotFoundException();
        }
        return event;
    }

    private void requireBody(Object request) {
        if (request == null) {
            throw new BadRequestException("Corps de requête requis.");
        }
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

    private String validateName(String raw) {
        String name = TextLabels.tidy(raw);
        if (name.isEmpty()) {
            throw new BadRequestException("Indiquez le médicament.");
        }
        if (name.length() > MAX_TEXT_LENGTH) {
            throw new BadRequestException("Médicament trop long (60 caractères au plus).");
        }
        return name;
    }

    // An empty or blank dosage means "no dosage given" and is stored as null.
    private String validateDosage(String raw) {
        String dosage = TextLabels.tidy(raw);
        if (dosage.isEmpty()) {
            return null;
        }
        if (dosage.length() > MAX_TEXT_LENGTH) {
            throw new BadRequestException("Posologie trop longue (60 caractères au plus).");
        }
        return dosage;
    }
}
