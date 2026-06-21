package com.suivibaby.service;

import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.NotFoundException;

import java.util.UUID;

/**
 * Parent↔baby linking (US1.4) and membership test (US1.5). Single "baby" authorization point
 * reused by all endpoints of the following epics.
 */
@ApplicationScoped
public class CaregiverService {

    @Inject
    AppUserRepository users;

    @Inject
    BabyRepository babies;

    @Inject
    BabyCaregiverRepository caregivers;

    /**
     * Links a parent to a baby. Idempotent. 404 if the parent or the baby does not exist.
     */
    @Transactional
    public void link(UUID userId, UUID babyId) {
        if (users.findById(userId) == null) {
            throw new NotFoundException("Utilisateur introuvable.");
        }
        if (babies.findById(babyId) == null) {
            throw new NotFoundException("Bébé introuvable.");
        }
        caregivers.linkIdempotent(userId, babyId);
    }

    public boolean isLinked(UUID userId, UUID babyId) {
        return caregivers.isLinked(userId, babyId);
    }
}
