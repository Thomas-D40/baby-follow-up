package com.suivibaby.service;

import com.suivibaby.entity.BabyInvitation;
import com.suivibaby.model.CreateInvitationResponse;
import com.suivibaby.repository.BabyCaregiverRepository;
import com.suivibaby.repository.BabyInvitationRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.ClientErrorException;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

/**
 * Émission et acceptation des invitations de partage (Épic 8). Le token EST le secret porteur
 * (bearer link, D8-B) : mitigé par expiration 3j + usage unique + acceptation en non-owner (D8-C/F).
 */
@ApplicationScoped
public class InvitationService {

    @ConfigProperty(name = "app.invitation.base-url", defaultValue = "http://localhost:5173")
    String invitationBaseUrl;

    @ConfigProperty(name = "app.invitation.ttl-days", defaultValue = "3")
    long ttlDays;

    @Inject
    BabyInvitationRepository babyInvitationRepository;

    @Inject
    BabyCaregiverRepository babyCaregiverRepository;

    /**
     * Émet une invitation pour {@code babyId}. Double garde (D8-J, Lot B) :
     * non lié → 404 (anti-énumération US1.5), lié mais non-owner → 403 (contrôle de rôle).
     */
    @Transactional
    public CreateInvitationResponse create(UUID currentUserId, UUID babyId) {
        if (!babyCaregiverRepository.isLinked(currentUserId, babyId)) {
            throw new NotFoundException(); // 404 : on ne révèle pas l'existence d'un bébé non lié
        }
        if (!babyCaregiverRepository.isOwner(currentUserId, babyId)) {
            throw new ForbiddenException("Seul un owner peut partager ce bébé."); // 403 : rôle
        }

        // L'index partiel n'autorise qu'une invit active par bébé : la régénération invalide la précédente.
        babyInvitationRepository.invalidateActiveInvitations(babyId, Instant.now());

        BabyInvitation invitation = new BabyInvitation();
        invitation.token = UUID.randomUUID();
        invitation.babyId = babyId;
        invitation.createdBy = currentUserId;
        invitation.expiresAt = Instant.now().plus(ttlDays, ChronoUnit.DAYS);
        invitation.usedAt = null;
        invitation.acceptedBy = null;
        babyInvitationRepository.persist(invitation);

        return new CreateInvitationResponse(invitation.token, buildLink(invitation.token), invitation.expiresAt);
    }

    /**
     * Accepte une invitation : lie l'utilisateur courant au bébé en NON-OWNER explicite (D8-F/R5).
     * Refuse token inexistant/expiré/déjà utilisé → 410. Auto-invitation (déjà lié) → 409 explicite,
     * sans consommer le token (il reste utilisable par le destinataire réel).
     */
    @Transactional
    public void accept(UUID currentUserId, String rawToken) {
        BabyInvitation invitation = loadValidInvitation(rawToken);

        if (babyCaregiverRepository.isLinked(currentUserId, invitation.babyId)) {
            // Auto-invitation / membre déjà présent : pas d'effet de bord trompeur, token non consommé.
            throw new ClientErrorException(
                    "Vous faites déjà partie du cercle de ce bébé.", Response.Status.CONFLICT);
        }

        // is_owner = false EXPLICITE : un lien fuité ne donne jamais qu'un caregiver (D8-F/R5).
        babyCaregiverRepository.linkIdempotent(currentUserId, invitation.babyId, false);
        invitation.usedAt = Instant.now();
        invitation.acceptedBy = currentUserId;
        // persisté via dirty checking (entité managée dans la transaction)
    }

    /**
     * Révocation admin-only des invitations en attente d'un bébé (D8-K). Le parent-facing s'appuie
     * sur l'expiration 3j / la régénération ; l'admin garde la main explicite via AdminBabyController.
     * Marque {@code used_at} (sans {@code accepted_by}) pour les sortir de l'index actif.
     */
    @Transactional
    public long revokeActiveInvitations(UUID babyId) {
        return babyInvitationRepository.invalidateActiveInvitations(babyId, Instant.now());
    }

    private BabyInvitation loadValidInvitation(String rawToken) {
        UUID id;
        try {
            id = UUID.fromString(rawToken);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw gone();
        }
        BabyInvitation invitation = babyInvitationRepository.findById(id);
        if (invitation == null || invitation.isConsumed() || invitation.isExpired(Instant.now())) {
            throw gone();
        }
        return invitation;
    }

    private ClientErrorException gone() {
        return new ClientErrorException(
                "Lien d'invitation invalide ou expiré ; demandez un nouveau lien.",
                Response.Status.GONE);
    }

    private String buildLink(UUID token) {
        return invitationBaseUrl + "/invite?token=" + token;
    }
}
