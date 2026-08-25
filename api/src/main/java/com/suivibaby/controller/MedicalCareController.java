package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateMedicalCareRequest;
import com.suivibaby.model.MedicalCarePage;
import com.suivibaby.model.MedicalCareResponse;
import com.suivibaby.model.UpdateMedicalCareRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.MedicalCareService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/medical-cares")
@Authenticated
public class MedicalCareController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    MedicalCareService medicalCareService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateMedicalCareRequest request) {
        AppUser currentUser = currentUserResolver.require();
        // No tolerance for a missing body, like TemperatureController: the care type is mandatory.
        if (request == null) {
            throw new BadRequestException("Corps de requête requis.");
        }
        MedicalCareResponse created = medicalCareService.create(currentUser.id, babyId, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public MedicalCarePage list(@PathParam("babyId") UUID babyId,
                                @QueryParam("limit") @DefaultValue("20") int limit,
                                @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return medicalCareService.list(currentUser.id, babyId, limit, before);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public MedicalCareResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                                      UpdateMedicalCareRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return medicalCareService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        medicalCareService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
