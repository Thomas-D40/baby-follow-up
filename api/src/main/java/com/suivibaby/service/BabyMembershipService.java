package com.suivibaby.service;

import com.suivibaby.entity.AppUser;
import com.suivibaby.entity.BabyCaregiver;
import com.suivibaby.mapper.CaregiverMapper;
import com.suivibaby.model.CaregiverResponse;
import com.suivibaby.repository.AppUserRepository;
import com.suivibaby.repository.BabyCaregiverRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Gestion du cercle d'un bébé (Épic 8, Lot D/E) : lister les membres (D8-N), délier (D8-L) et
 * promouvoir en owner (D8-I). Porte le garde-fou transverse « dernier owner » (D8-M).
 */
@ApplicationScoped
public class BabyMembershipService {

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    @Inject
    AppUserRepository appUserRepository;

    @Inject
    CaregiverMapper caregiverMapper;

    /**
     * Liste bornée au cercle du bébé (D8-N) : tout caregiver lié peut la consulter. Non lié → 404
     * (exception assumée à l'isolation US1.5, jamais un annuaire global).
     */
    public List<CaregiverResponse> listCaregivers(UUID currentUserId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(currentUserId, babyId)) {
            throw new NotFoundException();
        }
        List<CaregiverResponse> result = new ArrayList<>();
        for (BabyCaregiver link : babyCaregiverRepository.listByBaby(babyId)) {
            AppUser user = appUserRepository.findById(link.appUserId);
            if (user != null) {
                result.add(caregiverMapper.toResponse(user, link.isOwner));
            }
        }
        return result;
    }

    /**
     * Délie un membre du cercle (D8-L) — owner uniquement. Refuse de retirer le dernier owner (D8-M)
     * → 409. Couvre le self-delink (un owner qui se retire lui-même) via le même garde.
     */
    @Transactional
    public void delink(UUID currentUserId, UUID babyId, UUID targetUserId) {
        requireOwner(currentUserId, babyId);
        BabyCaregiver target = babyCaregiverRepository.findLink(targetUserId, babyId);
        if (target == null) {
            throw new NotFoundException(); // cible hors du cercle de CE bébé (IDOR) → 404
        }
        if (target.isOwner) {
            assertNotLastOwner(babyId);
        }
        babyCaregiverRepository.deleteLink(targetUserId, babyId);
    }

    /**
     * Promotion d'un membre en owner (D8-I) — owner uniquement. Idempotent si déjà owner.
     * Pas de rétrogradation en v1 : un body {@code isOwner=false} est refusé (400).
     */
    @Transactional
    public void promote(UUID currentUserId, UUID babyId, UUID targetUserId, Boolean isOwner) {
        requireOwner(currentUserId, babyId);
        if (isOwner == null || !isOwner) {
            // v1 : seule la promotion est exposée (D8-I) ; la rétrogradation est hors périmètre (§5).
            throw new ClientErrorException(
                    "Seule la promotion en owner est supportée.", Response.Status.BAD_REQUEST);
        }
        BabyCaregiver target = babyCaregiverRepository.findLink(targetUserId, babyId);
        if (target == null) {
            throw new NotFoundException(); // cible hors du cercle de CE bébé (IDOR) → 404
        }
        target.isOwner = true; // flush sur commit (entité managée)
    }

    private void requireOwner(UUID currentUserId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(currentUserId, babyId)) {
            throw new NotFoundException(); // 404 : non lié (anti-énumération US1.5)
        }
        if (!babyCaregiverRepository.isOwner(currentUserId, babyId)) {
            throw new ForbiddenException("Action réservée aux owners."); // 403 : rôle
        }
    }

    /**
     * Garde-fou transverse (D8-M, Lot E) : on ne détruit jamais le dernier owner d'un bébé.
     * Appelé par tous les chemins de départ (délink, self-delink, future suppression de compte).
     */
    private void assertNotLastOwner(UUID babyId) {
        if (babyCaregiverRepository.countOwners(babyId) <= 1) {
            throw new ClientErrorException(
                    "Impossible de retirer le dernier owner : désignez un autre owner ou supprimez le bébé.",
                    Response.Status.CONFLICT);
        }
    }
}
