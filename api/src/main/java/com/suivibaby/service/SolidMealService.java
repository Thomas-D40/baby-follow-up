package com.suivibaby.service;

import com.suivibaby.entity.SolidMeal;
import com.suivibaby.mapper.SolidMealMapper;
import com.suivibaby.model.CreateSolidMealRequest;
import com.suivibaby.model.DishResponse;
import com.suivibaby.model.DishSearchResponse;
import com.suivibaby.model.DishSuggestionsResponse;
import com.suivibaby.model.SolidMealPage;
import com.suivibaby.model.SolidMealResponse;
import com.suivibaby.model.UpdateSolidMealRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.SolidMealRepository;
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
public class SolidMealService {

    private static final int MAX_LIMIT = 50;
    private static final long FLOOR_DAYS = 730; // ~2 years, sliding floor (same as every event)
    private static final long SKEW_MINUTES = 5; // clock tolerance (same as every event)

    @Inject
    SolidMealRepository solidMealRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    SolidMealMapper solidMealMapper;

    @Inject
    DishService dishService;

    @Transactional
    public SolidMealResponse create(UUID userId, UUID babyId, CreateSolidMealRequest request) {
        requireLinked(userId, babyId);
        requireBody(request);
        SolidMeal event = new SolidMeal();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = validateOccurredAt(request.occurredAt());
        event.dish = DishLabels.validate(request.dish());
        event.portion = request.portion();
        event.authorId = userId;
        event.createdAt = Instant.now();
        solidMealRepository.persist(event);
        // Same transaction, after every validation: a refused meal adds no dish (D18-AF).
        if (request.addToDishes()) {
            dishService.addIfAbsent(userId, event.dish);
        }
        return solidMealMapper.toResponse(event);
    }

    public SolidMealPage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : Cursor.decode(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 tells whether a next page exists (otherwise nextCursor = null).
        List<SolidMeal> rows = solidMealRepository.page(babyId, beforeTime, beforeId, pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            SolidMeal last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.occurredAt, last.id).encode();
        }
        return new SolidMealPage(solidMealMapper.toResponses(rows), nextCursor);
    }

    public DishSuggestionsResponse getDishSuggestions(UUID userId, UUID babyId, String q) {
        requireLinked(userId, babyId);
        List<String> history = solidMealRepository.listDishesNewestFirst(babyId);
        String normalizedQuery = q == null ? "" : DishLabels.normalize(q);
        // The shared list only joins in once something is typed; its exactMatch ignores the history.
        DishSearchResponse shared = dishService.search(q);
        List<String> sharedLabels = shared.items().stream().map(DishResponse::label).toList();
        return new DishSuggestionsResponse(
                DishSuggestions.merge(history, sharedLabels, normalizedQuery), shared.exactMatch());
    }

    public List<SolidMealResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return solidMealMapper.toResponses(solidMealRepository.listForDay(babyId, from, to));
    }

    public long countForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return solidMealRepository.countForDay(babyId, from, to);
    }

    @Transactional
    public SolidMealResponse update(UUID userId, UUID babyId, UUID id, UpdateSolidMealRequest request) {
        SolidMeal event = requireEvent(userId, babyId, id);
        requireBody(request);
        // The optional portion is CLEARED by null (the edit form always sends every field), while the
        // required occurredAt and dish keep "null = unchanged" (D18-AC).
        if (request.occurredAt() != null) {
            event.occurredAt = validateOccurredAt(request.occurredAt());
        }
        if (request.dish() != null) {
            event.dish = DishLabels.validate(request.dish());
        }
        event.portion = request.portion();
        return solidMealMapper.toResponse(event); // managed entity flushed at commit
    }

    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        solidMealRepository.deleteById(id);
    }

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    private SolidMeal requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        SolidMeal event = solidMealRepository.findById(id);
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
}
