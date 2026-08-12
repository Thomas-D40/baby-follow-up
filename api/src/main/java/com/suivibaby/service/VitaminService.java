package com.suivibaby.service;

import com.suivibaby.entity.VitaminIntake;
import com.suivibaby.mapper.VitaminMapper;
import com.suivibaby.model.VitaminDayResponse;
import com.suivibaby.model.VitaminState;
import com.suivibaby.model.VitaminType;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.VitaminIntakeRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.UUID;

/**
 * Vitamine = **état-jour idempotent** (US9.1, D9-A) : cocher = présence de ligne, décocher = absence.
 * Un seul check IDOR (D9-C) : {@code requireLinked} sur {@code babyId} de chemin suffit — aucun id
 * d'événement nu à forger. Bornes jour en Europe/Paris (D9-E), cohérent avec le récap calendrier.
 */
@ApplicationScoped
public class VitaminService {

    static final ZoneId PARIS = ZoneId.of("Europe/Paris");

    @Inject
    VitaminIntakeRepository vitaminIntakeRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    VitaminMapper vitaminMapper;

    /** État du jour : matrice complète d/k. Pas de borne futur en lecture (jour futur = tout à false). */
    public VitaminDayResponse day(UUID userId, UUID babyId, String dateParam) {
        requireLinked(userId, babyId);
        LocalDate day = resolveDate(dateParam);
        return vitaminMapper.toDayResponse(day, vitaminIntakeRepository.listForDay(babyId, day));
    }

    /** Coche → 200 idempotent (D9-B). L'author reste celui du 1ᵉʳ cocheur (ON CONFLICT DO NOTHING, D9-F). */
    @Transactional
    public VitaminState give(UUID userId, UUID babyId, String typeParam, String dateParam) {
        requireLinked(userId, babyId);
        VitaminType type = parseType(typeParam);
        LocalDate day = resolveWritableDate(dateParam);
        vitaminIntakeRepository.insertIfAbsent(babyId, type, day, userId);
        // Relecture volontaire (non redondante) : sur re-POST idempotent (ON CONFLICT DO NOTHING), la
        // ligne peut préexister avec l'author du PREMIER cocheur — c'est celui-là qu'on doit renvoyer,
        // pas `userId` (cf. test re_post_idempotent). La ligne existe toujours après insertIfAbsent dans
        // la même transaction ; un `null` (race/rollback concurrent extrême) dégrade en given=false sans NPE.
        VitaminIntake row = vitaminIntakeRepository.findByKey(babyId, type, day);
        return vitaminMapper.toState(type, row);
    }

    /** Décoche → 204 idempotent systématique (D9-B) : supprime 0 ou 1 ligne. */
    @Transactional
    public void unset(UUID userId, UUID babyId, String typeParam, String dateParam) {
        requireLinked(userId, babyId);
        VitaminType type = parseType(typeParam);
        LocalDate day = resolveWritableDate(dateParam);
        vitaminIntakeRepository.deleteByKey(babyId, type, day);
    }

    // --- Helpers ---

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    private VitaminType parseType(String raw) {
        try {
            return VitaminType.valueOf(raw);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new BadRequestException("Type de vitamine inconnu.");
        }
    }

    /** Jour de consultation : défaut = aujourd'hui (Paris) ; format invalide → 400. Pas de borne futur. */
    private LocalDate resolveDate(String dateParam) {
        if (dateParam == null || dateParam.isBlank()) {
            return LocalDate.now(PARIS);
        }
        try {
            return LocalDate.parse(dateParam);
        } catch (DateTimeParseException e) {
            throw new BadRequestException("Date invalide (format attendu YYYY-MM-DD).");
        }
    }

    /** Jour d'écriture (D9-E) : défaut = aujourd'hui (Paris) ; un jour futur → 400 (on note ce qui a été donné). */
    private LocalDate resolveWritableDate(String dateParam) {
        LocalDate day = resolveDate(dateParam);
        if (day.isAfter(LocalDate.now(PARIS))) {
            throw new BadRequestException("Impossible de noter une vitamine pour un jour futur.");
        }
        return day;
    }
}
