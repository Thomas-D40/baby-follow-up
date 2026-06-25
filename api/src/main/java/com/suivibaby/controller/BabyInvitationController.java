package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateInvitationResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.InvitationService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

/**
 * Émission d'une invitation de partage (Épic 8, Lot B). Owner-only (vérifié dans le service :
 * non lié → 404, lié mais non-owner → 403).
 */
@Path("/api/babies/{babyId}/invitations")
@Authenticated
public class BabyInvitationController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    InvitationService invitationService;

    @POST
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId) {
        AppUser currentUser = currentUserResolver.require();
        CreateInvitationResponse created = invitationService.create(currentUser.id, babyId);
        return Response.status(Response.Status.CREATED).entity(created).build(); // 201
    }
}
