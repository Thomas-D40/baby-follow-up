package com.suivibaby.service;

import com.suivibaby.entity.Nap;
import com.suivibaby.mapper.NapMapper;
import com.suivibaby.model.EndNapRequest;
import com.suivibaby.model.NapPage;
import com.suivibaby.model.NapResponse;
import com.suivibaby.model.StartNapRequest;
import com.suivibaby.model.UpdateNapRequest;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.NapRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@ApplicationScoped
public class NapService {

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 50;
    private static final long FLOOR_DAYS = 730; // ~2 ans (D3-D/D4-H), plancher glissant heuristique
    private static final long SKEW_MINUTES = 5; // tolérance d'horloge (D3-D/D4-H)

    @Inject
    NapRepository napRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    NapMapper napMapper;

    // --- API use-case : sieste courante (D4-B) ---

    @Transactional
    public NapResponse start(UUID userId, UUID babyId, StartNapRequest request) {
        requireLinked(userId, babyId);
        if (napRepository.existsOpen(babyId)) {
            throw new ClientErrorException("Une sieste est déjà en cours.", Response.Status.CONFLICT);
        }
        Nap nap = new Nap();
        nap.id = UUID.randomUUID();
        nap.babyId = babyId;
        nap.startAt = validateStartAt(request == null ? null : request.startAt());
        nap.endAt = null;
        nap.authorId = userId;
        nap.createdAt = Instant.now();
        napRepository.persist(nap);
        return napMapper.toResponse(nap);
    }

    @Transactional
    public NapResponse end(UUID userId, UUID babyId, EndNapRequest request) {
        requireLinked(userId, babyId);
        Nap nap = napRepository.findCurrent(babyId);
        if (nap == null) {
            throw new ClientErrorException("Aucune sieste en cours.", Response.Status.CONFLICT);
        }
        nap.endAt = validateEndAt(request == null ? null : request.endAt(), nap.startAt);
        return napMapper.toResponse(nap); // entité managée flushée au commit
    }

    @Transactional
    public NapResponse reopen(UUID userId, UUID babyId) {
        requireLinked(userId, babyId);
        if (napRepository.existsOpen(babyId)) {
            throw new ClientErrorException("Une sieste est déjà en cours.", Response.Status.CONFLICT);
        }
        Nap latest = napRepository.findLatest(babyId);
        if (latest == null) {
            throw new ClientErrorException("Aucune sieste à rouvrir.", Response.Status.CONFLICT);
        }
        latest.endAt = null; // managée ; aucune ouverte n'existe → uq_open_nap respecté
        return napMapper.toResponse(latest);
    }

    // --- API REST : donnée brute par id (D4-B) ---

    public NapResponse current(UUID userId, UUID babyId) {
        requireLinked(userId, babyId);
        Nap nap = napRepository.findCurrent(babyId);
        return nap == null ? null : napMapper.toResponse(nap);
    }

    public NapPage list(UUID userId, UUID babyId, int limit, String before) {
        requireLinked(userId, babyId);
        int pageSize = resolveLimit(limit);
        Cursor cursor = before == null ? null : Cursor.decode(before);
        Instant beforeTime = cursor == null ? null : cursor.occurredAt();
        UUID beforeId = cursor == null ? null : cursor.id();

        // limit + 1 pour savoir précisément s'il existe une page suivante (sinon nextCursor = null).
        List<Nap> rows = napRepository.page(babyId, beforeTime, beforeId, pageSize + 1);
        String nextCursor = null;
        if (rows.size() > pageSize) {
            rows = rows.subList(0, pageSize);
            Nap last = rows.get(rows.size() - 1);
            nextCursor = new Cursor(last.startAt, last.id).encode();
        }
        return new NapPage(napMapper.toResponses(rows), nextCursor);
    }

    public List<NapResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return napMapper.toResponses(napRepository.listForDay(babyId, from, to));
    }

    public long sleepMinutesForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return napRepository.sleepMinutesForDay(babyId, from, to);
    }

    @Transactional
    public NapResponse update(UUID userId, UUID babyId, UUID id, UpdateNapRequest request) {
        Nap nap = requireEvent(userId, babyId, id);
        if (request.endAt() != null && nap.endAt == null) {
            throw new ClientErrorException(
                    "Sieste en cours : utilisez Terminer pour poser une fin.", Response.Status.CONFLICT);
        }
        if (request.startAt() != null) {
            nap.startAt = request.startAt();
        }
        if (request.endAt() != null) {
            nap.endAt = request.endAt();
        }
        validateNapTimes(nap.startAt, nap.endAt);
        return napMapper.toResponse(nap); // entité managée flushée au commit
    }

    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        napRepository.deleteById(id);
    }

    // --- Helpers transverses (D3-H) ---

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    private Nap requireEvent(UUID userId, UUID babyId, UUID id) {
        requireLinked(userId, babyId);
        Nap nap = napRepository.findById(id);
        if (nap == null || !nap.babyId.equals(babyId)) {
            throw new NotFoundException();
        }
        return nap;
    }

    private int resolveLimit(int limit) {
        if (limit < 1) {
            throw new BadRequestException("Paramètre limit invalide.");
        }
        return Math.min(limit, MAX_LIMIT);
    }

    private Instant validateStartAt(Instant startAt) {
        Instant now = Instant.now();
        Instant value = startAt == null ? now : startAt;
        if (value.isAfter(now.plus(SKEW_MINUTES, ChronoUnit.MINUTES))) {
            throw new BadRequestException("startAt dans le futur.");
        }
        if (value.isBefore(now.minus(FLOOR_DAYS, ChronoUnit.DAYS))) {
            throw new BadRequestException("startAt trop ancien.");
        }
        return value;
    }

    private Instant validateEndAt(Instant endAt, Instant startAt) {
        Instant now = Instant.now();
        Instant value = endAt == null ? now : endAt;
        if (value.isAfter(now.plus(SKEW_MINUTES, ChronoUnit.MINUTES))) {
            throw new BadRequestException("endAt dans le futur.");
        }
        if (value.isBefore(startAt)) {
            throw new BadRequestException("endAt antérieur à startAt.");
        }
        return value;
    }

    private void validateNapTimes(Instant startAt, Instant endAt) {
        validateStartAt(startAt);
        if (endAt != null) {
            validateEndAt(endAt, startAt);
        }
    }
}
