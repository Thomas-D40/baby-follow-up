package com.suivibaby.controller;

import com.suivibaby.model.LinkCaregiverRequest;
import com.suivibaby.service.CaregiverService;
import com.suivibaby.service.InvitationService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/admin/babies")
@RolesAllowed("admin")
public class AdminBabyController {

    @Inject
    CaregiverService caregiverService;

    @Inject
    InvitationService invitationService;

    @POST
    @Path("/{babyId}/caregivers")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response link(@PathParam("babyId") UUID babyId, LinkCaregiverRequest request) {
        caregiverService.link(request.userId(), babyId);
        return Response.noContent().build(); // 204, idempotent
    }

    /** Révocation admin-only des invitations en attente d'un bébé (D8-K). 204, idempotent. */
    @DELETE
    @Path("/{babyId}/invitations")
    public Response revokeInvitations(@PathParam("babyId") UUID babyId) {
        invitationService.revokeActiveInvitations(babyId);
        return Response.noContent().build(); // 204
    }
}
