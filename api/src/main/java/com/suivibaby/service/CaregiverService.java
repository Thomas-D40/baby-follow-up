package com.suivibaby.service;

import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.NotFoundException;

import java.util.UUID;

@ApplicationScoped
public class CaregiverService {

    @Inject
    AppUserRepository appUserRepository;

    @Inject
    BabyRepository babyRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Transactional
    public void link(UUID userId, UUID babyId) {
        if (appUserRepository.findById(userId) == null) {
            throw new NotFoundException("Utilisateur introuvable.");
        }
        if (babyRepository.findById(babyId) == null) {
            throw new NotFoundException("Bébé introuvable.");
        }
        babyCaregiverRepository.linkIdempotent(userId, babyId);
    }

    public boolean isLinked(UUID userId, UUID babyId) {
        return babyCaregiverRepository.isLinked(userId, babyId);
    }
}
