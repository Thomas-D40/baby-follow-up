package com.suivibaby.service;

import com.suivibaby.model.CareType;
import com.suivibaby.model.CreateMedicalCareActRequest;
import com.suivibaby.model.CreateMedicalCareRequest;
import com.suivibaby.model.MedicalCareActResponse;
import com.suivibaby.model.MedicalCareResponse;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;

import java.util.UUID;

// Composite act: neither entity nor table of its own, it only delegates twice to MedicalCareService.
//
// Why this route exists: one user gesture must be one request, so the front has a SINGLE button to
// disable and a SINGLE error state to render. Two parallel calls would give a half-failure the UI
// cannot express, and a re-submit on the surviving half would duplicate it.
// ⚠ It does NOT close any anti-duplicate hole: this project has no idempotency key and apiSend has no
// timeout — a retried request still creates new rows. What it buys is atomicity, nothing else.
//
// Atomicity is CREATE-ONLY: PATCH and DELETE go through the medical-cares resource, per row, and
// therefore split the pair. That is intended — correcting the time of one care must not move the other.
@ApplicationScoped
public class MedicalCareActService {

    @Inject
    MedicalCareService medicalCareService;

    // Both or neither: if the second create fails (e.g. baby not linked → 404), the first is rolled
    // back, so no orphan half is left behind.
    @Transactional
    public MedicalCareActResponse create(UUID userId, UUID babyId, CreateMedicalCareActRequest request) {
        if (!request.withEye() && !request.withNose()) {
            throw new BadRequestException("Acte médical vide : au moins un soin (yeux ou nez) est requis.");
        }

        MedicalCareResponse eye = request.withEye()
                ? medicalCareService.create(userId, babyId,
                        new CreateMedicalCareRequest(request.occurredAt(), CareType.eye))
                : null;
        MedicalCareResponse nose = request.withNose()
                ? medicalCareService.create(userId, babyId,
                        new CreateMedicalCareRequest(request.occurredAt(), CareType.nose))
                : null;

        return new MedicalCareActResponse(eye, nose);
    }
}
