package com.suivibaby.service;

import com.suivibaby.entity.Temperature;
import com.suivibaby.mapper.TemperatureMapper;
import com.suivibaby.model.CreateTemperatureRequest;
import com.suivibaby.model.TemperaturePage;
import com.suivibaby.model.TemperatureResponse;
import com.suivibaby.model.UpdateTemperatureRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.TemperatureRepository;
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
public class TemperatureService {

    private static final int MAX_LIMIT = 50;
    private static final long FLOOR_DAYS = 730; // ~2 years (D3-D), heuristic sliding floor
    private static final long SKEW_MINUTES = 5; // clock skew tolerance (D3-D)

    // Bounds in tenths of a degree Celsius (D15-J): 30.0 °C .. 43.0 °C. Celsius only, no Fahrenheit.
    private static final int MIN_CELSIUS_X10 = 300;
    private static final int MAX_CELSIUS_X10 = 430;

    @Inject
    TemperatureRepository temperatureRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    TemperatureMapper temperatureMapper;

    @Transactional
    public TemperatureResponse create(UUID userId, UUID babyId, CreateTemperatureRequest request) {
        requireLinked(userId, babyId);
        Temperature event = new Temperature();
        event.id = UUID.randomUUID();
        event.babyId = babyId;
        event.occurredAt = validateOccurredAt(request.occurredAt());
        event.temperatureCelsiusX10 = validateTemperature(request.temperatureCelsiusX10());
        event.authorId = userId;
        event.createdAt = Instant.now();
        temperatureRepository.persist(event);
        return temperatureMapper.toResponse(event);
    }

    public TemperaturePage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : Cursor.decode(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 to know exactly whether a next page exists (otherwise nextCursor = null).
        List<Temperature> rows = temperatureRepository.page(babyId, beforeTime, beforeId, pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            Temperature last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.occurredAt, last.id).encode();
        }
        return new TemperaturePage(temperatureMapper.toResponses(rows), nextCursor);
    }

    public List<TemperatureResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return temperatureMapper.toResponses(temperatureRepository.listForDay(babyId, from, to));
    }

    public long countForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return temperatureRepository.countForDay(babyId, from, to);
    }

    // Null when the day holds no reading (D15-K): the caller renders no chip at all, never a 0.
    public Integer maxForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return temperatureRepository.maxForDay(babyId, from, to);
    }

    @Transactional
    public TemperatureResponse update(UUID userId, UUID babyId, UUID id, UpdateTemperatureRequest request) {
        Temperature event = requireEvent(userId, babyId, id);
        if (request.occurredAt() != null) {
            event.occurredAt = validateOccurredAt(request.occurredAt());
        }
        if (request.temperatureCelsiusX10() != null) {
            event.temperatureCelsiusX10 = validateTemperature(request.temperatureCelsiusX10());
        }
        return temperatureMapper.toResponse(event); // managed entity, flushed on commit
    }

    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        temperatureRepository.deleteById(id);
    }

    // --- Cross-cutting helpers (D3-H) ---

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    private Temperature requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        Temperature event = temperatureRepository.findById(id);
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

    // Mandatory value, unlike the optional fields of the other events: a reading without a value is
    // not a reading. Bounds mirror the front-side ones (D15-J).
    private int validateTemperature(Integer temperatureCelsiusX10) {
        if (temperatureCelsiusX10 == null
                || temperatureCelsiusX10 < MIN_CELSIUS_X10
                || temperatureCelsiusX10 > MAX_CELSIUS_X10) {
            throw new BadRequestException("Température invalide (attendue en °C, 30,0 ≤ t ≤ 43,0).");
        }
        return temperatureCelsiusX10;
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
