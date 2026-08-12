package com.suivibaby.service;

import com.suivibaby.mapper.WeightMapper;
import com.suivibaby.model.UpsertWeightRequest;
import com.suivibaby.model.WeightHistoryResponse;
import com.suivibaby.model.WeightPoint;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.WeightRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.NotFoundException;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.UUID;

@ApplicationScoped
public class WeightService {

    static final ZoneId PARIS = ZoneId.of("Europe/Paris");
    static final int MAX_WEIGHT_GRAMS = 30000;

    @Inject
    WeightRepository weightRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    WeightMapper weightMapper;

    /** Historique complet trié given_on ASC (D12-D′). Un seul payload sert liste et courbe. */
    public WeightHistoryResponse history(UUID userId, UUID babyId) {
        requireLinked(userId, babyId);
        return weightMapper.toHistoryResponse(weightRepository.listAll(babyId));
    }

    /**
     * Upsert keyé date (D12-C′) : dernier écrivain gagne sur valeur ET author. Renvoie directement
     * {@code new WeightPoint(day, grams)} — la valeur écrite étant la valeur courante, aucune
     * relecture DB n'est nécessaire (contrairement à vitamine « premier gagnant »).
     */
    @Transactional
    public WeightPoint upsert(UUID userId, UUID babyId, String dateParam, UpsertWeightRequest body) {
        requireLinked(userId, babyId);
        int grams = validateWeight(body);
        LocalDate day = resolveWritableDate(dateParam);
        weightRepository.upsert(babyId, day, grams, userId);
        return new WeightPoint(day, grams);
    }

    /** Suppression idempotente (D12-D′) : 204 systématique, supprime 0 ou 1 ligne. */
    @Transactional
    public void delete(UUID userId, UUID babyId, String dateParam) {
        requireLinked(userId, babyId);
        LocalDate day = resolveWritableDate(dateParam);
        weightRepository.deleteByKey(babyId, day);
    }

    // --- Helpers ---

    private void requireLinked(UUID userId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(userId, babyId)) {
            throw new NotFoundException();
        }
    }

    /** Valeur en grammes : 0 < g ≤ 30000 (D12-B), sinon 400. */
    private int validateWeight(UpsertWeightRequest body) {
        if (body == null || body.weightGrams() == null) {
            throw new BadRequestException("Poids requis.");
        }
        int grams = body.weightGrams();
        if (grams <= 0 || grams > MAX_WEIGHT_GRAMS) {
            throw new BadRequestException("Poids invalide (attendu en grammes, 0 < g ≤ 30000).");
        }
        return grams;
    }

    /** Jour d'écriture : format invalide → 400 ; jour futur → 400 (D12-C′). */
    private LocalDate resolveWritableDate(String dateParam) {
        LocalDate day;
        try {
            day = LocalDate.parse(dateParam);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new BadRequestException("Date invalide (format attendu YYYY-MM-DD).");
        }
        if (day.isAfter(LocalDate.now(PARIS))) {
            throw new BadRequestException("Impossible de noter un poids pour un jour futur.");
        }
        return day;
    }
}
