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

/**
 * Cycle de vie + correction des siestes sous le filtre d'appartenance au bébé (US4.1/4.2/4.3).
 * Deux familles séparées (D4-B) : <strong>use-case</strong> (sieste courante, sans id : start/end/reopen,
 * transitions atomiques côté serveur) et <strong>REST</strong> (donnée brute par id : list/current/update/delete).
 * Invariant central : au plus une sieste ouverte par bébé (index partiel {@code uq_open_nap}, D4-C) —
 * référent unique de end/reopen et anti-doublon serveur gratuit. Isolation/IDOR (D4-G/D3-C) : deux checks
 * → 404 chacun sur les routes à {@code {id}}. Les entités ne quittent jamais cette couche.
 */
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

    /**
     * Démarre une sieste (US4.1) : {@code INSERT} {@code end_at = NULL}, {@code author_id} = courant,
     * {@code start_at} défaut = now. Pré-check « une ouverte ? » → 409 (D4-D) ; l'index {@code uq_open_nap}
     * reste le filet concurrentiel (D4-C). Pas de clé d'idempotence (D4-J).
     */
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

    /**
     * Termine la sieste ouverte (US4.2) : applique {@code end_at} à la seule sieste {@code end_at IS NULL}
     * du bébé (D4-A). Aucune ouverte → 409 « aucune sieste en cours » (D4-D). {@code end_at} défaut = now,
     * borné {@code start_at ≤ end_at ≤ now + 5 min} (D4-H).
     */
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

    /**
     * Rouvre la <strong>dernière</strong> sieste (US4.3, annule une fin erronée) : remet {@code end_at = NULL}
     * sur la sieste la plus récente (tri {@code start_at DESC, id DESC}, D4-E). Une autre déjà ouverte → 409 ;
     * aucune sieste → 409. Le pré-check « ouverte ? » garantit qu'on ne viole pas {@code uq_open_nap}.
     */
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

    /** État courant (D4-L) : la sieste ouverte ou {@code null} (→ 204 au controller). */
    public NapResponse current(UUID userId, UUID babyId) {
        requireLinked(userId, babyId);
        Nap nap = napRepository.findCurrent(babyId);
        return nap == null ? null : napMapper.toResponse(nap);
    }

    /** Liste paginée keyset (D3-J / D4-L), récent→ancien par {@code start_at}. {@code before == null} = 1ʳᵉ page. */
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

    /**
     * Siestes chevauchant un jour pour le calendrier (Épic 6, US6.1) : overlap
     * {@code start_at < to AND (end_at > from OR end_at IS NULL)} (D6-C) — apparaît sur tous les jours
     * chevauchés (sieste de nuit, D6-F). {@code endAt = null} = en cours. {@code assertLinked} → 404 (D6-E).
     */
    public List<NapResponse> listForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return napMapper.toResponses(napRepository.listForDay(babyId, from, to));
    }

    /**
     * Minutes de sommeil du jour {@code [from, to)} (US6.3), clippées à la fenêtre (D6-F) ; sieste en
     * cours comptée jusqu'à {@code now()} (D6-G). {@code 0} si aucune sieste. {@code assertLinked} → 404 (D6-E).
     */
    public long sleepMinutesForDay(UUID userId, UUID babyId, Instant from, Instant to) {
        requireLinked(userId, babyId);
        return napRepository.sleepMinutesForDay(babyId, from, to);
    }

    /**
     * Correction de valeurs (US4.3, D4-F) : {@code startAt}/{@code endAt} non-null seulement ; jamais de
     * transition d'état. Poser une fin sur une sieste <em>ouverte</em> → 409 (fermeture = use-case). Bornes
     * {@code start_at ≤ end_at ≤ now + 5 min}. Ouvert à tout caregiver lié (D3-I) ; deux checks IDOR (D4-G).
     */
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

    /** Suppression (US4.3) — remède au miss-click / sieste fantôme. Ouvert à tout caregiver lié (D3-I). */
    @Transactional
    public void delete(UUID userId, UUID babyId, UUID id) {
        requireEvent(userId, babyId, id);
        napRepository.deleteById(id);
    }

    // --- Helpers transverses (D3-H) ---

    /** Check IDOR n°1 (D4-G/D3-C) : appartenance au bébé du path. Non lié → 404 (anti-énumération). */
    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    /**
     * Checks IDOR n°1 + n°2 (D4-G/D3-C) : (1) bébé lié à l'utilisateur ; (2) la sieste appartient bien à
     * ce bébé. Chaque échec → 404 strict (jamais 400/403), y compris pour un id forgé pointant la sieste
     * d'un autre bébé (jalon US1.5).
     */
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

    /** Borne {@code now − 2 ans ≤ startAt ≤ now + 5 min} (D4-H). Défaut = now si absent. */
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

    /** Borne {@code startAt ≤ endAt ≤ now + 5 min} (D4-H). Défaut = now si absent. */
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

    /** Validation combinée pour le PATCH (D4-F) : start borné, et si end posé, {@code start ≤ end ≤ now+5min}. */
    private void validateNapTimes(Instant startAt, Instant endAt) {
        validateStartAt(startAt);
        if (endAt != null) {
            validateEndAt(endAt, startAt);
        }
    }
}
