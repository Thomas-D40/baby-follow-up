package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateUrineRequest;
import com.suivibaby.model.UrinePage;
import com.suivibaby.model.UrineResponse;
import com.suivibaby.model.UpdateUrineRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.UrineService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/urines")
@Authenticated
public class UrineController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    UrineService urineService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateUrineRequest request) {
        AppUser currentUser = currentUserResolver.require();
        UrineResponse created = urineService.create(currentUser.id, babyId,
                request == null ? new CreateUrineRequest(null) : request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public UrinePage list(@PathParam("babyId") UUID babyId,
                          @QueryParam("limit") @DefaultValue("20") int limit,
                          @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return urineService.list(currentUser.id, babyId, limit, before);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public UrineResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                                UpdateUrineRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return urineService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        urineService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
