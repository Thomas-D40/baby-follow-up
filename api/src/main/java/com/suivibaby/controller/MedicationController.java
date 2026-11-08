package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateMedicationRequest;
import com.suivibaby.model.MedicationPage;
import com.suivibaby.model.MedicationResponse;
import com.suivibaby.model.UpdateMedicationRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.MedicationService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/medications")
@Authenticated
public class MedicationController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    MedicationService medicationService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateMedicationRequest request) {
        AppUser currentUser = currentUserResolver.require();
        MedicationResponse created = medicationService.create(currentUser.id, babyId, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public MedicationPage list(@PathParam("babyId") UUID babyId,
                               @QueryParam("limit") @DefaultValue("20") int limit,
                               @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return medicationService.list(currentUser.id, babyId, limit, before);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public MedicationResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                                     UpdateMedicationRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return medicationService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        medicationService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
