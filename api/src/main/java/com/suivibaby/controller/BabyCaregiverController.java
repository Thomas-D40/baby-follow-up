package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CaregiverResponse;
import com.suivibaby.model.UpdateCaregiverRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.BabyMembershipService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

/**
 * Gestion du cercle d'un bébé (Épic 8, Lot D) : lister (caregiver lié, D8-N), délier et promouvoir
 * (owner-only, D8-L/I). Le contrôle de rôle/isolation est porté par le service.
 */
@Path("/api/babies/{babyId}/caregivers")
@Authenticated
public class BabyCaregiverController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    BabyMembershipService babyMembershipService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<CaregiverResponse> list(@PathParam("babyId") UUID babyId) {
        AppUser currentUser = currentUserResolver.require();
        return babyMembershipService.listCaregivers(currentUser.id, babyId);
    }

    @DELETE
    @Path("/{userId}")
    public Response delink(@PathParam("babyId") UUID babyId, @PathParam("userId") UUID userId) {
        AppUser currentUser = currentUserResolver.require();
        babyMembershipService.delink(currentUser.id, babyId, userId);
        return Response.noContent().build(); // 204
    }

    @PATCH
    @Path("/{userId}")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response promote(@PathParam("babyId") UUID babyId, @PathParam("userId") UUID userId,
                            UpdateCaregiverRequest request) {
        AppUser currentUser = currentUserResolver.require();
        babyMembershipService.promote(currentUser.id, babyId, userId,
                request == null ? null : request.isOwner());
        return Response.noContent().build(); // 204
    }
}
