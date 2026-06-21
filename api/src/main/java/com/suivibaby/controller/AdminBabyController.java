package com.suivibaby.controller;

import com.suivibaby.model.LinkCaregiverRequest;
import com.suivibaby.service.CaregiverService;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

/** Parent↔baby linking by the admin (US1.4). Restricted to {@code role=admin} (403 otherwise). */
@Path("/api/admin/babies")
@RolesAllowed("admin")
public class AdminBabyController {

    @Inject
    CaregiverService caregivers;

    @POST
    @Path("/{babyId}/caregivers")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response link(@PathParam("babyId") UUID babyId, LinkCaregiverRequest request) {
        caregivers.link(request.userId(), babyId);
        return Response.noContent().build(); // 204, idempotent
    }
}
