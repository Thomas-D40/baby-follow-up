package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateMedicalCareActRequest;
import com.suivibaby.model.MedicalCareActResponse;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.MedicalCareActService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/medical-care-acts")
@Authenticated
public class MedicalCareActController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    MedicalCareActService medicalCareActService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateMedicalCareActRequest request) {
        AppUser currentUser = currentUserResolver.require();
        if (request == null) {
            throw new BadRequestException("Corps de requête requis.");
        }
        MedicalCareActResponse created = medicalCareActService.create(currentUser.id, babyId, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }
}
