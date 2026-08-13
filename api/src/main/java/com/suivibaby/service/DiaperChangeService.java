package com.suivibaby.service;

import com.suivibaby.model.CreateDiaperChangeRequest;
import com.suivibaby.model.CreateStoolRequest;
import com.suivibaby.model.CreateUrineRequest;
import com.suivibaby.model.DiaperChangeResponse;
import com.suivibaby.model.StoolResponse;
import com.suivibaby.model.UrineResponse;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;

import java.util.UUID;

@ApplicationScoped
public class DiaperChangeService {

    @Inject
    UrineService urineService;

    @Inject
    StoolService stoolService;

    /**
     * Crée urine et/ou selle en une seule transaction : les deux ou aucun.
     * Si la 2ᵉ création échoue (ex. bébé non lié → 404), la 1ʳᵉ est rollback,
     * donc pas de moitié orpheline ni de doublon partiel.
     */
    @Transactional
    public DiaperChangeResponse create(UUID userId, UUID babyId, CreateDiaperChangeRequest request) {
        if (!request.withUrine() && !request.withStool()) {
            throw new BadRequestException("Acte de change vide : au moins urine ou selle est requis.");
        }
        if (request.consistency() != null && !request.withStool()) {
            throw new BadRequestException("Consistance renseignée sans selle.");
        }

        UrineResponse urine = request.withUrine()
                ? urineService.create(userId, babyId, new CreateUrineRequest(request.occurredAt()))
                : null;
        StoolResponse stool = request.withStool()
                ? stoolService.create(userId, babyId, new CreateStoolRequest(request.occurredAt(), request.consistency()))
                : null;

        return new DiaperChangeResponse(urine, stool);
    }
}
