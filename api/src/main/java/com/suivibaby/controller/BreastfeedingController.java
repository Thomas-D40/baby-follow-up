package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.BreastfeedingPage;
import com.suivibaby.model.BreastfeedingResponse;
import com.suivibaby.model.CreateBreastfeedingRequest;
import com.suivibaby.model.UpdateBreastfeedingRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.BreastfeedingService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/breastfeedings")
@Authenticated
public class BreastfeedingController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    BreastfeedingService breastfeedingService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateBreastfeedingRequest request) {
        AppUser currentUser = currentUserResolver.require();
        BreastfeedingResponse created = breastfeedingService.create(currentUser.id, babyId,
                request == null ? new CreateBreastfeedingRequest(null, null, null) : request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public BreastfeedingPage list(@PathParam("babyId") UUID babyId,
                                  @QueryParam("limit") @DefaultValue("20") int limit,
                                  @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return breastfeedingService.list(currentUser.id, babyId, limit, before);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public BreastfeedingResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                                        UpdateBreastfeedingRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return breastfeedingService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        breastfeedingService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
