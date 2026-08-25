package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateTemperatureRequest;
import com.suivibaby.model.TemperaturePage;
import com.suivibaby.model.TemperatureResponse;
import com.suivibaby.model.UpdateTemperatureRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.TemperatureService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/temperatures")
@Authenticated
public class TemperatureController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    TemperatureService temperatureService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateTemperatureRequest request) {
        AppUser currentUser = currentUserResolver.require();
        // No tolerance for a missing body here, unlike UrineController: the reading carries a
        // mandatory value, so an empty request can only be a client bug — reject it loudly.
        if (request == null) {
            throw new BadRequestException("Corps de requête requis.");
        }
        TemperatureResponse created = temperatureService.create(currentUser.id, babyId, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public TemperaturePage list(@PathParam("babyId") UUID babyId,
                                @QueryParam("limit") @DefaultValue("20") int limit,
                                @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return temperatureService.list(currentUser.id, babyId, limit, before);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public TemperatureResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                                      UpdateTemperatureRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return temperatureService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        temperatureService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
